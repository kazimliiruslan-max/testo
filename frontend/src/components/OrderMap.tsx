import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { theme } from '@/src/theme';

interface Props {
  courierLat?: number | null;
  courierLng?: number | null;
  destLat: number;
  destLng: number;
  restaurantLat?: number;
  restaurantLng?: number;
}

export default function OrderMap({ courierLat, courierLng, destLat, destLng, restaurantLat, restaurantLng }: Props) {
  const midLat = courierLat ?? restaurantLat ?? destLat;
  const midLng = courierLng ?? restaurantLng ?? destLng;

  return (
    <MapView
      testID="order-map"
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      <Marker coordinate={{ latitude: destLat, longitude: destLng }} title="Delivery Address" pinColor={theme.colors.brand} />
      {courierLat != null && courierLng != null && (
        <Marker coordinate={{ latitude: courierLat, longitude: courierLng }} title="Courier" pinColor="#007AFF" />
      )}
      {restaurantLat != null && restaurantLng != null && (
        <Marker coordinate={{ latitude: restaurantLat, longitude: restaurantLng }} title="Restaurant" pinColor="#34C759" />
      )}
    </MapView>
  );
}
