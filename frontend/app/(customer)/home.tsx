import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView, TextInput,
  RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';
import { useDeliveryLocation } from '@/src/context/LocationContext';
import { theme } from '@/src/theme';

interface Restaurant {
  id: string; name: string; description: string; cuisine: string;
  image_url: string; rating: number; delivery_minutes: number; address: string;
  is_featured: boolean; featured_tagline: string;
  distance_km?: number | null; in_range?: boolean;
  delivery_radius_km: number;
  logo_url?: string;
  campaign_active?: boolean;
  order_count?: number;
  min_order_value?: number;
  is_open_now?: boolean;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CUISINES: { label: string; emoji: string }[] = [
  { label: 'All', emoji: '🍽️' },
  { label: 'Pizza', emoji: '🍕' },
  { label: 'Burgers', emoji: '🍔' },
  { label: 'Sushi', emoji: '🍣' },
  { label: 'Other', emoji: '✨' },
];

export default function CustomerHome() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { loc, requestGps, requesting } = useDeliveryLocation();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cuisine, setCuisine] = useState('All');
  const [search, setSearch] = useState('');
  const [showOutOfRange, setShowOutOfRange] = useState(false);

  const load = useCallback(async () => {
    try {
      const params: any = {};
      if (loc) { params.lat = loc.lat; params.lng = loc.lng; }
      const res = await api.get('/restaurants', { params });
      setRestaurants(res.data);
    } finally { setLoading(false); setRefreshing(false); }
  }, [loc]);

  useEffect(() => { load(); }, [load]);

  // Auto-request GPS on first mount if we don't have a location yet
  useEffect(() => {
    if (!loc) requestGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inRange = restaurants.filter((r) => (loc ? r.in_range : true));
  const outOfRange = restaurants.filter((r) => loc && !r.in_range);
  const shown = (showOutOfRange ? restaurants : inRange).filter((r) => {
    const cuisineOk = cuisine === 'All' || r.cuisine === cuisine;
    const searchOk = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return cuisineOk && searchOk;
  });
  const featured = inRange.filter((r) => r.is_featured);
  const deals = inRange.filter((r) => r.campaign_active);
  const popular = [...inRange].sort((a, b) => (b.order_count || 0) - (a.order_count || 0)).slice(0, 6);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[theme.colors.brandTertiary, theme.colors.surface]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerHello}>{user ? `Hi, ${user.name.split(' ')[0]} 👋` : 'Hi there 👋'}</Text>
            <Text style={styles.headerTitle}>EasYum</Text>
          </View>
          {user ? (
            <View style={styles.badge}>
              <Ionicons name="leaf" size={14} color={theme.colors.brandDark} />
              <Text style={styles.badgeTxt}>{t('noCommission')}</Text>
            </View>
          ) : (
            <Pressable
              testID="home-signin-btn"
              onPress={() => router.push('/(auth)/login')}
              style={styles.signInBtn}
            >
              <Ionicons name="log-in-outline" size={16} color="#fff" />
              <Text style={styles.signInBtnTxt}>{t('signIn')}</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {/* Delivery location bar */}
      <Pressable testID="location-bar" onPress={requestGps} style={styles.locBar} disabled={requesting}>
        <Ionicons name="location" size={16} color={theme.colors.brandDark} />
        <Text style={styles.locBarTxt} numberOfLines={1}>
          {loc
            ? `${t('deliveringTo')}: ${loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`}`
            : t('setYourLocation')}
        </Text>
        {requesting
          ? <ActivityIndicator size="small" color={theme.colors.brand} />
          : <Ionicons name={loc ? 'refresh' : 'navigate'} size={16} color={theme.colors.brand} />
        }
      </Pressable>

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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.colors.brand} />
      ) : (
        <FlatList
          testID="restaurants-list"
          data={shown}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <View>
              {featured.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('featuredThisWeek')}</Text>
                    <View style={styles.sponsoredTag}>
                      <Ionicons name="star" size={11} color={theme.colors.brandDark} />
                      <Text style={styles.sponsoredTxt}>{t('sponsored')}</Text>
                    </View>
                  </View>
                  <FlatList
                    testID="featured-carousel"
                    data={featured}
                    keyExtractor={(r) => r.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={SCREEN_W - 32}
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
                    renderItem={({ item }) => (
                      <Pressable
                        testID={`featured-card-${item.id}`}
                        onPress={() => router.push(`/(customer)/restaurant/${item.id}`)}
                        style={[styles.featuredCard, { width: SCREEN_W - 64 }]}
                      >
                        <Image source={{ uri: item.image_url }} style={styles.featuredImg} contentFit="cover" />
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.featuredGradient} />
                        <View style={styles.featuredBadge}>
                          <Ionicons name="sparkles" size={12} color="#fff" />
                          <Text style={styles.featuredBadgeTxt}>{t('featured')}</Text>
                        </View>
                        <View style={styles.featuredContent}>
                          <Text style={styles.featuredTitle}>{item.name}</Text>
                          <Text style={styles.featuredTagline}>{item.featured_tagline || item.description}</Text>
                          <View style={styles.featuredMeta}>
                            <View style={styles.featuredChip}>
                              <Ionicons name="star" size={12} color={theme.colors.accent} />
                              <Text style={styles.featuredChipTxt}>{item.rating.toFixed(1)}</Text>
                            </View>
                            <View style={styles.featuredChip}>
                              <Ionicons name="time-outline" size={12} color="#fff" />
                              <Text style={styles.featuredChipTxt}>{item.delivery_minutes} {t('minDelivery')}</Text>
                            </View>
                            {item.distance_km != null && (
                              <View style={styles.featuredChip}>
                                <Ionicons name="location" size={12} color="#fff" />
                                <Text style={styles.featuredChipTxt}>{item.distance_km.toFixed(1)} km</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    )}
                  />
                </>
              )}

              {popular.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>🔥 Popular near you</Text>
                  </View>
                  <FlatList
                    testID="popular-carousel"
                    data={popular}
                    keyExtractor={(r) => 'p-' + r.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
                    renderItem={({ item }) => (
                      <Pressable
                        testID={`popular-card-${item.id}`}
                        onPress={() => router.push(`/(customer)/restaurant/${item.id}`)}
                        style={styles.popCard}
                      >
                        <Image source={{ uri: item.image_url }} style={styles.popImg} contentFit="cover" />
                        <View style={{ padding: theme.spacing.sm }}>
                          <Text style={styles.popName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.popMeta}>⭐ {item.rating.toFixed(1)} · {item.delivery_minutes}m</Text>
                        </View>
                      </Pressable>
                    )}
                  />
                </>
              )}

              {deals.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>⚡ Deals · limited time</Text>
                    <View style={styles.dealsTag}><Text style={styles.dealsTagTxt}>LIVE</Text></View>
                  </View>
                  <FlatList
                    testID="deals-carousel"
                    data={deals}
                    keyExtractor={(r) => 'd-' + r.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
                    renderItem={({ item }) => (
                      <Pressable
                        testID={`deal-card-${item.id}`}
                        onPress={() => router.push(`/(customer)/restaurant/${item.id}`)}
                        style={styles.dealCard}
                      >
                        <Image source={{ uri: item.image_url }} style={styles.popImg} contentFit="cover" />
                        <View style={styles.dealBadge}>
                          <Ionicons name="flash" size={12} color="#fff" />
                          <Text style={styles.dealBadgeTxt}>Deal</Text>
                        </View>
                        <View style={{ padding: theme.spacing.sm }}>
                          <Text style={styles.popName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.popMeta}>Free delivery · ends soon</Text>
                        </View>
                      </Pressable>
                    )}
                  />
                </>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
                style={styles.chipsStrip}
              >
                {CUISINES.map((c) => (
                  <Pressable
                    key={c.label}
                    testID={`cuisine-chip-${c.label}`}
                    onPress={() => setCuisine(c.label)}
                    style={[styles.chip, cuisine === c.label && styles.chipActive]}
                  >
                    <Text style={[styles.chipTxt, cuisine === c.label && styles.chipTxtActive]}>
                      {c.emoji}  {c.label === 'All' ? t('allCuisines') : c.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.listTitleRow}>
                <Text style={styles.listTitle}>
                  {loc && !showOutOfRange ? t('restaurantsNearYou') : t('allRestaurants')}
                </Text>
                {loc && outOfRange.length > 0 && (
                  <Pressable testID="toggle-out-of-range" onPress={() => setShowOutOfRange((v) => !v)}>
                    <Text style={styles.toggleTxt}>
                      {showOutOfRange ? t('hideOutOfRange') : `${t('showAll')} (${outOfRange.length})`}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isOut = loc && item.in_range === false;
            const isClosed = item.is_open_now === false;
            const disabled = isOut || isClosed;
            return (
              <Pressable
                testID={`restaurant-card-${item.id}`}
                onPress={() => !disabled && router.push(`/(customer)/restaurant/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && !disabled && { opacity: 0.9 }, disabled && styles.cardDisabled]}
              >
                <View>
                  <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" />
                  {item.logo_url ? (
                    <Image source={{ uri: item.logo_url }} style={styles.cardLogo} contentFit="cover" />
                  ) : null}
                  {isClosed && (
                    <View style={styles.closedBadge}>
                      <Ionicons name="moon" size={12} color="#fff" />
                      <Text style={styles.closedBadgeTxt}>{t('closed')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, disabled && styles.dim]}>{item.name}</Text>
                    <Text style={[styles.cardCuisine, disabled && styles.dim]} numberOfLines={1}>
                      {item.cuisine} · {item.description}
                    </Text>
                    <View style={styles.cardMeta}>
                      <View style={styles.rating}>
                        <Ionicons name="star" size={12} color={theme.colors.accent} />
                        <Text style={styles.ratingTxt}>{item.rating.toFixed(1)}</Text>
                      </View>
                      <View style={styles.dot} />
                      <Text style={styles.eta}>{item.delivery_minutes} {t('minDelivery')}</Text>
                      {item.distance_km != null && (
                        <>
                          <View style={styles.dot} />
                          <Text style={[styles.eta, isOut && { color: theme.colors.error }]}>
                            {item.distance_km.toFixed(1)} km
                          </Text>
                        </>
                      )}
                    </View>
                    {isOut && (
                      <Text style={styles.outTag}>
                        <Ionicons name="close-circle" size={12} color={theme.colors.error} /> {t('outOfRange')}
                      </Text>
                    )}
                    {!isOut && isClosed && (
                      <Text style={styles.outTag}>
                        <Ionicons name="moon" size={12} color={theme.colors.error} /> {t('restaurantClosed')}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={48} color={theme.colors.onSurfaceTertiary} />
              <Text style={styles.emptyTxt}>
                {loc ? t('noRestaurantsInRange') : t('noRestaurantsFound')}
              </Text>
              {loc && outOfRange.length > 0 && !showOutOfRange && (
                <Pressable onPress={() => setShowOutOfRange(true)} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnTxt}>{t('showAll')} ({outOfRange.length})</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  headerGradient: { paddingBottom: theme.spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerHello: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.base },
  headerTitle: { fontSize: theme.font.xxxl, fontWeight: '900', color: theme.colors.brandDark, letterSpacing: -0.5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill },
  badgeTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
  signInBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.pill },
  signInBtnTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.sm },
  closedBadge: { position: 'absolute', top: theme.spacing.sm, right: theme.spacing.sm, backgroundColor: theme.colors.error, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
  closedBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.xs },
  locBar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.md },
  locBarTxt: { flex: 1, color: theme.colors.brandDark, fontWeight: '600', fontSize: theme.font.sm },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginHorizontal: theme.spacing.lg, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.lg, height: 44, marginBottom: theme.spacing.sm },
  searchInput: { flex: 1, fontSize: theme.font.base, color: theme.colors.onSurface },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  sectionTitle: { fontSize: theme.font.lg, fontWeight: '800', color: theme.colors.onSurface },
  sponsoredTag: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill },
  sponsoredTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  featuredCard: { height: 200, borderRadius: theme.radius.lg, overflow: 'hidden', backgroundColor: theme.colors.surfaceSecondary },
  featuredImg: { width: '100%', height: '100%' },
  featuredGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  featuredBadge: { position: 'absolute', top: theme.spacing.md, left: theme.spacing.md, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  featuredBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.sm },
  featuredContent: { position: 'absolute', left: theme.spacing.lg, right: theme.spacing.lg, bottom: theme.spacing.lg, gap: 4 },
  featuredTitle: { color: '#fff', fontWeight: '800', fontSize: theme.font.xl },
  featuredTagline: { color: '#fff', fontSize: theme.font.sm, opacity: 0.9 },
  featuredMeta: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: 6 },
  featuredChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.pill },
  featuredChipTxt: { color: '#fff', fontSize: theme.font.sm, fontWeight: '600' },
  popCard: { width: 160, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.divider, overflow: 'hidden' },
  popImg: { width: '100%', height: 90 },
  popName: { fontWeight: '700', color: theme.colors.onSurface, fontSize: theme.font.base },
  popMeta: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.sm, marginTop: 2 },
  dealCard: { width: 200, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandTertiary, borderWidth: 1, borderColor: theme.colors.brand, overflow: 'hidden', position: 'relative' },
  dealBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.colors.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  dealBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },
  dealsTag: { backgroundColor: theme.colors.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  dealsTagTxt: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 1 },
  chipsStrip: { maxHeight: 56, marginTop: theme.spacing.md },
  chipsRow: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipTxt: { color: theme.colors.onSurface, fontWeight: '600', fontSize: theme.font.base },
  chipTxtActive: { color: '#fff' },
  listTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  listTitle: { fontSize: theme.font.lg, fontWeight: '800', color: theme.colors.onSurface },
  toggleTxt: { color: theme.colors.brand, fontWeight: '700', fontSize: theme.font.sm },
  card: { flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, overflow: 'hidden', marginHorizontal: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.divider },
  cardDisabled: { opacity: 0.6 },
  cardImg: { width: 100, height: 100 },
  cardLogo: { position: 'absolute', left: 6, bottom: 6, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff' },
  cardBody: { flex: 1, padding: theme.spacing.md, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  cardCuisine: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  dim: { color: theme.colors.onSurfaceTertiary },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 6 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingTxt: { fontSize: theme.font.sm, fontWeight: '700', color: theme.colors.onSurface },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.colors.onSurfaceTertiary },
  eta: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary },
  outTag: { color: theme.colors.error, fontSize: theme.font.sm, marginTop: 4, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 60, gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  emptyTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.base, textAlign: 'center' },
  emptyBtn: { backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, borderRadius: theme.radius.pill },
  emptyBtnTxt: { color: '#fff', fontWeight: '700' },
});
