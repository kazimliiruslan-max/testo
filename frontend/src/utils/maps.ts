import { Linking, Platform } from 'react-native';

/**
 * Open native maps app with turn-by-turn directions to a destination.
 * iOS → Apple Maps (or Google Maps if user has it)
 * Android / Web → Google Maps
 */
export function openDirections(lat: number, lng: number, label?: string) {
  const enc = encodeURIComponent(label || 'Delivery');
  let url: string;
  if (Platform.OS === 'ios') {
    // Apple Maps: daddr = destination, dirflg=d for driving
    url = `http://maps.apple.com/?daddr=${lat},${lng}&q=${enc}&dirflg=d`;
  } else if (Platform.OS === 'android') {
    // Google Maps navigation intent
    url = `google.navigation:q=${lat},${lng}`;
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  Linking.openURL(url).catch(() => {
    // Fallback: universal Google Maps link
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
  });
}

/** Open a location pin (view, not directions) */
export function openLocation(lat: number, lng: number, label?: string) {
  const enc = encodeURIComponent(label || 'Location');
  let url: string;
  if (Platform.OS === 'ios') {
    url = `http://maps.apple.com/?ll=${lat},${lng}&q=${enc}`;
  } else if (Platform.OS === 'android') {
    url = `geo:${lat},${lng}?q=${lat},${lng}(${enc})`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() => {});
  });
}
