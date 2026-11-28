# Automatic Fare Estimate, Route Optimization & Multi-Currency

These features are implemented in the NestJS + TypeScript backend under `backend/`, with the preferred currency available in the customer booking and Tourist Mode interfaces.

## Endpoints

- `POST /api/fare/estimate` — rule-based BDT fare estimate.
- `POST /api/routes/optimize` — road route from OSRM, with an explicitly labelled straight-line fallback.
- `GET /api/payments/currencies` — supported currency codes.
- `GET /api/payments/rates` — cached live BDT exchange rates.
- `POST /api/payments/quote` — converts a BDT amount into an indicative currency quote.
- `POST /api/payments/intents` — creates a pending payment intent for supported checkout methods.
- `POST /api/payments/sslcommerz` — validates the hosted-checkout callback before marking a card payment paid.

## Fare, route and currency behaviour

- Fare calculation is a transparent deterministic formula using server-calculated road distance and selected vehicle rate. No ML model is used.
- Route optimization uses the public OSRM demo service and OpenStreetMap road data. It returns standard route estimates, not live traffic. It depends on the public demo's availability and usage policy and is not a guaranteed navigation service.
- Currency conversion uses live rates from open.er-api.com, cached for one hour. If the provider is unavailable and no cached rates exist, the endpoint returns an error instead of silently using hard-coded rates.
- The preferred currency is stored on the user profile and can be selected in Tourist Mode. Ride estimates can be displayed in that currency alongside their BDT base amount.
- Database fare and payment base amounts remain canonical BDT. Cash, bKash and Nagad manual settlement are BDT-only.
- Indicative quotes are not guaranteed gateway settlement amounts. SSLCOMMERZ applies its own conversion rate at checkout; the final BDT settlement amount may differ.

## Payment integration readiness

- SSLCOMMERZ hosted card checkout, payment-intent persistence, callback validation and finalization RPCs are implemented.
- The Cloudflare Worker currently has `DRIVE_PAYMENT_WEBHOOK_SECRET`, but does not have `SSLCOMMERZ_STORE_ID` or `SSLCOMMERZ_STORE_PASSWORD`. Therefore hosted card checkout is not ready until the merchant's sandbox or live credentials are added as Worker secrets.
- bKash and Nagad are currently manual-reference workflows: the customer submits a transaction reference and an administrator verifies it in the merchant account. No automatic bKash/Nagad gateway collection is configured.
- Cash is recorded as pending until the driver or rental owner confirms receipt.
- Never add merchant credentials or webhook secrets to source control.

## Example requests

```json
POST /api/fare/estimate
{ "distanceKm": 8.5, "vehicleType": "car", "durationMinutes": 24 }
```

```json
POST /api/routes/optimize
{ "pickupLat": 23.7808, "pickupLng": 90.4167, "destinationLat": 23.7465, "destinationLng": 90.376, "preference": "fastest" }
```

```json
POST /api/payments/quote
{ "amountBDT": 500, "currency": "USD", "rideId": "ride-example" }
```
