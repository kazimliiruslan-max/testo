import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView, TextInput,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

interface Restaurant {
  id: string; name: string; description: string; cuisine: string;
  image_url: string; rating: number; delivery_minutes: number; address: string;
}

const CUISINES = ['All', 'Pizza', 'Burgers', 'Other'];

export default function CustomerHome() {
  const router = useRouter();
  const { t } = useI18n();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cuisine, setCuisine] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/restaurants');
      setRestaurants(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = restaurants.filter((r) => {
    const cuisineOk = cuisine === 'All' || r.cuisine === cuisine;
    const searchOk = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return cuisineOk && searchOk;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>DirectDine</Text>
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
          <Text style={styles.badgeTxt}>{t('noCommission')}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.onSurfaceTertiary} />
        <TextInput
          testID="search-input"
          style={styles.searchInput}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={theme.colors.onSurfaceTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsStrip}
      >
        {CUISINES.map((c) => (
          <Pressable
            key={c}
            testID={`cuisine-chip-${c}`}
            onPress={() => setCuisine(c)}
            style={[styles.chip, cuisine === c && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, cuisine === c && styles.chipTxtActive]}>
              {c === 'All' ? t('allCuisines') : c}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.brand} />
      ) : (
        <FlatList
          testID="restaurants-list"
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.lg }} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`restaurant-card-${item.id}`}
              onPress={() => router.push(`/(customer)/restaurant/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.cardImgWrap}>
                <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.55)']}
                  style={styles.gradient}
                />
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeTxt}>{t('noCommission')}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardCuisine}>{item.cuisine} · {item.description}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <View style={styles.rating}>
                    <Ionicons name="star" size={12} color={theme.colors.warning} />
                    <Text style={styles.ratingTxt}>{item.rating.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.eta}>{item.delivery_minutes} {t('minDelivery')}</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={48} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>No restaurants found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
  },
  headerTitle: { fontSize: theme.font.xxl, fontWeight: '800', color: theme.colors.onSurface },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs,
    backgroundColor: '#E8F7EC', paddingHorizontal: theme.spacing.md, paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  badgeTxt: { color: theme.colors.success, fontWeight: '700', fontSize: theme.font.sm },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, height: 44,
  },
  searchInput: { flex: 1, fontSize: theme.font.base, color: theme.colors.onSurface },
  chipsStrip: { maxHeight: 56, marginTop: theme.spacing.md },
  chipsRow: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border,
    justifyContent: 'center', backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.inverse, borderColor: theme.colors.inverse },
  chipTxt: { color: theme.colors.onSurface, fontWeight: '600', fontSize: theme.font.base },
  chipTxtActive: { color: theme.colors.onInverse },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.divider,
  },
  cardImgWrap: { height: 160, position: 'relative' },
  cardImg: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  cardBadge: {
    position: 'absolute', top: theme.spacing.md, right: theme.spacing.md,
    backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md,
    paddingVertical: 4, borderRadius: theme.radius.pill,
  },
  cardBadgeTxt: { color: theme.colors.onBrand, fontSize: theme.font.sm, fontWeight: '700' },
  cardBody: { padding: theme.spacing.md, flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  cardCuisine: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  cardMeta: { alignItems: 'flex-end', gap: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingTxt: { fontSize: theme.font.sm, fontWeight: '700', color: theme.colors.onSurface },
  eta: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary },
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.base },
});
