// Distance, fare ar ETA helper.
// Fare Prediction (onno member) ready hole estimateFare() er jaygay tar API call korben.
// Route Optimization ready hole haversineKm() er jaygay tar distance use korben.

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Fare rates in BDT
const RATES = {
  bike: { base: 30, perKm: 12, speedKmh: 25 },
  cng: { base: 40, perKm: 18, speedKmh: 20 },
  car: { base: 60, perKm: 25, speedKmh: 20 },
};

export const VEHICLE_TYPES = Object.keys(RATES);

export function estimateFare(distanceKm, vehicleType) {
  const r = RATES[vehicleType];
  if (!r) return null;
  return Math.round(r.base + distanceKm * r.perKm);
}

export function estimateMinutes(distanceKm, vehicleType) {
  const r = RATES[vehicleType];
  if (!r) return null;
  return Math.max(1, Math.round((distanceKm / r.speedKmh) * 60));
}

export function isValidPoint(p) {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    p.lat >= -90 && p.lat <= 90 &&
    p.lng >= -180 && p.lng <= 180
  );
}
