<<<<<<< HEAD
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
=======
# DRIVE – Vehicle Rental, Authentication & User Management

This branch contains Member 1's DRIVE features.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, TypeScript and NestJS
- Communication: REST API using JavaScript `fetch()`
- Data: In-memory sample data (no database connected yet)

## Backend setup
1. Install Node.js 20 or later.
2. Open a terminal in the `backend` folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the NestJS server:
   ```bash
   npm run start:dev
   ```
5. The API base URL is `http://localhost:3000/api`.

Check the vehicle endpoint in a browser:
`http://localhost:3000/api/rental/vehicles`

It returns the three sample vehicles (two cars and one bike).

## Frontend setup
1. Start Apache in XAMPP.
2. Keep the project inside your XAMPP `htdocs` folder.
3. Open `http://localhost:8080/CSE412_Project/frontend/vehicles.html` (adjust the port or folder name if yours differs).
4. Register an account, then log in. Profile and booking endpoints require a login.

## API endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Log in and receive a JWT |
| POST | `/api/auth/logout` | Logout message (the frontend clears its token) |
| GET | `/api/users/me` | View profile (login required) |
| PATCH | `/api/users/me` | Update profile (login required) |
| GET | `/api/rental/vehicles` | List/filter vehicles |
| POST | `/api/rental/bookings` | Submit a booking (login required) |

Vehicle filters: `type`, `location`, and `max_price`.

## Important demo limitations
- Users, vehicles and bookings are stored in server memory. They reset when the backend restarts.
- This is a local academic demo, not production authentication. Set a private `JWT_SECRET` before deployment and configure CORS for the real frontend origin.
- A database, payment service and real booking persistence have not been connected.
- Register a new account to test; the old PHP demo account is not preloaded.
>>>>>>> 5a3758143ef69d7e428749c14b89104ba476dae7
