import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

const DEFAULT = { lat: 41.0369, lng: 28.9850 };

export default function LocationPickerWeb({ value, onChange, testID }: Props) {
  const [lat, setLat] = useState<number>(value?.lat ?? DEFAULT.lat);
  const [lng, setLng] = useState<number>(value?.lng ?? DEFAULT.lng);
  const [address, setAddress] = useState<string>(value?.address ?? '');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!value && typeof navigator !== 'undefined' && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const la = pos.coords.latitude;
          const ln = pos.coords.longitude;
          setLat(la);
          setLng(ln);
          onChange({ lat: la, lng: ln, address: address || `${la.toFixed(5)}, ${ln.toFixed(5)}` });
          setLocating(false);
        },
        () => setLocating(false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detect = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const ln = pos.coords.longitude;
        setLat(la); setLng(ln);
        onChange({ lat: la, lng: ln, address: address || `${la.toFixed(5)}, ${ln.toFixed(5)}` });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const commit = () => {
    onChange({ lat, lng, address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  };

  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.mapWrap}>
        {/* iframe works on RN Web */}
        {/* @ts-ignore — plain HTML on web */}
        <iframe
          title="map"
          src={embedUrl}
          width="100%"
          height="220"
          style={{ border: 0, borderRadius: 12 }}
          loading="lazy"
        />
        <Pressable
          testID="use-current-location-btn"
          style={styles.locateBtn}
          onPress={detect}
          disabled={locating}
        >
          {locating ? <ActivityIndicator size="small" color={theme.colors.brand} /> : <Ionicons name="locate" size={20} color={theme.colors.brand} />}
        </Pressable>
      </View>

      <Text style={styles.hint}>Enter your address below and use the locate button to auto-detect coordinates.</Text>

      <TextInput
        testID="picker-address-input"
        style={styles.addrInput}
        placeholder="Street, apartment, city..."
        placeholderTextColor={theme.colors.onSurfaceTertiary}
        value={address}
        onChangeText={(v) => { setAddress(v); onChange({ lat, lng, address: v }); }}
        multiline
      />

      <View style={styles.coordsRow}>
        <Ionicons name="location-outline" size={16} color={theme.colors.brand} />
        <Text style={styles.coordsTxt}>Lat {lat.toFixed(5)} · Lng {lng.toFixed(5)}</Text>
        <Pressable testID="commit-coords-btn" onPress={commit} style={styles.setBtn}>
          <Text style={styles.setBtnTxt}>Set</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.sm },
  mapWrap: { height: 220, borderRadius: theme.radius.md, overflow: 'hidden', position: 'relative', backgroundColor: theme.colors.surfaceSecondary },
  locateBtn: { position: 'absolute', top: theme.spacing.md, right: theme.spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  hint: { color: theme.colors.onSurfaceTertiary, fontSize: theme.font.sm, marginTop: theme.spacing.sm },
  addrInput: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.sm, fontSize: theme.font.base, color: theme.colors.onSurface, minHeight: 60 },
  coordsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm, backgroundColor: theme.colors.brandTertiary, padding: theme.spacing.md, borderRadius: theme.radius.md },
  coordsTxt: { flex: 1, color: theme.colors.onSurface, fontSize: theme.font.sm, fontWeight: '600' },
  setBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand },
  setBtnTxt: { color: '#fff', fontWeight: '700' },
});
