import { store } from "./store.js";
import { haversineKm, estimateMinutes } from "./utils/geo.js";

// Socket.io events
//  client -> server:
//    ride:join            { rideId }                         passenger/driver ride room e dhoke
//    driver:location      { rideId, lat, lng }               driver er live location pathay
//  server -> client:
//    ride:location        { rideId, lat, lng, etaMinutes, remainingKm }
//    ride:status          { rideId, status }
//    ride:shared          { rideId, sharedFares, totalFare }
export function registerSocket(io) {
  io.on("connection", (socket) => {
    socket.on("ride:join", ({ rideId } = {}) => {
      if (!rideId || !store.getRide(rideId)) return socket.emit("error:message", "Ride pawa jayni");
      socket.join(`ride:${rideId}`);

      // Join korar sathe sathe last known location pathai
      const last = store.getLocation(rideId);
      if (last) socket.emit("ride:location", { rideId, lat: last.lat, lng: last.lng });
    });

    socket.on("driver:location", ({ rideId, lat, lng } = {}) => {
      const ride = store.getRide(rideId);
      if (!ride || typeof lat !== "number" || typeof lng !== "number") return;

      store.saveLocation(rideId, lat, lng);
      if (ride.driverId) store.setDriverPosition(ride.driverId, lat, lng);

      const target = ride.status === "ongoing" ? ride.destination : ride.pickup;
      const remainingKm = haversineKm(lat, lng, target.lat, target.lng);
      io.to(`ride:${rideId}`).emit("ride:location", {
        rideId,
        lat,
        lng,
        etaMinutes: estimateMinutes(remainingKm, ride.vehicleType),
        remainingKm: Number(remainingKm.toFixed(2)),
      });
    });
  });
}
