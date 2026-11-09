import { store } from "../store.js";
import {
  haversineKm,
  estimateFare,
  estimateMinutes,
  isValidPoint,
  VEHICLE_TYPES,
} from "../utils/geo.js";

// Status flow: requested -> matched -> accepted -> ongoing -> completed (ba cancelled)
const TRANSITIONS = {
  requested: ["matched", "cancelled"],
  matched: ["accepted", "cancelled"],
  accepted: ["ongoing", "cancelled"],
  ongoing: ["completed"],
  completed: [],
  cancelled: [],
};

const SHARE_MAX_DESTINATION_GAP_KM = 3; // same direction dhorar limit (3 km radius)
const SHARE_EXTRA_FARE_RATIO = 0.3; // prottek extra passenger e total fare 30% bare

const emitStatus = (req, ride) => {
  const io = req.app.get("io");
  if (io) io.to(`ride:${ride.id}`).emit("ride:status", { rideId: ride.id, status: ride.status });
};

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// =============== Feature 4: Smart Ride Booking ===============

// GET /api/rides/options?pickupLat=&pickupLng=&destLat=&destLng=&vehicleType=
export function getOptions(req, res) {
  const { pickupLat, pickupLng, destLat, destLng, vehicleType } = req.query;
  const pickup = { lat: Number(pickupLat), lng: Number(pickupLng) };
  const destination = { lat: Number(destLat), lng: Number(destLng) };
  if (!isValidPoint(pickup) || !isValidPoint(destination)) {
    return bad(res, "pickupLat, pickupLng, destLat, destLng required");
  }
  if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) {
    return bad(res, `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}`);
  }

  const tripKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);

  const options = store
    .listDrivers()
    .filter((d) => d.available && (!vehicleType || d.vehicleType === vehicleType))
    .map((d) => {
      const toPickupKm = haversineKm(d.lat, d.lng, pickup.lat, pickup.lng);
      return {
        driverId: d.id,
        name: d.name,
        vehicleType: d.vehicleType,
        plate: d.plate,
        seats: d.seats,
        driverDistanceKm: Number(toPickupKm.toFixed(2)),
        arrivalMinutes: estimateMinutes(toPickupKm, d.vehicleType),
        estimatedFare: estimateFare(tripKm, d.vehicleType),
        estimatedTripMinutes: estimateMinutes(tripKm, d.vehicleType),
      };
    })
    .sort((a, b) => a.driverDistanceKm - b.driverDistanceKm);

  res.json({ tripDistanceKm: Number(tripKm.toFixed(2)), options });
}

// POST /api/rides
export function createRide(req, res) {
  const { passengerId, pickup, destination, vehicleType, isShared = false } = req.body || {};
  if (!passengerId) return bad(res, "passengerId is required");
  if (!isValidPoint(pickup) || !isValidPoint(destination)) return bad(res, "Valid pickup and destination coordinates are required");
  if (!VEHICLE_TYPES.includes(vehicleType)) return bad(res, `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}`);

  const distanceKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const estimatedFare = estimateFare(distanceKm, vehicleType);

  const ride = store.createRide({
    passengerId,
    pickup,
    destination,
    vehicleType,
    isShared: Boolean(isShared),
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedFare,
    estimatedMinutes: estimateMinutes(distanceKm, vehicleType),
    passengers: [{ passengerId, pickup, destination, fare: estimatedFare }],
    sharedFares: [{ passengerId, fare: estimatedFare }],
  });

  res.status(201).json(ride);
}

// GET /api/rides/:id
export function getRide(req, res) {
  const ride = store.getRide(req.params.id);
  if (!ride) return bad(res, "Ride not found", 404);
  const driver = ride.driverId ? store.getDriver(ride.driverId) : null;
  res.json({ ...ride, driver });
}

// PATCH /api/rides/:id/status
export function updateStatus(req, res) {
  const ride = store.getRide(req.params.id);
  if (!ride) return bad(res, "Ride not found", 404);

  const { status } = req.body || {};
  if (!TRANSITIONS[ride.status]?.includes(status)) {
    return bad(res, `Cannot transition status from ${ride.status} to ${status}`);
  }

  ride.status = status;
  if (["completed", "cancelled"].includes(status) && ride.driverId) {
    store.setDriverAvailable(ride.driverId, true);
  }
  emitStatus(req, ride);
  res.json(ride);
}

// =============== Feature 5: Smart Ride Match & Cost Sharing ===============

// POST /api/rides/match (Auto-Match Included)
export function matchRide(req, res) {
  const ride = store.getRide(req.body?.rideId);
  if (!ride) return bad(res, "Ride not found", 404);
  if (ride.status !== "requested") return bad(res, `Ride already ${ride.status}`);

  // STEP 2 LOGIC: Automatic Shared Ride Matching (≤ 3 km proximity & seats check)
  if (ride.isShared) {
    const openRides = store.listOpenSharedRides().filter((r) => r.id !== ride.id);

    const bestMatch = openRides.find((existingRide) => {
      if (existingRide.vehicleType !== ride.vehicleType) return false;

      const driver = store.getDriver(existingRide.driverId);
      if (!driver || existingRide.passengers.length >= driver.seats) return false;

      const destGap = haversineKm(
        existingRide.destination.lat,
        existingRide.destination.lng,
        ride.destination.lat,
        ride.destination.lng
      );
      const pickupGap = haversineKm(
        existingRide.pickup.lat,
        existingRide.pickup.lng,
        ride.pickup.lat,
        ride.pickup.lng
      );

      return destGap <= SHARE_MAX_DESTINATION_GAP_KM && pickupGap <= SHARE_MAX_DESTINATION_GAP_KM;
    });

    // Match and join automatically if a suitable trip exists
    if (bestMatch) {
      const passengerId = ride.passengerId;
      const pickup = ride.pickup;
      const destination = ride.destination;

      const ownKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
      const ownFare = estimateFare(ownKm, bestMatch.vehicleType);

      bestMatch.passengers.push({ passengerId, pickup, destination, fare: ownFare });

      // Recalculate split fares
      const n = bestMatch.passengers.length;
      const sumOwnFares = bestMatch.passengers.reduce((sum, p) => sum + p.fare, 0);
      const totalFare = Math.min(
        Math.round(bestMatch.estimatedFare * (1 + SHARE_EXTRA_FARE_RATIO * (n - 1))),
        sumOwnFares
      );

      bestMatch.sharedFares = bestMatch.passengers.map((p) => ({
        passengerId: p.passengerId,
        fare: Math.round((totalFare * p.fare) / sumOwnFares),
      }));
      bestMatch.totalSharedFare = totalFare;

      store.updateRideStatus(ride.id, "cancelled"); // Cancel standalone request

      const driver = store.getDriver(bestMatch.driverId);
      const io = req.app.get("io");
      if (io) io.to(`ride:${bestMatch.id}`).emit("ride:shared", { rideId: bestMatch.id, sharedFares: bestMatch.sharedFares, totalFare });

      return res.json({ ride: bestMatch, driver, autoMatched: true });
    }
  }

  // Standard Driver Matching Logic
  const candidates = store
    .listDrivers()
    .filter((d) => d.available && d.vehicleType === ride.vehicleType)
    .map((d) => ({
      driver: d,
      km: haversineKm(d.lat, d.lng, ride.pickup.lat, ride.pickup.lng),
    }))
    .sort((a, b) => a.km - b.km);

  if (candidates.length === 0) return bad(res, "No drivers available right now", 404);

  const { driver, km } = candidates[0];
  ride.driverId = driver.id;
  ride.status = "matched";
  ride.driverArrivalMinutes = estimateMinutes(km, driver.vehicleType);

  if (!ride.isShared) store.setDriverAvailable(driver.id, false);

  emitStatus(req, ride);
  res.json({ ride, driver, autoMatched: false });
}

// POST /api/rides/:id/share
export function shareRide(req, res) {
  const ride = store.getRide(req.params.id);
  if (!ride) return bad(res, "Ride not found", 404);
  if (!ride.isShared) return bad(res, "This is not a shared ride");
  if (!["matched", "accepted"].includes(ride.status)) return bad(res, "Cannot join this ride at the moment");

  const { passengerId, pickup, destination } = req.body || {};
  if (!passengerId) return bad(res, "passengerId is required");
  if (!isValidPoint(pickup) || !isValidPoint(destination)) return bad(res, "Valid pickup and destination are required");
  if (ride.passengers.some((p) => p.passengerId === passengerId)) return bad(res, "You are already part of this ride");

  const driver = store.getDriver(ride.driverId);
  if (ride.passengers.length >= driver.seats) return bad(res, "No seats available in this vehicle");

  const gap = haversineKm(
    destination.lat, destination.lng,
    ride.destination.lat, ride.destination.lng
  );
  if (gap > SHARE_MAX_DESTINATION_GAP_KM) {
    return bad(res, `Destination is too far (${gap.toFixed(1)} km). Max allowed is ${SHARE_MAX_DESTINATION_GAP_KM} km`);
  }

  const ownKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const ownFare = estimateFare(ownKm, ride.vehicleType);
  ride.passengers.push({ passengerId, pickup, destination, fare: ownFare });

  const n = ride.passengers.length;
  const sumOwnFares = ride.passengers.reduce((sum, p) => sum + p.fare, 0);
  const totalFare = Math.min(
    Math.round(ride.estimatedFare * (1 + SHARE_EXTRA_FARE_RATIO * (n - 1))),
    sumOwnFares
  );
  ride.sharedFares = ride.passengers.map((p) => ({
    passengerId: p.passengerId,
    fare: Math.round((totalFare * p.fare) / sumOwnFares),
  }));
  ride.totalSharedFare = totalFare;

  const yourFare = ride.sharedFares.find((f) => f.passengerId === passengerId).fare;

  const io = req.app.get("io");
  if (io) io.to(`ride:${ride.id}`).emit("ride:shared", { rideId: ride.id, sharedFares: ride.sharedFares, totalFare });

  res.json({
    rideId: ride.id,
    passengerCount: n,
    totalFare,
    yourFare,
    youSave: Math.max(0, ownFare - yourFare),
    sharedFares: ride.sharedFares,
  });
}

// GET /api/rides/shared/open
export function listOpenShared(req, res) {
  const rides = store.listOpenSharedRides().map((r) => {
    const driver = store.getDriver(r.driverId);
    return {
      id: r.id,
      destination: r.destination,
      vehicleType: r.vehicleType,
      passengerCount: r.passengers.length,
      seatsLeft: driver ? driver.seats - r.passengers.length : 0,
      status: r.status,
    };
  });
  res.json(rides);
}

// =============== Feature 6: Real-Time Ride Tracking ===============

// GET /api/rides/:id/track
export function trackRide(req, res) {
  const ride = store.getRide(req.params.id);
  if (!ride) return bad(res, "Ride not found", 404);

  const driver = ride.driverId ? store.getDriver(ride.driverId) : null;
  const loc = store.getLocation(ride.id) || (driver ? { lat: driver.lat, lng: driver.lng, updatedAt: null } : null);
  if (!loc) return bad(res, "No driver assigned yet", 404);

  const target = ride.status === "ongoing" ? ride.destination : ride.pickup;
  const remainingKm = haversineKm(loc.lat, loc.lng, target.lat, target.lng);

  res.json({
    rideId: ride.id,
    status: ride.status,
    driverLocation: loc,
    pickup: ride.pickup,
    destination: ride.destination,
    etaMinutes: estimateMinutes(remainingKm, ride.vehicleType),
    remainingKm: Number(remainingKm.toFixed(2)),
  });
}

// POST /api/rides/:id/simulate
const simulations = new Map();

export function simulateRide(req, res) {
  const ride = store.getRide(req.params.id);
  if (!ride) return bad(res, "Ride not found", 404);
  if (!ride.driverId) return bad(res, "Please match a ride first");
  if (simulations.has(ride.id)) return bad(res, "Simulation is already running");

  const io = req.app.get("io");
  const driver = store.getDriver(ride.driverId);
  const STEPS = 20;
  const TICK_MS = 1500;

  const legs = [
    { from: { lat: driver.lat, lng: driver.lng }, to: ride.pickup, statusAtEnd: "ongoing" },
    { from: ride.pickup, to: ride.destination, statusAtEnd: "completed" },
  ];
  let legIdx = 0;
  let step = 0;

  if (ride.status === "matched") ride.status = "accepted";
  emitStatus(req, ride);

  const timer = setInterval(() => {
    const leg = legs[legIdx];
    step += 1;
    const t = step / STEPS;
    const lat = leg.from.lat + (leg.to.lat - leg.from.lat) * t;
    const lng = leg.from.lng + (leg.to.lng - leg.from.lng) * t;

    store.setDriverPosition(driver.id, lat, lng);
    store.saveLocation(ride.id, lat, lng);

    const target = legIdx === 0 ? ride.pickup : ride.destination;
    const remainingKm = haversineKm(lat, lng, target.lat, target.lng);
    io.to(`ride:${ride.id}`).emit("ride:location", {
      rideId: ride.id,
      lat,
      lng,
      etaMinutes: estimateMinutes(remainingKm, ride.vehicleType),
      remainingKm: Number(remainingKm.toFixed(2)),
    });

    if (step >= STEPS) {
      ride.status = leg.statusAtEnd;
      emitStatus(req, ride);
      step = 0;
      legIdx += 1;
      if (legIdx >= legs.length) {
        clearInterval(timer);
        simulations.delete(ride.id);
        store.setDriverAvailable(driver.id, true);
      }
    }
  }, TICK_MS);

  simulations.set(ride.id, timer);
  res.json({ message: "Simulation started successfully", rideId: ride.id });
}