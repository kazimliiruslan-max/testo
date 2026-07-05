import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { theme } from '@/src/theme';

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  testID?: string;
}

const DEFAULT_REGION = { latitude: 41.0369, longitude: 28.9850, latitudeDelta: 0.02, longitudeDelta: 0.02 };

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const p = res?.[0];
    if (!p) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const parts = [p.name, p.street, p.district || p.subregion, p.city, p.region, p.country]
      .filter((x): x is string => !!x && x.trim().length > 0);
    return parts.length ? parts.join(', ') : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export default function LocationPicker({ value, onChange, testID }: Props) {
  const [region, setRegion] = useState({
    latitude: value?.lat ?? DEFAULT_REGION.latitude,
    longitude: value?.lng ?? DEFAULT_REGION.longitude,
    latitudeDelta: DEFAULT_REGION.latitudeDelta,
    longitudeDelta: DEFAULT_REGION.longitudeDelta,
  });
  const [locating, setLocating] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);

  useEffect(() => {
    if (!value) {
      // Try to auto-detect once on mount
      requestCurrentLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestCurrentLocation = async (silent = false) => {
    setLocating(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) setPermBlocked(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const address = await reverseGeocode(lat, lng);
      setRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      onChange({ lat, lng, address });
    } catch {
      if (!silent) setPermBlocked(true);
    } finally {
      setLocating(false);
    }
  };

  const onDragEnd = async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const address = await reverseGeocode(latitude, longitude);
    onChange({ lat: latitude, lng: longitude, address });
  };

  const onRegionChangeComplete = (r: any) => {
    setRegion(r);
  };

  const useCenter = async () => {
    const address = await reverseGeocode(region.latitude, region.longitude);
    onChange({ lat: region.latitude, lng: region.longitude, address });
  };

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.mapWrap}>
        <MapView
          provider={provider}
          style={styles.map}
          region={region}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {value && (
            <Marker
              coordinate={{ latitude: value.lat, longitude: value.lng }}
              draggable
              onDragEnd={onDragEnd}
              pinColor={theme.colors.brand}
            />
          )}
        </MapView>
        {/* Center pin overlay for pan-and-drop UX */}
        <View pointerEvents="none" style={styles.centerPin}>
          <Ionicons name="location" size={36} color={theme.colors.brand} />
        </View>

        <Pressable
          testID="use-current-location-btn"
          style={styles.locateBtn}
          onPress={() => requestCurrentLocation()}
          disabled={locating}
        >
          {locating ? <ActivityIndicator size="small" color={theme.colors.brand} /> : <Ionicons name="locate" size={20} color={theme.colors.brand} />}
        </Pressable>
      </View>

      {permBlocked && (
        <View style={styles.warnBox}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.warning} />
          <Text style={styles.warnTxt}>Location permission denied</Text>
          <Pressable onPress={() => Linking.openSettings()} style={styles.warnBtn}>
            <Text style={styles.warnBtnTxt}>Open Settings</Text>
          </Pressable>
        </View>
      )}

      <Pressable testID="drop-pin-here-btn" onPress={useCenter} style={styles.confirmBtn}>
        <Ionicons name="pin" size={16} color="#fff" />
        <Text style={styles.confirmTxt}>Drop pin here</Text>
      </Pressable>

      {value && (
        <View style={styles.addrBox}>
          <Ionicons name="location" size={16} color={theme.colors.brand} />
          <Text style={styles.addrTxt}>{value.address}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.sm },
  mapWrap: { height: 220, borderRadius: theme.radius.md, overflow: 'hidden', position: 'relative', backgroundColor: theme.colors.surfaceSecondary },
  map: { ...StyleSheet.absoluteFillObject },
  centerPin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -18, marginTop: -36 },
  locateBtn: { position: 'absolute', top: theme.spacing.md, right: theme.spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.brand, paddingVertical: 10, borderRadius: theme.radius.pill, marginTop: theme.spacing.sm },
  confirmTxt: { color: '#fff', fontWeight: '700' },
  addrBox: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: theme.spacing.sm, backgroundColor: theme.colors.brandTertiary, padding: theme.spacing.md, borderRadius: theme.radius.md },
  addrTxt: { flex: 1, color: theme.colors.onSurface, fontSize: theme.font.sm, fontWeight: '600' },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm, backgroundColor: '#FFF6E6', padding: theme.spacing.sm, borderRadius: theme.radius.md },
  warnTxt: { flex: 1, color: theme.colors.onSurface, fontSize: theme.font.sm },
  warnBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.warning },
  warnBtnTxt: { color: '#fff', fontWeight: '700', fontSize: theme.font.sm },
});
