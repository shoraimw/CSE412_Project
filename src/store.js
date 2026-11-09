// In-memory store. Pore database (MongoDB/PostgreSQL) use korle shudhu ei file replace korben.
// Baki code (controllers, socket) ei functions gulai call kore.

import { randomUUID } from "node:crypto";

const drivers = [
  { id: "d1", name: "Rahim", vehicleType: "car", plate: "DHAKA-METRO-GA-11-2345", seats: 3, available: true, lat: 23.7808, lng: 90.4167 },
  { id: "d2", name: "Karim", vehicleType: "car", plate: "DHAKA-METRO-KA-12-7788", seats: 3, available: true, lat: 23.7465, lng: 90.3760 },
  { id: "d3", name: "Sohel", vehicleType: "bike", plate: "DHAKA-METRO-LA-15-1122", seats: 1, available: true, lat: 23.7925, lng: 90.4078 },
  { id: "d4", name: "Jamal", vehicleType: "cng", plate: "DHAKA-METRO-THA-11-5566", seats: 2, available: true, lat: 23.7600, lng: 90.3890 },
  { id: "d5", name: "Babul", vehicleType: "bike", plate: "DHAKA-METRO-HA-13-9900", seats: 1, available: true, lat: 23.8103, lng: 90.4125 },
];

const rides = [];
const locations = new Map(); // rideId -> { lat, lng, updatedAt }

export const store = {
  // ---- drivers ----
  listDrivers: () => drivers,
  getDriver: (id) => drivers.find((d) => d.id === id),
  setDriverAvailable: (id, available) => {
    const d = drivers.find((x) => x.id === id);
    if (d) d.available = available;
    return d;
  },
  setDriverPosition: (id, lat, lng) => {
    const d = drivers.find((x) => x.id === id);
    if (d) {
      d.lat = lat;
      d.lng = lng;
    }
    return d;
  },

  // ---- rides ----
  createRide: (data) => {
    const ride = {
      id: randomUUID(),
      passengers: [],
      sharedFares: [],
      driverId: null,
      status: "requested",
      createdAt: new Date().toISOString(),
      ...data,
    };
    rides.push(ride);
    return ride;
  },
  getRide: (id) => rides.find((r) => r.id === id),
  listRides: () => rides,
  listOpenSharedRides: () =>
    rides.filter((r) => r.isShared && ["matched", "accepted"].includes(r.status)),

  // ---- live locations ----
  saveLocation: (rideId, lat, lng) => {
    const loc = { lat, lng, updatedAt: new Date().toISOString() };
    locations.set(rideId, loc);
    return loc;
  },
  getLocation: (rideId) => locations.get(rideId) || null,
};
