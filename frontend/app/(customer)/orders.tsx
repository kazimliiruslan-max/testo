import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

interface Order {
  id: string; restaurant_name: string; total: number; status: string;
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [tab, setTab] = useState<'ongoing' | 'past'>('ongoing');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
                    <View style={styles.trackChip}>
                      <Ionicons name="location" size={14} color={theme.colors.brand} />
                      <Text style={styles.trackTxt}>{t('trackOrder')}</Text>
                    </View>
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
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.base },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  modal: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: '100%', maxWidth: 340 },
  confirmTitle: { fontSize: theme.font.xl, fontWeight: '800', textAlign: 'center', marginTop: theme.spacing.md, color: theme.colors.onSurface },
  confirmDesc: { color: theme.colors.onSurfaceSecondary, textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  confirmActions: { flexDirection: 'row', gap: theme.spacing.md },
  confirmBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.radius.pill, alignItems: 'center' },
  confirmBtnKeep: { backgroundColor: theme.colors.surfaceSecondary },
  confirmBtnTxt: { fontWeight: '700', color: theme.colors.onSurface },
  confirmBtnGo: { backgroundColor: theme.colors.error },
  confirmBtnGoTxt: { color: '#fff', fontWeight: '700' },
});
