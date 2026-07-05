import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';
import OrderMap from '@/src/components/OrderMap';

const STATUSES = ['pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered'];

export default function TrackOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [order, setOrder] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [courierLoc, setCourierLoc] = useState<{ lat?: number; lng?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const o = await api.get(`/orders/${id}`);
      setOrder(o.data);
      const r = await api.get(`/restaurants/${o.data.restaurant_id}`);
      setRestaurant(r.data);
      if (o.data.courier_id) {
        try {
          const c = await api.get(`/couriers/${o.data.courier_id}/location`);
          setCourierLoc({ lat: c.data.lat, lng: c.data.lng });
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading || !order) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.brand} size="large" /></View>;
  }

  const statusIdx = STATUSES.indexOf(order.status);

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <OrderMap
          courierLat={courierLoc?.lat}
          courierLng={courierLoc?.lng}
          destLat={order.delivery_lat}
          destLng={order.delivery_lng}
          restaurantLat={restaurant?.lat}
          restaurantLng={restaurant?.lng}
        />
        <SafeAreaView edges={['top']} style={styles.overlayHeader}>
          <Pressable testID="tracking-back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.onSurface} />
          </Pressable>
          <View style={styles.overlayInfo}>
            <Text style={styles.overlayTitle}>{order.restaurant_name}</Text>
            <Text style={styles.overlaySub}>ETA {restaurant?.delivery_minutes ?? 30} {t('minDelivery')}</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{t('trackOrder')}</Text>

        <View style={styles.timeline}>
          {STATUSES.map((s, idx) => {
            const active = idx <= statusIdx;
            return (
              <View key={s} style={styles.tlRow}>
                <View style={styles.tlDotWrap}>
                  <View style={[styles.tlDot, active && styles.tlDotActive]}>
                    {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  {idx < STATUSES.length - 1 && <View style={[styles.tlLine, active && styles.tlLineActive]} />}
                </View>
                <Text style={[styles.tlTxt, active && styles.tlTxtActive]}>{t(`status_${s}` as any)}</Text>
              </View>
            );
          })}
        </View>

        {order.courier_name && (
          <View style={styles.courierCard}>
            <View style={styles.courierAvatar}>
              <Ionicons name="bicycle" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.courierName}>{order.courier_name}</Text>
              <Text style={styles.courierRole}>Your courier</Text>
            </View>
            <Ionicons name="call" size={22} color={theme.colors.brand} />
          </View>
        )}

        <View style={styles.orderBox}>
          <Text style={styles.orderBoxTitle}>Order details</Text>
          {order.items.map((it: any, i: number) => (
            <View key={i} style={styles.orderItem}>
              <Text style={styles.orderItemName}>{it.quantity}× {it.name}</Text>
              <Text style={styles.orderItemPrice}>₺{(it.price * it.quantity).toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.orderItem}>
            <Text style={styles.totalLbl}>{t('total')}</Text>
            <Text style={styles.totalVal}>₺{order.total.toFixed(2)}</Text>
          </View>
          <Text style={styles.codLabel}>💵 {t('payAtDoor')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapWrap: { height: '45%', position: 'relative', backgroundColor: theme.colors.surfaceSecondary },
  overlayHeader: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.lg, alignItems: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  overlayInfo: { flex: 1, backgroundColor: '#fff', padding: theme.spacing.md, borderRadius: theme.radius.md, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  overlayTitle: { fontWeight: '800', color: theme.colors.onSurface },
  overlaySub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  sheet: { flex: 1, backgroundColor: theme.colors.surface, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: theme.spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginTop: theme.spacing.md, marginBottom: theme.spacing.lg },
  sheetTitle: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface, marginBottom: theme.spacing.lg },
  timeline: { marginBottom: theme.spacing.lg },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 40 },
  tlDotWrap: { alignItems: 'center', marginRight: theme.spacing.md },
  tlDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  tlDotActive: { backgroundColor: theme.colors.success },
  tlLine: { width: 2, flex: 1, backgroundColor: theme.colors.surfaceTertiary, marginTop: 2, minHeight: 20 },
  tlLineActive: { backgroundColor: theme.colors.success },
  tlTxt: { color: theme.colors.onSurfaceTertiary, fontWeight: '600', paddingTop: 2 },
  tlTxtActive: { color: theme.colors.onSurface },
  courierCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, marginBottom: theme.spacing.lg },
  courierAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  courierName: { fontWeight: '700', color: theme.colors.onSurface, fontSize: theme.font.lg },
  courierRole: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm },
  orderBox: { padding: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md },
  orderBoxTitle: { fontWeight: '800', fontSize: theme.font.lg, marginBottom: theme.spacing.md, color: theme.colors.onSurface },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  orderItemName: { color: theme.colors.onSurface },
  orderItemPrice: { color: theme.colors.onSurface, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing.sm },
  totalLbl: { fontWeight: '700', color: theme.colors.onSurface, fontSize: theme.font.lg },
  totalVal: { fontWeight: '800', color: theme.colors.brand, fontSize: theme.font.lg },
  codLabel: { marginTop: theme.spacing.md, color: theme.colors.success, fontWeight: '700', textAlign: 'center' },
});
