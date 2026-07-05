import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { useI18n } from '@/src/context/I18nContext';

export default function OwnerTabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.colors.brand,
      tabBarInactiveTintColor: theme.colors.onSurfaceTertiary,
    }}>
      <Tabs.Screen name="dashboard" options={{
        title: t('tab_owner_orders'),
        tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="menu" options={{
        title: t('tab_owner_menu'),
        tabBarIcon: ({ color, size }) => <Ionicons name="fast-food-outline" size={size} color={color} />,
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
  );
}
