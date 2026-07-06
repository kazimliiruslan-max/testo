import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';
import { openLocation } from '@/src/utils/maps';
import { useOrderEvents } from '@/src/hooks/useOrderEvents';

export default function OwnerOrders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [newOrderBanner, setNewOrderBanner] = useState<any>(null);
  const [deliveredBanner, setDeliveredBanner] = useState<any>(null);
  const bannerAnim = useRef(new Animated.Value(-100)).current;
  const deliveredAnim = useRef(new Animated.Value(-100)).current;
  const knownIds = useRef<Set<string>>(new Set());
  const knownStatuses = useRef<Record<string, string>>({});
  const firstLoad = useRef(true);

  const load = useCallback(async (isPoll = false) => {
    try {
      const [o, c] = await Promise.all([api.get('/orders'), api.get('/couriers')]);
      const newOrders = o.data as any[];

      if (firstLoad.current) {
        knownIds.current = new Set(newOrders.map((n) => n.id));
        newOrders.forEach((n) => { knownStatuses.current[n.id] = n.status; });
        firstLoad.current = false;
      } else {
        // Detect new pending orders
        const fresh = newOrders.find((n) => n.status === 'pending' && !knownIds.current.has(n.id));
        // Detect just-delivered orders
        const justDelivered = newOrders.find((n) =>
          n.status === 'delivered' && knownStatuses.current[n.id] && knownStatuses.current[n.id] !== 'delivered'
        );
        newOrders.forEach((n) => { knownIds.current.add(n.id); knownStatuses.current[n.id] = n.status; });

        if (fresh) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setNewOrderBanner(fresh);
          Animated.sequence([
            Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.delay(3000),
            Animated.timing(bannerAnim, { toValue: -100, duration: 300, useNativeDriver: true }),
          ]).start(() => setNewOrderBanner(null));
        }
        if (justDelivered) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setDeliveredBanner(justDelivered);
          Animated.sequence([
            Animated.timing(deliveredAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.delay(3500),
            Animated.timing(deliveredAnim, { toValue: -100, duration: 300, useNativeDriver: true }),
          ]).start(() => setDeliveredBanner(null));
        }
      }
      setOrders(newOrders);
      setCouriers(c.data);
    } catch {
      // ignore — auth failures / offline; retry on next poll
    } finally {
      if (!isPoll) { setLoading(false); setRefreshing(false); }
    }
  }, [bannerAnim, deliveredAnim]);

  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(() => load(true), 6000);
    return () => clearInterval(iv);
  }, [load]));

  // Real-time updates
  useOrderEvents((msg) => {
    if (msg?.type === 'order_new' || msg?.type === 'order_status') {
      load(true);
    }
  }, true);

  const setStatus = async (oid: string, status: string) => {
    await api.post(`/orders/${oid}/status`, { status });
    load();
  };
  const assign = async (oid: string, cid: string) => {
    await api.post(`/orders/${oid}/assign`, { courier_id: cid });
    setAssignFor(null);
    load();
  };

  const active = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.banner, { transform: [{ translateY: bannerAnim }] }]} pointerEvents="none">
        <Ionicons name="notifications" size={20} color="#fff" />
        <Text style={styles.bannerTxt}>{t('newOrder')} · {newOrderBanner?.customer_name} · ₺{newOrderBanner?.total?.toFixed(2)}</Text>
      </Animated.View>

      <Animated.View style={[styles.banner, styles.deliveredBanner, { transform: [{ translateY: deliveredAnim }] }]} pointerEvents="none">
        <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
        <Text style={styles.bannerTxt}>{t('deliveredBannerOwner')} · {deliveredBanner?.customer_name}</Text>
      </Animated.View>

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('tab_owner_orders')}</Text>
          <View style={styles.subBadge}>
            <Ionicons name="checkmark-circle" size={14} color={theme.colors.brandDark} />
            <Text style={styles.subBadgeTxt}>{t('subscriptionActive')}</Text>
          </View>
        </View>
        {pendingCount > 0 && (
          <View testID="pending-badge" style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeTxt}>{pendingCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{active.length}</Text>
          <Text style={styles.statLbl}>{t('activeOrders')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{couriers.length}</Text>
          <Text style={styles.statLbl}>{t('totalCouriers')}</Text>
        </View>
      </View>

      <FlatList
        testID="owner-orders-list"
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        renderItem={({ item }) => (
          <View style={[styles.card, item.status === 'pending' && styles.cardPending]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.customer_name}</Text>
                <Text style={styles.cardSub}>{item.items.length} items · ₺{item.total.toFixed(2)}</Text>
              </View>
              <Text style={styles.statusTag}>{t(`status_${item.status}` as any)}</Text>
            </View>
            <Pressable
              testID={`owner-open-map-${item.id}`}
              onPress={() => openLocation(item.delivery_lat, item.delivery_lng, item.customer_name)}
              style={styles.addrRow}
            >
              <Ionicons name="location-outline" size={14} color={theme.colors.brandDark} />
              <Text style={styles.addr} numberOfLines={2}>{item.delivery_address}</Text>
              <View style={styles.openMapBtn}>
                <Ionicons name="map" size={12} color="#fff" />
                <Text style={styles.openMapTxt}>Map</Text>
              </View>
            </Pressable>
            {item.customer_phone && <Text style={styles.phone}>📞 {item.customer_phone}</Text>}
            {item.courier_name && <Text style={styles.courierTag}>🛵 {item.courier_name}</Text>}
            <View style={styles.actions}>
              {item.status === 'pending' && (
                <Pressable testID={`accept-${item.id}`} onPress={() => setStatus(item.id, 'accepted')} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>{t('accept')}</Text>
                </Pressable>
              )}
              {item.status === 'accepted' && (
                <Pressable testID={`prep-${item.id}`} onPress={() => setStatus(item.id, 'preparing')} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>{t('startPreparing')}</Text>
                </Pressable>
              )}
              {item.status === 'preparing' && !item.courier_id && (
                <Pressable testID={`assign-btn-${item.id}`} onPress={() => setAssignFor(item.id)} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>{t('assignCourier')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTxt}>No orders yet</Text></View>}
      />

      <Modal visible={!!assignFor} transparent animationType="fade" onRequestClose={() => setAssignFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setAssignFor(null)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('assignCourier')}</Text>
            {couriers.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.md }}>No couriers</Text>
            ) : couriers.map((c) => (
              <Pressable
                key={c.id}
                testID={`assign-courier-${c.id}`}
                onPress={() => assign(assignFor!, c.id)}
                style={styles.modalRow}
              >
                <Ionicons name="bicycle" size={20} color={theme.colors.brand} />
                <Text style={styles.modalRowTxt}>{c.name}</Text>
                {c.lat != null && <View style={styles.liveDot} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.colors.brand, padding: theme.spacing.md, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, zIndex: 100 },
  bannerTxt: { color: '#fff', fontWeight: '700', flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  subBadge: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill, marginTop: 4, alignSelf: 'flex-start' },
  subBadgeTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
  pendingBadge: { minWidth: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  pendingBadgeTxt: { color: '#fff', fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.lg },
  statNum: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.brandDark },
  statLbl: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  card: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  cardPending: { borderLeftColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  cardSub: { color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  statusTag: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
  addr: { flex: 1, color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.xs, paddingVertical: 4 },
  openMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  openMapTxt: { color: '#fff', fontWeight: '700', fontSize: 11 },
  phone: { color: theme.colors.onSurfaceSecondary, marginTop: 2, fontSize: theme.font.sm },
  courierTag: { color: theme.colors.onSurface, marginTop: 4, fontSize: theme.font.sm, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill },
  actionTxt: { color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { color: theme.colors.onSurfaceTertiary },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: theme.spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface, marginBottom: theme.spacing.md },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm },
  modalRowTxt: { flex: 1, fontSize: theme.font.lg, fontWeight: '600', color: theme.colors.onSurface },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brand },
});
