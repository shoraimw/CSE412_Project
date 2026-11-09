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
