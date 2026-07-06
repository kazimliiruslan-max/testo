import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';
import { openDirections } from '@/src/utils/maps';

type PermState = 'idle' | 'granted' | 'denied' | 'blocked';

export default function CourierDeliveries() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [permState, setPermState] = useState<PermState>('idle');
  const [isSharing, setIsSharing] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    return () => { watcher.current?.remove(); };
  }, []);

  const setStatus = async (oid: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await api.post(`/orders/${oid}/status`, { status });
    load();
  };

  const pushLocation = async (lat: number, lng: number) => {
    try { await api.post('/couriers/me/location', { lat, lng }); } catch {}
  };

  const startSharingLocation = async () => {
    // Web fallback: use browser geolocation once
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await pushLocation(pos.coords.latitude, pos.coords.longitude);
            setLocMsg(t('gpsShared'));
            setTimeout(() => setLocMsg(null), 2500);
            setPermState('granted');
            setIsSharing(true);
          },
          () => { setPermState('denied'); },
          { enableHighAccuracy: true }
        );
      } else {
        // Fallback demo nudge
        const lat = 41.037 + (Math.random() - 0.5) * 0.01;
        const lng = 28.986 + (Math.random() - 0.5) * 0.01;
        await pushLocation(lat, lng);
        setLocMsg(t('myLocationUpdated'));
        setTimeout(() => setLocMsg(null), 2500);
      }
      return;
    }

    // Native: request permission first
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermState(canAskAgain ? 'denied' : 'blocked');
      return;
    }
    setPermState('granted');
    // One-shot first push
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await pushLocation(pos.coords.latitude, pos.coords.longitude);
    setLocMsg(t('gpsShared'));
    setTimeout(() => setLocMsg(null), 2500);
    // Start watching
    watcher.current?.remove();
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
      (loc) => pushLocation(loc.coords.latitude, loc.coords.longitude),
    );
    setIsSharing(true);
  };

  const stopSharing = () => {
    watcher.current?.remove();
    watcher.current = null;
    setIsSharing(false);
    setLocMsg('Sharing stopped');
    setTimeout(() => setLocMsg(null), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tab_courier_deliveries')}</Text>
        {isSharing && (
          <View style={styles.liveIndicator} testID="live-gps-indicator">
            <View style={styles.pulseDot} />
            <Text style={styles.liveTxt}>{t('live')}</Text>
          </View>
        )}
      </View>

      {!isSharing ? (
        <Pressable testID="update-location-btn" onPress={startSharingLocation} style={styles.locBtn}>
          <Ionicons name="locate" size={18} color="#fff" />
          <Text style={styles.locBtnTxt}>{t('updateLocation')}</Text>
        </Pressable>
      ) : (
        <Pressable testID="stop-sharing-btn" onPress={stopSharing} style={[styles.locBtn, styles.stopBtn]}>
          <Ionicons name="stop-circle-outline" size={18} color="#fff" />
          <Text style={styles.locBtnTxt}>Stop sharing GPS</Text>
        </Pressable>
      )}
      {locMsg && <Text style={styles.locMsg}>{locMsg}</Text>}

      {permState === 'blocked' && (
        <View style={styles.permCard}>
          <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
          <Text style={styles.permTxt}>{t('locationPermissionDenied')}</Text>
          <Pressable onPress={() => Linking.openSettings()} style={styles.permBtn}>
            <Text style={styles.permBtnTxt}>{t('openSettings')}</Text>
          </Pressable>
        </View>
      )}
      {permState === 'denied' && (
        <Text style={styles.permWarn}>{t('locationPermissionDenied')}</Text>
      )}

      {loading ? <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          testID="courier-orders-list"
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => (
            <View style={[styles.card, item.status === 'out_for_delivery' && styles.cardActive]}>
              <View style={styles.top}>
                <Text style={styles.rest}>{item.restaurant_name}</Text>
                <Text style={styles.statusTxt}>{t(`status_${item.status}` as any)}</Text>
              </View>
              <Text style={styles.cust}>👤 {item.customer_name}{item.customer_phone ? ` · ${item.customer_phone}` : ''}</Text>
              <Text style={styles.addr} numberOfLines={2}>📍 {item.delivery_address}</Text>
              <Text style={styles.total}>₺{item.total.toFixed(2)} · Cash</Text>

              {item.status !== 'delivered' && item.status !== 'cancelled' && item.delivery_lat != null && (
                <Pressable
                  testID={`courier-navigate-${item.id}`}
                  onPress={() => openDirections(item.delivery_lat, item.delivery_lng, item.customer_name)}
                  style={styles.navBtn}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.navTxt}>{t('navigate')}</Text>
                </Pressable>
              )}

              <View style={styles.actions}>
                {item.status !== 'delivered' && item.status !== 'cancelled' && (
                  <>
                    {item.status !== 'out_for_delivery' && (
                      <Pressable testID={`courier-otw-${item.id}`} onPress={() => setStatus(item.id, 'out_for_delivery')} style={styles.actBtn}>
                        <Text style={styles.actTxt}>{t('onTheWay')}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      testID={`courier-delivered-${item.id}`}
                      onPress={() => setStatus(item.id, 'delivered')}
                      style={[styles.actBtn, { backgroundColor: theme.colors.brand, flex: item.status === 'out_for_delivery' ? 1 : undefined }]}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={[styles.actTxt, { color: '#fff', marginLeft: 4 }]}>{t('markDelivered')}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand },
  liveTxt: { color: theme.colors.brandDark, fontWeight: '800', fontSize: theme.font.sm },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.brand, marginHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderRadius: theme.radius.pill, justifyContent: 'center', marginBottom: theme.spacing.md },
  stopBtn: { backgroundColor: theme.colors.error },
  locBtnTxt: { color: '#fff', fontWeight: '700', fontSize: theme.font.base },
  locMsg: { color: theme.colors.brandDark, textAlign: 'center', marginBottom: theme.spacing.sm, fontWeight: '600' },
  permCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: '#FFF6E6', padding: theme.spacing.md, marginHorizontal: theme.spacing.lg, borderRadius: theme.radius.md, marginBottom: theme.spacing.md },
  permTxt: { flex: 1, color: theme.colors.onSurface, fontSize: theme.font.sm },
  permBtn: { backgroundColor: theme.colors.warning, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill },
  permBtnTxt: { color: '#fff', fontWeight: '700' },
  permWarn: { color: theme.colors.warning, marginHorizontal: theme.spacing.lg, textAlign: 'center', marginBottom: theme.spacing.md, fontSize: theme.font.sm },
  card: { padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  cardActive: { backgroundColor: theme.colors.brandTertiary, borderLeftWidth: 4, borderLeftColor: theme.colors.brand },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.brandDark, paddingVertical: 12, borderRadius: theme.radius.pill, marginTop: theme.spacing.md },
  navTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.base },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rest: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  statusTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
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
