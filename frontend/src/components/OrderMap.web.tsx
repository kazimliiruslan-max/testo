import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/theme';

interface Props {
  courierLat?: number | null;
  courierLng?: number | null;
  destLat: number;
  destLng: number;
  restaurantLat?: number;
  restaurantLng?: number;
}

export default function OrderMap({ courierLat, courierLng, destLat, destLng }: Props) {
  return (
    <View style={styles.webMap} testID="order-map">
      <Ionicons name="map-outline" size={64} color={theme.colors.brand} />
      <Text style={styles.webMapTitle}>Live Map</Text>
      <Text style={styles.webMapDesc}>Map view available on mobile devices.</Text>
      {courierLat != null && courierLng != null && (
        <Text style={styles.webMapDesc}>Courier: {courierLat.toFixed(4)}, {courierLng.toFixed(4)}</Text>
      )}
      <Text style={styles.webMapDesc}>Destination: {destLat.toFixed(4)}, {destLng.toFixed(4)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  webMap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  webMapTitle: { fontSize: theme.font.xl, fontWeight: '800', color: theme.colors.onSurface },
  webMapDesc: { color: theme.colors.onSurfaceSecondary, fontSize: theme.font.base },
});
