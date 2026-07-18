import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

interface Analytics {
  days: number;
  total_orders: number;
  delivered: number;
  cancelled: number;
  revenue: number;
  avg_order_value: number;
  top_items: { name: string; qty: number; revenue: number }[];
  peak_hour: number | null;
  peak_weekday: number | null;
  hour_histogram: number[];
  weekday_histogram: number[];
  avg_rating: number | null;
  review_count: number;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function OwnerAnalytics() {
  const { t } = useI18n();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await api.get(`/owner/analytics?days=${days}`);
      setData(res.data);
    } catch {
      setErr('Could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxHour = useMemo(
    () => (data ? Math.max(1, ...data.hour_histogram) : 1),
    [data],
  );
  const maxWeekday = useMemo(
    () => (data ? Math.max(1, ...data.weekday_histogram) : 1),
    [data],
  );

  const screenW = Dimensions.get('window').width;
  const hourColW = Math.max(6, Math.floor((screenW - 48) / 24) - 2);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('analytics')}</Text>
        <View style={styles.periodPills}>
          {[7, 30, 90].map((d) => (
            <Pressable
              key={d}
              testID={`analytics-period-${d}`}
              onPress={() => setDays(d)}
              style={[styles.periodPill, days === d && styles.periodPillActive]}
            >
              <Text style={[styles.periodTxt, days === d && styles.periodTxtActive]}>{d}d</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: 60 }} />
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !data ? null : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Hero KPI card */}
          <LinearGradient
            colors={[theme.colors.brand, theme.colors.brandDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>{t('revenueLast', { days: String(days) })}</Text>
            <Text style={styles.heroValue}>₺{data.revenue.toFixed(2)}</Text>
            <Text style={styles.heroSub}>
              {data.delivered} {t('deliveredOrders')} · {t('avgOrder')} ₺{data.avg_order_value.toFixed(2)}
            </Text>
          </LinearGradient>

          {/* KPI row */}
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Ionicons name="receipt" size={18} color={theme.colors.brand} />
              <Text style={styles.kpiNum}>{data.total_orders}</Text>
              <Text style={styles.kpiLabel}>{t('orders')}</Text>
            </View>
            <View style={styles.kpi}>
              <Ionicons name="close-circle" size={18} color={theme.colors.error} />
              <Text style={styles.kpiNum}>{data.cancelled}</Text>
              <Text style={styles.kpiLabel}>{t('cancelled')}</Text>
            </View>
            <View style={styles.kpi}>
              <Ionicons name="star" size={18} color={theme.colors.accent} />
              <Text style={styles.kpiNum}>{data.avg_rating != null ? data.avg_rating.toFixed(1) : '—'}</Text>
              <Text style={styles.kpiLabel}>{t('avgRating')} · {data.review_count}</Text>
            </View>
          </View>

          {/* Best sellers */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="trophy" size={18} color={theme.colors.accent} />
              <Text style={styles.sectionTitle}>{t('bestSellers')}</Text>
            </View>
            {data.top_items.length === 0 ? (
              <Text style={styles.empty}>{t('noDataYet')}</Text>
            ) : (
              data.top_items.map((it, i) => {
                const maxQty = data.top_items[0].qty || 1;
                const width = `${Math.round((it.qty / maxQty) * 100)}%` as any;
                return (
                  <View key={it.name} style={styles.itemRow}>
                    <View style={styles.itemRank}><Text style={styles.itemRankTxt}>#{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                        <Text style={styles.itemQty}>{it.qty} × · ₺{it.revenue.toFixed(2)}</Text>
                      </View>
                      <View style={styles.itemBarBg}>
                        <LinearGradient
                          colors={[theme.colors.brand, theme.colors.brandDark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.itemBar, { width }]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Peak hours */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="time" size={18} color={theme.colors.brand} />
              <Text style={styles.sectionTitle}>{t('peakHours')}</Text>
              {data.peak_hour != null && (
                <Text style={styles.sectionSub}> · {t('busiest')}: {String(data.peak_hour).padStart(2, '0')}:00</Text>
              )}
            </View>
            <View style={styles.hourChartWrap}>
              <View style={styles.hourChart}>
                {data.hour_histogram.map((v, i) => (
                  <View key={i} style={[styles.hourCol, { width: hourColW }]}>
                    <View
                      style={[
                        styles.hourBar,
                        { height: `${(v / maxHour) * 100}%`, backgroundColor: i === data.peak_hour ? theme.colors.accent : theme.colors.brand },
                      ]}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.hourAxis}>
                {['0', '6', '12', '18', '23'].map((h, i) => (
                  <Text key={i} style={styles.hourAxisTxt}>{h}h</Text>
                ))}
              </View>
            </View>
          </View>

          {/* Peak weekdays */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Ionicons name="calendar" size={18} color={theme.colors.brand} />
              <Text style={styles.sectionTitle}>{t('peakDays')}</Text>
              {data.peak_weekday != null && (
                <Text style={styles.sectionSub}> · {t('busiest')}: {WEEKDAY_LABELS[data.peak_weekday]}</Text>
              )}
            </View>
            <View style={styles.weekdayRow}>
              {data.weekday_histogram.map((v, i) => (
                <View key={i} style={styles.weekdayCol}>
                  <View style={styles.weekdayBarBg}>
                    <View
                      style={[
                        styles.weekdayBar,
                        {
                          height: `${(v / maxWeekday) * 100}%`,
                          backgroundColor: i === data.peak_weekday ? theme.colors.accent : theme.colors.brand,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.weekdayLbl}>{WEEKDAY_LABELS[i]}</Text>
                  <Text style={styles.weekdayVal}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.md },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  periodPills: { flexDirection: 'row', gap: 6 },
  periodPill: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSecondary },
  periodPillActive: { backgroundColor: theme.colors.brand },
  periodTxt: { fontWeight: '700', color: theme.colors.onSurfaceSecondary },
  periodTxtActive: { color: '#fff' },
  err: { color: theme.colors.error, textAlign: 'center', marginTop: 40 },
  heroCard: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, shadowColor: theme.colors.brand, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontSize: theme.font.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { color: '#fff', fontSize: 40, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: theme.font.sm, fontWeight: '600' },
  kpiRow: { flexDirection: 'row', gap: theme.spacing.sm },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: theme.radius.md, padding: theme.spacing.md, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  kpiNum: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  kpiLabel: { fontSize: theme.font.xs, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  section: { backgroundColor: '#fff', borderRadius: theme.radius.lg, padding: theme.spacing.lg, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: theme.spacing.md },
  sectionTitle: { fontSize: theme.font.lg, fontWeight: '800', color: theme.colors.onSurface },
  sectionSub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, fontWeight: '600' },
  empty: { color: theme.colors.onSurfaceTertiary, fontStyle: 'italic', paddingVertical: theme.spacing.md, textAlign: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  itemRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  itemRankTxt: { color: theme.colors.brandDark, fontWeight: '800', fontSize: theme.font.sm },
  itemName: { fontWeight: '700', color: theme.colors.onSurface, fontSize: theme.font.base, flex: 1 },
  itemQty: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, fontWeight: '600' },
  itemBarBg: { height: 8, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  itemBar: { height: '100%', borderRadius: 4 },
  hourChartWrap: { gap: 4 },
  hourChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  hourCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  hourBar: { width: '100%', backgroundColor: theme.colors.brand, borderRadius: 3, minHeight: 2 },
  hourAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 4 },
  hourAxisTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.xs },
  weekdayRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center' },
  weekdayBarBg: { height: 80, width: 24, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  weekdayBar: { width: '100%', borderRadius: 4, minHeight: 2 },
  weekdayLbl: { fontSize: theme.font.xs, marginTop: 4, color: theme.colors.onSurfaceSecondary, fontWeight: '700' },
  weekdayVal: { fontSize: theme.font.xs, color: theme.colors.onSurfaceTertiary },
});
