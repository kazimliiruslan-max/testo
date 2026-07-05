import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';
import { useI18n } from '@/src/context/I18nContext';

export default function CourierTabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.colors.brand,
      tabBarInactiveTintColor: theme.colors.onSurfaceTertiary,
    }}>
      <Tabs.Screen name="deliveries" options={{
        title: t('tab_courier_deliveries'),
        tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: t('tab_profile'),
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
      }} />
    </Tabs>
  );
}
