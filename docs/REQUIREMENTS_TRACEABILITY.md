# Requirements traceability

The source of truth is the faculty DRIVE requirement analysis (Functional, Non-functional and Domain Requirements). Status below is intentionally conservative.

| Faculty requirement | Current v2 implementation | Status |
|---|---|---|
| Authentication & Security | Supabase email/password Auth, refresh token endpoint, JWT user verification, RLS | Baseline implemented; end-to-end auth test pending |
| User Management | Existing profiles table and profile read/update endpoint | Partial; role application, admin approval and dashboards pending |
| Vehicle Rental | Verified vehicle catalogue, city/type/price filters, booking create/list, DB exclusion constraint preventing overlapping bookings | Partial; owner approval workflow and frontend date picker pending |
| Smart Ride Booking | Ride request creation, estimate, persistent request status | Partial; location autocomplete and full passenger flow pending |
| Smart Ride Match & Cost Sharing | Atomic verified-driver claim RPC and open shared request discovery | Partial; join flow, capacity checks and fare splitting pending |
| Real-Time Ride Tracking | Driver location persistence in trip_locations | Partial; passenger live map, ETA and realtime/polling UI pending |
| Smart Fare Prediction | BDT rule-based estimate with breakdown and range | Estimate implemented; not an ML model |
| AI Route Optimization | OSRM route alternatives | Partial; route selection UI and actual traffic-aware AI model pending |
| Multi-Currency Payment | FX conversion quote endpoint | Quote only; no gateway, payment collection or webhook verification |
| Women Safety Mode | Ride request stores women_safety_preference; only verified drivers can claim | Partial; user settings, trip sharing and contact notifications pending |
| Smart Emergency & Safe Trip | SOS alert record with optional coordinates; trusted contacts CRUD | Partial; automated delay/deviation monitoring and SMS/email dispatch pending |
| Tourist Mode | Public tourist place directory and saved itinerary | Partial; map route ordering and nearby recommendations pending |
| Performance | Indexed core foreign keys, booking overlap constraint, PostgreSQL persistence | Baseline; benchmark and load test pending |
| Usability | Responsive single-page UI and clear request states | Baseline; accessibility and usability audit pending |
| Scalability | Persistent Supabase PostgreSQL data model | Not capacity-certified; concurrent load testing pending |
| Security | RLS on all existing/new tables, privilege-change trigger, invoker claim RPC | Security advisor clean at latest check; penetration test pending |
| Portability | Responsive HTML/CSS/JS web frontend | Browser/device compatibility tests pending |

## Important operational boundaries
- Supabase database migrations are additive; the previous project tables were inspected and preserved.
- Real payment collection, external SOS notifications and live background tracking require separately configured providers/permissions.
- Do not describe a feature as complete until positive, negative, authorization and persistence tests pass.
