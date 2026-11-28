# DRIVE ride workflow QA

This checklist covers the current ride lifecycle implementation. Run it with separate Passenger, Driver, Vehicle Owner and Admin accounts after test accounts are registered.

## 1. Booking and dispatch

- [ ] Passenger creates a ride with valid pickup and destination coordinates.
- [ ] Driver and Vehicle Owner accounts can also book a ride as customers.
- [ ] Admin accounts cannot create customer ride requests.
- [ ] Invalid coordinates, same pickup/destination and missing required fields are rejected.
- [ ] A driver who is online appears as a nearby marker to customers within the search radius.
- [ ] The first eligible driver to claim a request wins; a second driver cannot claim the same request.
- [ ] Driver location is not exposed as an exact public coordinate; nearby markers use the privacy-safe RPC.
- [ ] Driver status progresses through matched → driver_arriving → in_progress → completed.

## 2. Destination autocomplete and tourist currency

- [ ] Typing a pickup or drop-off address shows debounced location suggestions.
- [ ] Selecting a suggestion stores its coordinates; submitting does not re-geocode the selected result unnecessarily.
- [ ] Tourist Mode can select a preferred currency.
- [ ] Tourist Mode can select English or Bangla; signed-in users' language preference persists after reload.
- [ ] Fare estimates display the selected currency and BDT base amount.
- [ ] Cash, bKash and Nagad settlement remain BDT-only.
- [ ] Foreign-currency card checkout remains disabled until SSLCOMMERZ merchant credentials are configured.

## 3. Live chat and trip tracking

- [ ] Passenger and assigned Driver can exchange ride messages while the ride is matched, driver_arriving or in_progress.
- [ ] A non-participant cannot read or send ride messages.
- [ ] Chat closes when the ride is completed or cancelled.
- [ ] Driver GPS is stored while approaching pickup and during an active trip.
- [ ] Passenger tracking shows the assigned driver's latest location and destination.

The current chat UI refreshes messages every 2.5 seconds. The database table is available for Realtime integration, but the current browser workflow uses polling.

## 4. Passenger cancellation and emergency

- [ ] Passenger, Driver or Vehicle Owner who is a passenger on the ride can request cancellation with a reason.
- [ ] Before requesting cancellation, the Passenger sees that the current academic-build cancellation fee is BDT 0.
- [ ] Driver accounts can use customer cancellation only for rides they booked and joined as a passenger; the database verifies ride-passenger membership.
- [ ] The assigned Driver sees a pending cancellation request and can approve or decline it.
- [ ] Approval cancels the ride and notifies all ride passengers.
- [ ] Decline preserves the active ride and sends the requester the driver's response note.
- [ ] Emergency cancellation immediately cancels the ride, creates a safety alert and notifies the driver and administrators.
- [ ] A non-participant cannot request or approve cancellation.

Emergency contact SMS is not sent automatically. The user must tap the Call or Text link and confirm the action in their phone app.

## 5. Driver cancellation

- [ ] Assigned Driver accepts a request and cancels before pickup with a reason of at least 8 characters.
- [ ] Assigned Driver can end an in-progress trip with a required reason; a direct status PATCH to cancelled is rejected.
- [ ] During an active trip, the assigned Driver can end the ride with a required reason.
- [ ] The Passenger and Administrator are notified and the reason is recorded in ride activity.
- [ ] The Driver becomes available for another request after cancellation.
- [ ] During an active trip, the Passenger can also request cancellation; the assigned Driver must approve or decline it.
- [ ] Emergency cancellation remains immediate and creates a safety alert.

## 6. Destination reached and customer review

- [ ] Keep the Driver page open and share GPS during an active trip.
- [ ] Move the test device within 75 metres of the saved destination and keep it there for at least 15 seconds with continuous GPS samples.
- [ ] Verify the server automatically completes the ride after the two-sample geofence check when the reported current speed is at or below 15 km/h.
- [ ] Manual Complete trip remains available as a fallback when GPS is unavailable.
- [ ] Verify the Passenger receives a persisted Destination reached notification.
- [ ] Verify the Passenger and Driver each receive their own completion popup and the short sound plays when browser audio permissions allow it.
- [ ] Close the Passenger arrival popup and verify the star-review dialog opens.
- [ ] Select 1–5 stars and submit a comment.
- [ ] Verify duplicate reviews for the same ride are rejected.
- [ ] Passenger can submit a linked support/complaint case and view its status after Admin review.
- [ ] A confirmed payment shows a receipt number and the receipt page can be printed or saved as PDF.

## 7. Admin review

- [ ] Admin sees the ride activity timeline.
- [ ] Admin can review cancellation and safety alerts.
- [ ] Admin can cancel an uncompleted ride with a reason.
- [ ] Admin actions are written to the audit log.
- [ ] Admin can review payment proofs and update support cases.

## Test environment limitation

The connected Supabase project currently has zero Auth users and zero profiles. End-to-end role tests cannot be considered complete until trusted test accounts exist for Passenger, Driver, Vehicle Owner and Admin. The first Admin account must be bootstrapped using the documented trusted-account SQL procedure.
