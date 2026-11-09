# DRIVE Server: Ride Booking, Match & Cost Sharing, Live Tracking

Features 4, 5, 6. Data ekhon in-memory (`src/store.js`). Database pore add korle shudhu `store.js` replace korben.

## Run

```bash
cd server
npm install
npm run dev        # http://localhost:5000
```

## API

### Feature 4: Smart Ride Booking
| Method | URL | Kaj |
|---|---|---|
| GET | `/api/rides/options?pickupLat=&pickupLng=&destLat=&destLng=&vehicleType=` | Available driver + fare + time |
| POST | `/api/rides` | Ride request |
| GET | `/api/rides/:id` | Booking status |
| PATCH | `/api/rides/:id/status` | Status update (`{ "status": "accepted" }`) |

### Feature 5: Match & Cost Sharing
| Method | URL | Kaj |
|---|---|---|
| POST | `/api/rides/match` | Nearest driver assign (`{ "rideId": "..." }`) |
| GET | `/api/rides/shared/open` | Join kora jabe emon shared ride |
| POST | `/api/rides/:id/share` | Shared ride e join + fare bhag |

Cost sharing formula:
1. `totalFare = min( baseFare * (1 + 0.3 * (passengers - 1)), sum of every passenger's solo fare )`
2. Each passenger pays `totalFare * (own solo fare / sum of solo fares)`, so nobody pays more than riding alone.

### Feature 6: Real-Time Tracking
| Method | URL | Kaj |
|---|---|---|
| GET | `/api/rides/:id/track` | Last location + ETA |
| POST | `/api/rides/:id/simulate` | Demo: driver ke chalaiye live location emit kore |

Socket.io events:
- client -> server: `ride:join {rideId}`, `driver:location {rideId, lat, lng}`
- server -> client: `ride:location`, `ride:status`, `ride:shared`

## Quick test (curl)

```bash
# 1. Ride request
curl -X POST localhost:5000/api/rides -H "Content-Type: application/json" -d '{
  "passengerId":"u1","vehicleType":"car","isShared":true,
  "pickup":{"lat":23.7808,"lng":90.4167,"address":"Gulshan 1"},
  "destination":{"lat":23.7465,"lng":90.3760,"address":"Dhanmondi"}
}'

# 2. Match (rideId upor er response theke)
curl -X POST localhost:5000/api/rides/match -H "Content-Type: application/json" -d '{"rideId":"<ID>"}'

# 3. Onno passenger join
curl -X POST localhost:5000/api/rides/<ID>/share -H "Content-Type: application/json" -d '{
  "passengerId":"u2",
  "pickup":{"lat":23.79,"lng":90.41},
  "destination":{"lat":23.7500,"lng":90.3800}
}'

# 4. Live tracking demo
curl -X POST localhost:5000/api/rides/<ID>/simulate
curl localhost:5000/api/rides/<ID>/track
```

## Onno member der sathe integration
- **Auth:** ekhon `passengerId` body theke ashe. Auth ready hole JWT middleware diye `req.user.id` use korben.
- **Fare:** `utils/geo.js` er `estimateFare()` replace korben Smart Fare Prediction er function diye.
- **Route:** `haversineKm()` replace korben AI Route Optimization er distance diye.
