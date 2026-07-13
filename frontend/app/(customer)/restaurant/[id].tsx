import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/src/api/client';
import { useCart } from '@/src/context/CartContext';
import { useI18n } from '@/src/context/I18nContext';
import { theme } from '@/src/theme';

export default function RestaurantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { add, items, total } = useCart();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [menu, setMenu] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('All');

  useEffect(() => {
    (async () => {
      try {
        const [r, m] = await Promise.all([
          api.get(`/restaurants/${id}`),
          api.get(`/restaurants/${id}/menu`),
        ]);
        setRestaurant(r.data);
        setMenu(m.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const categories = ['All', ...Array.from(new Set(menu.map((m) => m.category)))];
  const filtered = category === 'All' ? menu : menu.filter((m) => m.category === category);
  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: restaurant.image_url }} style={styles.hero} contentFit="cover" />
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.75)']} style={styles.heroGradient} />
          <SafeAreaView style={styles.heroContent} edges={['top']}>
            <Pressable testID="restaurant-back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={styles.heroBottom}>
              <Text style={styles.heroTitle}>{restaurant.name}</Text>
              <View style={styles.heroMeta}>
                <View style={styles.heroChip}>
                  <Ionicons name="star" size={12} color={theme.colors.warning} />
                  <Text style={styles.heroChipTxt}>{restaurant.rating.toFixed(1)}</Text>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="time-outline" size={12} color="#fff" />
                  <Text style={styles.heroChipTxt}>{restaurant.delivery_minutes} {t('minDelivery')}</Text>
                </View>
                <View style={[styles.heroChip, { backgroundColor: theme.colors.brand }]}>
                  <Text style={[styles.heroChipTxt, { fontWeight: '700' }]}>{t('noCommission')}</Text>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {restaurant.campaign_active && (
            <View style={styles.campaignBanner}>
              <Ionicons name="pricetag" size={16} color="#fff" />
              <Text style={styles.campaignBannerTxt}>Campaign live · 3 days</Text>
            </View>
          )}
          {restaurant.description ? <Text style={styles.desc}>{restaurant.description}</Text> : null}
          {restaurant.min_order_value > 0 && (
            <View style={styles.minOrderPill}>
              <Ionicons name="wallet-outline" size={14} color={theme.colors.brandDark} />
              <Text style={styles.minOrderPillTxt}>
                {t('minOrderRestaurant')}: ₺{restaurant.min_order_value.toFixed(2)}
              </Text>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {categories.map((c) => (
              <Pressable
                key={c}
                testID={`category-chip-${c}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && styles.chipActive]}
              >
                <Text style={[styles.chipTxt, category === c && styles.chipTxtActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <FlatList
            data={filtered}
            keyExtractor={(m) => m.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
            renderItem={({ item }) => {
              const shownPrice = item.display_price ?? item.price;
              const feePct = Number(item.delivery_fee_pct || 0);
              // During an active campaign the backend zeroes the delivery-fee uplift, so
              // display_price == price while the "regular" price is price * (1 + fee/100).
              const regularPrice = item.price * (1 + feePct / 100);
              const hasDiscount = restaurant.campaign_active && feePct > 0 && regularPrice > shownPrice + 0.01;
              return (
              <View style={styles.menuItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{item.name}</Text>
                  <Text style={styles.menuDesc}>{item.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.xs }}>
                    <Text style={[styles.menuPrice, hasDiscount && { color: theme.colors.error }]}>₺{shownPrice.toFixed(2)}</Text>
                    {hasDiscount && (
                      <Text style={styles.menuPriceOld}>₺{regularPrice.toFixed(2)}</Text>
                    )}
                  </View>
                </View>
                <Pressable
                  testID={`add-item-${item.id}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    add(restaurant.id, restaurant.name, {
                      menu_item_id: item.id, name: item.name, price: shownPrice,
                    });
                  }}
                  style={styles.addBtn}
                >
                  <Ionicons name="add" size={22} color={theme.colors.onBrand} />
                </Pressable>
              </View>
              );
            }}
          />
        </View>
      </ScrollView>

      {cartCount > 0 && (
        <SafeAreaView edges={['bottom']} style={styles.cartBar}>
          <Pressable
            testID="go-to-cart-btn"
            onPress={() => router.push('/(customer)/cart')}
            style={styles.cartBtn}
          >
            <View style={styles.cartCountBubble}>
              <Text style={styles.cartCountTxt}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBtnTxt}>{t('checkout')}</Text>
            <Text style={styles.cartBtnPrice}>₺{total.toFixed(2)}</Text>
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { height: 260, position: 'relative' },
  hero: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: theme.spacing.lg, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { gap: theme.spacing.sm },
  heroTitle: { color: '#fff', fontSize: theme.font.xxxl, fontWeight: '800' },
  heroMeta: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  heroChipTxt: { color: '#fff', fontSize: theme.font.sm },
  body: { padding: theme.spacing.lg, paddingBottom: 120 },
  desc: { color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.lg, fontSize: theme.font.base },
  chipsRow: { gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
  chipActive: { backgroundColor: theme.colors.inverse, borderColor: theme.colors.inverse },
  chipTxt: { color: theme.colors.onSurface, fontWeight: '600' },
  chipTxtActive: { color: theme.colors.onInverse },
  menuItem: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center', backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.md },
  menuName: { fontSize: theme.font.lg, fontWeight: '700', color: theme.colors.onSurface },
  menuDesc: { fontSize: theme.font.sm, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  menuPrice: { fontSize: theme.font.base, fontWeight: '700', color: theme.colors.brand },
  menuPriceOld: { fontSize: theme.font.sm, color: theme.colors.onSurfaceTertiary, textDecorationLine: 'line-through' },
  minOrderPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.brandTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill, marginBottom: theme.spacing.md },
  minOrderPillTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm },
  campaignBanner: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.error, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, marginBottom: theme.spacing.sm },
  campaignBannerTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.sm },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.divider, padding: theme.spacing.md },
  cartBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, height: 54, gap: theme.spacing.md },
  cartCountBubble: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  cartCountTxt: { color: '#fff', fontWeight: '800', fontSize: theme.font.sm },
  cartBtnTxt: { flex: 1, color: '#fff', fontWeight: '700', fontSize: theme.font.lg },
  cartBtnPrice: { color: '#fff', fontWeight: '800', fontSize: theme.font.lg },
});
