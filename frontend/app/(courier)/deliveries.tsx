import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function CourierDeliveries() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (oid: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await api.post(`/orders/${oid}/status`, { status });
    load();
  };

  const updateLoc = async () => {
    // Mock: nudge lat/lng slightly (in real app, use expo-location)
    const lat = 41.037 + (Math.random() - 0.5) * 0.01;
    const lng = 28.986 + (Math.random() - 0.5) * 0.01;
    await api.post('/couriers/me/location', { lat, lng });
    setLocMsg(t('myLocationUpdated'));
    setTimeout(() => setLocMsg(null), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_courier_deliveries')}</Text>
      </View>
      <Pressable testID="update-location-btn" onPress={updateLoc} style={styles.locBtn}>
        <Ionicons name="locate" size={18} color="#fff" />
        <Text style={styles.locBtnTxt}>{t('updateLocation')}</Text>
      </Pressable>
      {locMsg && <Text style={styles.locMsg}>{locMsg}</Text>}

      {loading ? <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          testID="courier-orders-list"
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.rest}>{item.restaurant_name}</Text>
                <Text style={styles.statusTxt}>{t(`status_${item.status}` as any)}</Text>
              </View>
              <Text style={styles.cust}>👤 {item.customer_name}</Text>
              <Text style={styles.addr}>📍 {item.delivery_address}</Text>
              <Text style={styles.total}>₺{item.total.toFixed(2)} · Cash</Text>
              <View style={styles.actions}>
                {item.status !== 'delivered' && (
                  <>
                    <Pressable testID={`courier-otw-${item.id}`} onPress={() => setStatus(item.id, 'out_for_delivery')} style={[styles.actBtn, item.status === 'out_for_delivery' && styles.actBtnActive]}>
                      <Text style={[styles.actTxt, item.status === 'out_for_delivery' && styles.actTxtActive]}>{t('onTheWay')}</Text>
                    </Pressable>
                    <Pressable testID={`courier-delivered-${item.id}`} onPress={() => setStatus(item.id, 'delivered')} style={[styles.actBtn, { backgroundColor: theme.colors.success }]}>
                      <Text style={[styles.actTxt, { color: '#fff' }]}>{t('delivered')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="bicycle-outline" size={48} color={theme.colors.onSurfaceTertiary} /><Text style={styles.emptyTxt}>{t('noDeliveries')}</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.brand, marginHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderRadius: theme.radius.pill, justifyContent: 'center', marginBottom: theme.spacing.md },
  locBtnTxt: { color: '#fff', fontWeight: '700', fontSize: theme.font.base },
  locMsg: { color: theme.colors.success, textAlign: 'center', marginBottom: theme.spacing.sm, fontWeight: '600' },
  card: { padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rest: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  statusTxt: { color: theme.colors.brand, fontWeight: '700', fontSize: theme.font.sm },
  cust: { color: theme.colors.onSurfaceSecondary, marginTop: theme.spacing.xs },
  addr: { color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  total: { color: theme.colors.onSurface, fontWeight: '700', marginTop: theme.spacing.xs },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actBtn: { flex: 1, backgroundColor: theme.colors.surface, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  actBtnActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  actTxt: { fontWeight: '700', color: theme.colors.onSurface, fontSize: theme.font.sm },
  actTxtActive: { color: '#fff' },
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary },
});
