/**
 * Delivery-related utility helpers.
 */

const EARTH_R_KM = 6371;

/** Haversine distance between two GPS coords in kilometers. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

/**
 * Estimate delivery ETA range in minutes for a courier at (lat, lng)
 * heading to (destLat, destLng). Returns a small human-friendly range
 * assuming urban courier averages between {slow} and {fast} km/h.
 */
export function estimateEtaRange(
  courierLat: number,
  courierLng: number,
  destLat: number,
  destLng: number,
  { slowKmh = 18, fastKmh = 32, prepMin = 2 }: { slowKmh?: number; fastKmh?: number; prepMin?: number } = {},
): { min: number; max: number; distanceKm: number } {
  const distanceKm = haversineKm(courierLat, courierLng, destLat, destLng);
  // travel time in minutes = km / kmh * 60
  const fast = (distanceKm / fastKmh) * 60 + prepMin;
  const slow = (distanceKm / slowKmh) * 60 + prepMin;
  const min = Math.max(1, Math.round(fast));
  const max = Math.max(min + 1, Math.round(slow));
  return { min, max, distanceKm };
}

/** Format an ETA range for the UI: "~5–8 min" or "~2 min" when tight. */
export function formatEtaRange(min: number, max: number, mLabel = 'min'): string {
  if (max - min <= 1) return `~${min} ${mLabel}`;
  return `~${min}–${max} ${mLabel}`;
}
