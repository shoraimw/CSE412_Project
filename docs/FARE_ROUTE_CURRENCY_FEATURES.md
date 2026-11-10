# Fare Prediction, Route Optimization & Multi-Currency

These features are implemented in the NestJS + TypeScript backend under \`backend/\`.

## Endpoints

- \`POST /api/fare/predict\` — rule-based BDT fare estimate.
- \`POST /api/routes/optimize\` — road route from OSRM, with an explicitly labelled straight-line fallback.
- \`GET /api/payments/currencies\` — supported currency codes.
- \`GET /api/payments/rates\` — cached live BDT exchange rates.
- \`POST /api/payments/quote\` — converts a BDT amount into a currency quote.

## Important scope and limitations

- Fare prediction is a transparent configurable rule-based estimate, not a trained ML model.
- Route optimization uses the public OSRM demo service and depends on its availability and usage policy. It is not an AI model or guaranteed navigation service.
- Currency conversion uses live rates from open.er-api.com, cached for one hour. If the provider is unavailable and no cached rates exist, the endpoint returns an error instead of silently using stale hard-coded rates.
- Payment quotes do not collect money. No payment gateway, webhook, settlement, refund or transaction persistence is configured.
- Do not add secret keys to source control. A production payment gateway must be selected after verifying merchant eligibility and compliance requirements.

## Example requests

\`\`\`json
POST /api/fare/predict
{ "distanceKm": 8.5, "vehicleType": "car", "traffic": "heavy", "demand": "medium", "time": "peak" }
\`\`\`

\`\`\`json
POST /api/routes/optimize
{ "pickupLat": 23.7808, "pickupLng": 90.4167, "destinationLat": 23.7465, "destinationLng": 90.376, "preference": "fastest" }
\`\`\`

\`\`\`json
POST /api/payments/quote
{ "amountBDT": 500, "currency": "USD", "rideId": "ride-example" }
\`\`\`
