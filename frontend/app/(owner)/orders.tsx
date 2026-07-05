import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function OwnerOrders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([api.get('/orders'), api.get('/couriers')]);
      setOrders(o.data);
      setCouriers(c.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_owner_orders')}</Text>
        <View style={styles.subBadge}>
          <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
          <Text style={styles.subBadgeTxt}>{t('subscriptionActive')}</Text>
        </View>
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
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.customer_name}</Text>
                <Text style={styles.cardSub}>{item.items.length} items · ₺{item.total.toFixed(2)}</Text>
              </View>
              <Text style={styles.statusTag}>{t(`status_${item.status}` as any)}</Text>
            </View>
            <Text style={styles.addr}><Ionicons name="location-outline" size={12} /> {item.delivery_address}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  subBadge: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#E8F7EC', paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  subBadgeTxt: { color: theme.colors.success, fontWeight: '700', fontSize: theme.font.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.lg },
  statNum: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.brand },
  statLbl: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  card: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  cardSub: { color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  statusTag: { color: theme.colors.brand, fontWeight: '700', fontSize: theme.font.sm },
  addr: { color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.xs, fontSize: theme.font.sm },
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
  modalRowTxt: { fontSize: theme.font.lg, fontWeight: '600', color: theme.colors.onSurface },
});
