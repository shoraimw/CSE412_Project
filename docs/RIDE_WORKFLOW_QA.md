# DRIVE Ride Workflow — Manual QA Checklist

This checklist covers the ride-booking, dispatch, safety, communication, tourist-currency and feedback workflows added in the DRIVE completion branch.

## Test accounts and prerequisites

Create separate accounts for:
- Passenger
- Approved Driver
- Approved Vehicle Owner
- Administrator

The connected CSE412_Project Supabase database currently has no profile accounts, so the complete multi-user workflow still requires test accounts to be registered and the driver/owner applications approved.

For GPS tests, use HTTPS and grant browser location permission to the Driver page. Keep the Driver page open while testing online presence.

## 1. Booking permissions and RLS

- [ ] Passenger can create a ride request.
- [ ] Driver can open Ride and book as a customer.
- [ ] Vehicle Owner can open Ride and book as a customer.
- [ ] Each request stores the authenticated user's own ID as passenger_id.
- [ ] A user cannot spoof another passenger_id.
- [ ] Inactive users cannot create requests.
- [ ] Admin does not inherit customer booking permission.
- [ ] Each role can see its own booking history from My rides.

The database keeps BDT as the canonical ride-request and settlement currency.

## 2. Pickup and drop-off autocomplete

- [ ] Type at least three characters in Pickup and verify the suggestion list appears.
- [ ] Type a destination and verify the suggestion list appears.
- [ ] Select suggestions with mouse and keyboard.
- [ ] Verify the map markers, route, distance, duration and fare update.
- [ ] Verify manual map selection and pickup/drop-off swapping still work.
- [ ] Verify stale autocomplete responses do not overwrite newer results.

Autocomplete uses Photon. Respect the provider's public usage limits.

## 3. Tourist mode and multi-currency display

- [ ] Open Explore without signing in and browse tourist places.
- [ ] Change the Tourist display currency.
- [ ] Select USD, EUR, GBP, INR or another available currency on the ride screen.
- [ ] Verify converted fare estimates and the BDT equivalent are shown.
- [ ] Sign in, change currency, refresh and verify the preference persists.
- [ ] Verify unavailable rates fall back to BDT.
- [ ] Verify cash, bKash and Nagad settlement remains BDT.
- [ ] Verify SSLCOMMERZ only accepts currencies enabled in its gateway configuration.

Foreign currency selection is for display/quotes. It does not change the canonical BDT booking amount. Card settlement is limited to the gateway's configured supported currencies.

## 4. Nearby drivers and first acceptance

- [ ] Open Driver page and go online with GPS permission enabled.
- [ ] Open the Ride page in a separate Passenger account near the driver.
- [ ] Verify an online, verified, matching driver marker appears near pickup.
- [ ] Turn the driver offline and verify the marker disappears.
- [ ] Wait more than 45 seconds without GPS updates and verify stale markers disappear.
- [ ] Open the same ride request in two Driver accounts and accept at nearly the same time.
- [ ] Verify exactly one driver wins and the other receives an already-accepted response.
- [ ] Verify the customer sees the assigned driver and trip tracking.

Nearby-driver coordinates are rounded before they are sent to customers. Driver contact details are not exposed before assignment.

## 5. Ride chat

- [ ] After assignment, open chat from the Passenger My rides page.
- [ ] Open the same ride chat from the assigned Driver page.
- [ ] Send messages in both directions and verify they appear within a few seconds.
- [ ] Try opening the conversation from an unrelated account and verify access is denied.
- [ ] Complete or cancel the ride and verify chat becomes read-only.
- [ ] Verify existing conversation history remains visible to ride participants.

The current chat UI refreshes messages every 2.5 seconds. The database table is also added to the Supabase Realtime publication.

## 6. Cancellation and safety

### Normal passenger cancellation

- [ ] Passenger requests cancellation after a driver accepts.
- [ ] Verify a reason is required.
- [ ] Verify the assigned Driver sees the reason and can approve or decline.
- [ ] Approve and verify both parties receive the cancellation result.
- [ ] Repeat and decline; verify the ride remains active and the Passenger is notified.

### Emergency cancellation

- [ ] Passenger triggers Emergency cancel during an active ride.
- [ ] Verify a reason is required.
- [ ] Verify the ride is cancelled immediately without waiting for driver approval.
- [ ] Verify the driver and administrators receive an in-app alert.
- [ ] Verify the safety alert is linked to the ride and contains the available GPS location.
- [ ] Verify saved emergency contacts appear as Call/Text links.

Emergency contact SMS is not sent automatically. The user must tap the Call or Text link and confirm the action in their phone app.

### Driver cancellation

- [ ] Driver accepts a request and cancels before pickup.
- [ ] Driver starts a trip and ends it mid-journey with a reason.
- [ ] Verify a reason is required in both cases.
- [ ] Verify every Passenger on a shared ride and the Administrator are notified.
- [ ] Verify the cancellation appears in the activity timeline with the previous ride status.
- [ ] Verify the Driver can go online for another request.

## 7. Destination reached and customer review

- [ ] Keep the Driver page open and share GPS during an active trip.
- [ ] Move the test device within 75 metres of the saved destination and keep it there for at least 15 seconds.
- [ ] If the browser reports speed, keep it at or below 15 km/h during the dwell window.
- [ ] Verify the server automatically completes the ride after the two-sample geofence check.
- [ ] Verify manual Complete trip remains available as a fallback when GPS is unavailable.
- [ ] Driver completes the trip.
- [ ] Verify the Passenger receives a persisted Destination reached notification.
- [ ] Verify the Driver sees the completion popup.
- [ ] Verify both Passenger and Driver receive their own completion popup and the original short sound plays when browser audio permissions allow it.
- [ ] Close the Passenger arrival popup and verify the star-review dialog opens.
- [ ] Select 1–5 stars and submit a comment.
- [ ] Verify duplicate reviews for the same ride are rejected.
- [ ] Open the Driver profile and verify average rating and review count.
- [ ] Verify a driver with no reviews sees the New Driver message.

## 8. Administrator activity timeline

- [ ] Open Admin → Ride activity.
- [ ] Verify ride request creation and driver acceptance are recorded.
- [ ] Verify status changes show the actor and old/new status.
- [ ] Verify cancellation reasons and driver decisions are visible.
- [ ] Verify emergency cancellation appears with the actor and reason.
- [ ] Verify chat-message metadata and customer review submission are recorded.
- [ ] Verify an ordinary user cannot read the administrator activity timeline.

Chat event records contain message metadata (message ID and length), not private message content.

## Deployment and verification notes

- The Cloudflare preview Worker is configured to use the connected CSE412_Project Supabase project.
- The production Worker secrets have not been changed and production has not been deployed from this branch.
- The GitHub pull request remains a draft until the multi-account end-to-end checklist above is completed.
- Cloudflare build checks validate the NestJS typecheck/build, frontend JavaScript syntax, local asset references and Wrangler dry-run. They do not replace real multi-user browser testing.
