import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { theme } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';
import { useI18n } from '@/src/context/I18nContext';

interface Item {
  key: string;
  route: string;
  labelKey: 'tab_owner_orders' | 'tab_owner_menu' | 'tab_owner_couriers' | 'tab_profile';
  icon: keyof typeof Ionicons.glyphMap;
}

const ITEMS: Item[] = [
  { key: 'dashboard', route: '/(owner)/dashboard', labelKey: 'tab_owner_orders', icon: 'list-outline' },
  { key: 'menu', route: '/(owner)/menu', labelKey: 'tab_owner_menu', icon: 'fast-food-outline' },
  { key: 'couriers', route: '/(owner)/couriers', labelKey: 'tab_owner_couriers', icon: 'bicycle-outline' },
  { key: 'profile', route: '/(owner)/profile', labelKey: 'tab_profile', icon: 'person-outline' },
];

/** Vertical sidebar shown on desktop web for restaurant owners. */
export function OwnerSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  return (
    <View style={styles.sidebar} testID="owner-sidebar">
      <View style={styles.brandRow}>
        <View style={styles.logoDot}>
          <Ionicons name="restaurant" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>EasYum</Text>
          <Text style={styles.brandSub}>{t('restaurantAdmin')}</Text>
        </View>
      </View>
      {user?.name ? (
        <View style={styles.userChip}>
          <Ionicons name="person-circle" size={20} color={theme.colors.brandDark} />
          <Text style={styles.userChipTxt} numberOfLines={1}>{user.name}</Text>
        </View>
      ) : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {ITEMS.map((it) => {
          const active = pathname?.includes(it.key);
          return (
            <Pressable
              key={it.key}
              testID={`sidebar-${it.key}`}
              onPress={() => router.push(it.route as any)}
              style={[styles.item, active && styles.itemActive]}
            >
              <Ionicons
                name={it.icon}
                size={20}
                color={active ? theme.colors.brand : theme.colors.onSurfaceSecondary}
                style={styles.itemIcon}
              />
              <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{t(it.labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable testID="sidebar-logout" onPress={logout} style={styles.logoutBtn}>
        <Ionicons name="log-out-outline" size={18} color={theme.colors.error} />
        <Text style={styles.logoutTxt}>{t('logout')}</Text>
      </Pressable>
      <Text style={styles.footerTxt}>v1.1 · 0% commission</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.sm, marginBottom: theme.spacing.md },
  logoDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: theme.font.lg, fontWeight: '800', color: theme.colors.onSurface },
  brandSub: { fontSize: theme.font.xs, color: theme.colors.onSurfaceSecondary },
  userChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.brandTertiary, padding: 8, borderRadius: theme.radius.md, marginBottom: theme.spacing.md },
  userChipTxt: { color: theme.colors.brandDark, fontWeight: '700', fontSize: theme.font.sm, flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 12, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, marginBottom: 4 },
  itemActive: { backgroundColor: theme.colors.brandTertiary },
  itemIcon: { width: 24, textAlign: 'center' },
  itemLabel: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  itemLabelActive: { color: theme.colors.brandDark, fontWeight: '800' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error, marginBottom: theme.spacing.sm },
  logoutTxt: { color: theme.colors.error, fontWeight: '700' },
  footerTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.xs, textAlign: 'center', paddingBottom: theme.spacing.md },
});
