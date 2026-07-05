import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
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

  const load = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}><Text style={styles.headerTitle}>{t('tab_orders')}</Text></View>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          testID="orders-list"
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`order-card-${item.id}`}
              onPress={() => router.push(`/(customer)/tracking/${item.id}`)}
              style={styles.card}
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
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>{t('noOrders')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  card: {
    backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
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
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.base },
});
