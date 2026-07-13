import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/src/theme';
import { useIsDesktop } from '@/src/hooks/useIsDesktop';

/**
 * Custom tab bar for the (owner) navigator. On mobile it renders the default
 * bottom bar. On wide web viewports (>=900px) it renders a sidebar so
 * restaurant owners can use the site as a full admin panel.
 */
export function OwnerTabBar(props: BottomTabBarProps) {
  const isDesktop = useIsDesktop();
  const { state, descriptors, navigation } = props;

  if (!isDesktop) return <DefaultBottomBar {...props} />;

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <View style={styles.logoDot}>
          <Ionicons name="restaurant" size={22} color="#fff" />
        </View>
        <View>
          <Text style={styles.brand}>EasYum</Text>
          <Text style={styles.brandSub}>Restaurant Admin</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12 }}>
        {state.routes.map((route, idx) => {
          const focused = state.index === idx;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const iconEl = options.tabBarIcon
            ? options.tabBarIcon({
                focused,
                color: focused ? theme.colors.brand : theme.colors.onSurfaceSecondary,
                size: 20,
              })
            : null;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              testID={`sidebar-${route.name}`}
              onPress={onPress}
              style={[styles.item, focused && styles.itemActive]}
            >
              <View style={styles.itemIcon}>{iconEl}</View>
              <Text style={[styles.itemLabel, focused && styles.itemLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.footerTxt}>v1.1 · 0% commission</Text>
      </View>
    </View>
  );
}

/** Fallback bottom bar so the mobile experience is unchanged. */
function DefaultBottomBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bottomBar}>
      {state.routes.map((route, idx) => {
        const focused = state.index === idx;
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const iconEl = options.tabBarIcon
          ? options.tabBarIcon({
              focused,
              color: focused ? theme.colors.brand : theme.colors.onSurfaceTertiary,
              size: 24,
            })
          : null;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.bottomTab}>
            <View>{iconEl}</View>
            <Text style={[styles.bottomLabel, focused && { color: theme.colors.brand }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 240,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.sm, marginBottom: theme.spacing.lg },
  logoDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: theme.font.lg, fontWeight: '800', color: theme.colors.onSurface },
  brandSub: { fontSize: theme.font.xs, color: theme.colors.onSurfaceSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 12, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, marginBottom: 4 },
  itemActive: { backgroundColor: theme.colors.brandTertiary },
  itemIcon: { width: 24, alignItems: 'center' },
  itemLabel: { fontSize: theme.font.base, color: theme.colors.onSurfaceSecondary, fontWeight: '600' },
  itemLabelActive: { color: theme.colors.brandDark, fontWeight: '800' },
  footer: { padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  footerTxt: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.xs, textAlign: 'center' },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: '#fff',
    paddingBottom: 4,
  },
  bottomTab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  bottomLabel: { fontSize: theme.font.xs, color: theme.colors.onSurfaceTertiary, fontWeight: '600' },
});
