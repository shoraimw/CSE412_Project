# Requirements traceability

| Faculty requirement | Rebuild coverage | Status |
|---|---|---|
| Authentication & Security | Supabase Auth, JWT validation, RLS | Baseline; verify configured project |
| User Management | Profile and role fields | Partial; admin approval UI pending |
| Vehicle Rental | Catalogue, filters, booking request | Partial; overlap/owner approval pending |
| Smart Ride Booking | Request and fare calculation | Partial; dispatch UI pending |
| Ride Match & Cost Sharing | Shared ride flag only | Not complete |
| Real-Time Tracking | GPS endpoint and persistence schema | Partial; live map/subscription pending |
| Smart Fare Prediction | Rule-based estimate | Implemented estimate, not ML |
| AI Route Optimization | OSRM road route alternatives | Partial; not AI/ML |
| Multi-Currency Payment | FX quote | Quote only; real gateway pending |
| Women Safety Mode | Trusted contacts | Partial; verified preference and trip sharing pending |
| Emergency & Safe Trip | SOS alert record | Partial; external alerts/anomaly detection pending |
| Tourist Mode | Place directory and itinerary selection | Partial; route ordering pending |
| Performance | DB indexes, validation baseline | Load test pending |
| Usability | Responsive UI baseline | Accessibility audit pending |
| Scalability | PostgreSQL persistence | Capacity/load test pending |
| Security | JWT and RLS baseline | Security audit pending |
| Portability | Responsive browser UI | Cross-browser test pending |
