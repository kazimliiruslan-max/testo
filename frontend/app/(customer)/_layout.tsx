import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { useI18n } from '@/src/context/I18nContext';

export default function CustomerTabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.onSurfaceTertiary,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tab_home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tab_orders'),
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab_profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="restaurant/[id]" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="tracking/[id]" options={{ href: null }} />
    </Tabs>
  );
}
