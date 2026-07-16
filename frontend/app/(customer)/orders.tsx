import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { api, formatApiError } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { useCart } from '@/src/context/CartContext';
import { theme } from '@/src/theme';
import { StarRating } from '@/src/components/StarRating';

interface Order {
  id: string; restaurant_id: string; restaurant_name: string;
  total: number; status: string;
  created_at: string; items: any[]; courier_name?: string | null;
}

const statusColor: Record<string, string> = {
  pending: theme.colors.warning,
  accepted: '#5AC8FA',
  preparing: '#FF9500',
  out_for_delivery: theme.colors.brand,
  delivered: theme.colors.success,
  cancelled: theme.colors.error,
};

export default function CustomerOrders() {
  const router = useRouter();
  const { t } = useI18n();
  const { addBatch } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [tab, setTab] = useState<'ongoing' | 'past'>('ongoing');
  const [reviews, setReviews] = useState<Record<string, boolean>>({}); // order_id -> reviewed?
  const [reorderErr, setReorderErr] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Rate modal state
  const [rateOrder, setRateOrder] = useState<Order | null>(null);
  const [rateStars, setRateStars] = useState(5);
  const [rateComment, setRateComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [rateErr, setRateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // For past-tab delivered orders, check which have already been reviewed
  useEffect(() => {
    if (tab !== 'past') return;
    const pastDelivered = orders.filter((o) => o.status === 'delivered');
    (async () => {
      const updates: Record<string, boolean> = {};
      await Promise.all(pastDelivered.map(async (o) => {
        try {
          const r = await api.get(`/orders/${o.id}/review`);
          updates[o.id] = !!r.data;
        } catch { updates[o.id] = false; }
      }));
      if (Object.keys(updates).length) setReviews((s) => ({ ...s, ...updates }));
    })();
  }, [tab, orders]);

  const doCancel = async () => {
    if (!confirmCancelId) return;
    setCancelling(true);
    try {
      await api.post(`/orders/${confirmCancelId}/cancel`);
      setConfirmCancelId(null);
      load();
    } catch {}
    finally { setCancelling(false); }
  };

  const reorder = async (o: Order) => {
    setReorderingId(o.id);
    setReorderErr(null);
    try {
      // Refresh menu to make sure prices/availability are current
      const menuRes = await api.get(`/restaurants/${o.restaurant_id}/menu`);
      const menu: any[] = menuRes.data || [];
      const menuById = new Map<string, any>(menu.map((m) => [m.id, m]));
      const skipped: string[] = [];
      const cartItems: any[] = [];
      for (const it of (o.items || [])) {
        const m = menuById.get(it.menu_item_id);
        if (!m || m.available === false) {
          skipped.push(it.name);
          continue;
        }
        const priceNow = m.display_price ?? m.price ?? it.price;
        cartItems.push({
          menu_item_id: it.menu_item_id,
          name: m.name || it.name,
          price: priceNow,
          quantity: it.quantity || 1,
        });
      }
      if (cartItems.length === 0) {
        setReorderErr(t('reorderAllUnavailable'));
        return;
      }
      addBatch(o.restaurant_id, o.restaurant_name, cartItems);
      if (skipped.length) {
        setReorderErr(`${t('reorderSkipped')}: ${skipped.join(', ')}`);
        // still navigate — user can see the notice above
      }
      router.push('/(customer)/cart');
    } catch (e: any) {
      setReorderErr(formatApiError(e, t('error')));
    } finally {
      setReorderingId(null);
    }
  };

  const openRate = (o: Order) => {
    setRateOrder(o);
    setRateStars(5);
    setRateComment('');
    setRateErr(null);
  };

  const submitReview = async () => {
    if (!rateOrder) return;
    setSavingReview(true);
    setRateErr(null);
    try {
      await api.post('/reviews', {
        order_id: rateOrder.id,
        stars: rateStars,
        comment: rateComment.trim(),
      });
      setReviews((s) => ({ ...s, [rateOrder.id]: true }));
      setRateOrder(null);
    } catch (e: any) {
      setRateErr(formatApiError(e, t('error')));
    } finally {
      setSavingReview(false);
    }
  };

  const isOngoing = (s: string) => !['delivered', 'cancelled'].includes(s);
  const filteredOrders = orders.filter((o) => (tab === 'ongoing' ? isOngoing(o.status) : !isOngoing(o.status)));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}><Text style={styles.headerTitle}>{t('tab_orders')}</Text></View>
      <View style={styles.tabsRow}>
        <Pressable
          testID="tab-ongoing"
          onPress={() => setTab('ongoing')}
          style={[styles.tab, tab === 'ongoing' && styles.tabActive]}
        >
          <Text style={[styles.tabTxt, tab === 'ongoing' && styles.tabTxtActive]}>{t('ongoing')}</Text>
        </Pressable>
        <Pressable
          testID="tab-past"
          onPress={() => setTab('past')}
          style={[styles.tab, tab === 'past' && styles.tabActive]}
        >
          <Text style={[styles.tabTxt, tab === 'past' && styles.tabTxtActive]}>{t('past')}</Text>
        </Pressable>
      </View>
      {reorderErr ? (
        <View style={styles.errBanner}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
          <Text style={styles.errBannerTxt}>{reorderErr}</Text>
          <Pressable onPress={() => setReorderErr(null)} style={{ marginLeft: 'auto' }}>
            <Ionicons name="close" size={16} color={theme.colors.error} />
          </Pressable>
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          testID="orders-list"
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => {
            const canCancel = item.status === 'pending' || item.status === 'accepted';
            const isDelivered = item.status === 'delivered';
            const canReview = isDelivered && !reviews[item.id];
            const canReorder = isDelivered || item.status === 'cancelled';
            return (
              <View style={styles.card}>
                <Pressable
                  testID={`order-card-${item.id}`}
                  onPress={() => router.push(`/(customer)/tracking/${item.id}`)}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{item.restaurant_name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: `${statusColor[item.status]}22` }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor[item.status] }]} />
                      <Text style={[styles.statusTxt, { color: statusColor[item.status] }]}>
                        {t(`status_${item.status}` as any)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{item.items.length} items · ₺{item.total.toFixed(2)}</Text>
                  <View style={styles.cardFoot}>
                    <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
                    {!isDelivered && item.status !== 'cancelled' && (
                      <View style={styles.trackChip}>
                        <Ionicons name="location" size={14} color={theme.colors.brand} />
                        <Text style={styles.trackTxt}>{t('trackOrder')}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
                {canCancel && (
                  <Pressable
                    testID={`cancel-order-${item.id}`}
                    onPress={() => setConfirmCancelId(item.id)}
                    style={styles.cancelBtn}
                  >
                    <Ionicons name="close-circle-outline" size={16} color={theme.colors.error} />
                    <Text style={styles.cancelTxt}>{t('cancelOrder')}</Text>
                  </Pressable>
                )}
                {(canReview || canReorder) && (
                  <View style={styles.pastActions}>
                    {canReview && (
                      <Pressable
                        testID={`rate-order-${item.id}`}
                        onPress={() => openRate(item)}
                        style={[styles.pastBtn, styles.pastBtnRate]}
                      >
                        <Ionicons name="star" size={16} color={theme.colors.accent} />
                        <Text style={styles.pastBtnTxt}>{t('rateOrder')}</Text>
                      </Pressable>
                    )}
                    {isDelivered && reviews[item.id] && (
                      <View style={[styles.pastBtn, styles.pastBtnRated]}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.colors.brand} />
                        <Text style={[styles.pastBtnTxt, { color: theme.colors.brand }]}>{t('reviewSubmitted')}</Text>
                      </View>
                    )}
                    {canReorder && (
                      <Pressable
                        testID={`reorder-${item.id}`}
                        onPress={() => reorder(item)}
                        disabled={reorderingId === item.id}
                        style={[styles.pastBtn, styles.pastBtnReorder, reorderingId === item.id && { opacity: 0.6 }]}
                      >
                        {reorderingId === item.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="repeat" size={16} color="#fff" />
                            <Text style={[styles.pastBtnTxt, { color: '#fff' }]}>{t('reorder')}</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>{t('noOrders')}</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!confirmCancelId} transparent animationType="fade" onRequestClose={() => setConfirmCancelId(null)}>
        <Pressable style={styles.modalBg} onPress={() => setConfirmCancelId(null)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="alert-circle" size={40} color={theme.colors.warning} style={{ alignSelf: 'center' }} />
            <Text style={styles.confirmTitle}>{t('cancelOrder')}</Text>
            <Text style={styles.confirmDesc}>{t('confirmCancel')}</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirmCancelId(null)} style={[styles.confirmBtn, styles.confirmBtnKeep]}>
                <Text style={styles.confirmBtnTxt}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                testID="confirm-cancel-btn"
                onPress={doCancel}
                disabled={cancelling}
                style={[styles.confirmBtn, styles.confirmBtnGo]}
              >
                {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnGoTxt}>{t('cancelOrder')}</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!rateOrder} transparent animationType="slide" onRequestClose={() => setRateOrder(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBg} onPress={() => setRateOrder(null)}>
            <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.confirmTitle}>{t('rateOrder')}</Text>
              <Text style={styles.confirmDesc}>{rateOrder?.restaurant_name}</Text>
              <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
                <StarRating value={rateStars} onChange={setRateStars} size={36} testID="rate-stars" />
              </View>
              <TextInput
                testID="rate-comment-input"
                style={styles.commentInput}
                placeholder={t('reviewCommentPlaceholder')}
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                multiline
                numberOfLines={3}
                value={rateComment}
                onChangeText={setRateComment}
                maxLength={500}
              />
              {rateErr ? <Text style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 6 }}>{rateErr}</Text> : null}
              <View style={styles.confirmActions}>
                <Pressable onPress={() => setRateOrder(null)} style={[styles.confirmBtn, styles.confirmBtnKeep]}>
                  <Text style={styles.confirmBtnTxt}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  testID="submit-review-btn"
                  onPress={submitReview}
                  disabled={savingReview}
                  style={[styles.confirmBtn, { backgroundColor: theme.colors.brand }]}
                >
                  {savingReview ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{t('submit')}</Text>}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  tabsRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  tab: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.brand },
  tabTxt: { color: theme.colors.onSurface, fontWeight: '700' },
  tabTxtActive: { color: '#fff' },
  card: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, padding: theme.spacing.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface, flex: 1 },
  cardMeta: { color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.xs, fontSize: theme.font.base },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.md },
  date: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: theme.font.sm, fontWeight: '700' },
  trackChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackTxt: { color: theme.colors.brand, fontWeight: '700', fontSize: theme.font.sm },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.error },
  cancelTxt: { color: theme.colors.error, fontWeight: '700', fontSize: theme.font.sm },
  pastActions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  pastBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: theme.radius.pill },
  pastBtnRate: { backgroundColor: theme.colors.surfaceTertiary },
  pastBtnRated: { backgroundColor: theme.colors.brandTertiary },
  pastBtnReorder: { backgroundColor: theme.colors.brand },
  pastBtnTxt: { fontSize: theme.font.sm, fontWeight: '800', color: theme.colors.onSurface },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEAEA', paddingVertical: 8, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  errBannerTxt: { color: theme.colors.error, fontWeight: '700', fontSize: theme.font.sm, flexShrink: 1 },
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.base },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  modal: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: '100%', maxWidth: 380 },
  confirmTitle: { fontSize: theme.font.xl, fontWeight: '800', textAlign: 'center', marginTop: theme.spacing.md, color: theme.colors.onSurface },
  confirmDesc: { color: theme.colors.onSurfaceSecondary, textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  confirmActions: { flexDirection: 'row', gap: theme.spacing.md },
  confirmBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  confirmBtnKeep: { backgroundColor: theme.colors.surfaceSecondary },
  confirmBtnTxt: { fontWeight: '700', color: theme.colors.onSurface },
  confirmBtnGo: { backgroundColor: theme.colors.error },
  confirmBtnGoTxt: { color: '#fff', fontWeight: '700' },
  commentInput: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md, fontSize: theme.font.base, color: theme.colors.onSurface, minHeight: 80, textAlignVertical: 'top' },
});
