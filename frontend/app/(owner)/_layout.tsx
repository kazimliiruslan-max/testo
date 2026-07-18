import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { useI18n } from '@/src/context/I18nContext';
import { useIsDesktop } from '@/src/hooks/useIsDesktop';
import { OwnerSidebar } from '@/src/components/OwnerSidebar';

export default function OwnerTabsLayout() {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  return (
    <View style={[styles.root, isDesktop && styles.rootDesktop]}>
      {isDesktop ? <OwnerSidebar /> : null}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.brand,
            tabBarInactiveTintColor: theme.colors.onSurfaceTertiary,
            tabBarStyle: isDesktop ? { display: 'none' } : undefined,
          }}
        >
          <Tabs.Screen name="dashboard" options={{
            title: t('tab_owner_orders'),
            tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
          }} />
          <Tabs.Screen name="menu" options={{
            title: t('tab_owner_menu'),
            tabBarIcon: ({ color, size }) => <Ionicons name="fast-food-outline" size={size} color={color} />,
          }} />
          <Tabs.Screen name="analytics" options={{
            title: t('tab_analytics'),
            tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
          }} />
          <Tabs.Screen name="couriers" options={{
            title: t('tab_owner_couriers'),
            tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
          }} />
          <Tabs.Screen name="profile" options={{
            title: t('tab_profile'),
            tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          }} />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootDesktop: { flexDirection: 'row', backgroundColor: theme.colors.surfaceSecondary },
});
