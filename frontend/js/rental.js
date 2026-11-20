const vehicleList = document.getElementById("vehicleList");
const resultMessage = document.getElementById("resultMessage");
const selectedVehicle = document.getElementById("selectedVehicle");
let availableVehicles = [];
async function loadVehicles() {
  resultMessage.textContent = "Loading vehicles...";
  vehicleList.replaceChildren();
  selectedVehicle.value = "";
  const filterStart = document.getElementById("filterStartDate").value;
  const filterEnd = document.getElementById("filterEndDate").value;
  if (Boolean(filterStart) !== Boolean(filterEnd)) {
    resultMessage.textContent = "Choose both rental start and end dates.";
    return;
  }
  if (filterStart && filterEnd < filterStart) {
    resultMessage.textContent = "Rental end date cannot be before the start date.";
    return;
  }
  const params = new URLSearchParams({
    type: document.getElementById("vehicleType").value,
    location: document.getElementById("location").value.trim(),
    max_price: document.getElementById("maxPrice").value
  });
  if (filterStart && filterEnd) {
    params.set("start_date", filterStart);
    params.set("end_date", filterEnd);
  }
  try {
    availableVehicles = await driveRequest(`/rental/vehicles?${params}`);
    resultMessage.textContent = `${availableVehicles.length} vehicle(s) found.`;
    availableVehicles.forEach(vehicle => {
      const card = document.createElement("article"); card.className = "vehicle-card";
      const image = document.createElement("img"); image.src = vehicle.image; image.alt = vehicle.name; image.loading = "lazy";
      const details = document.createElement("div"); details.className = "vehicle-details";
      const name = document.createElement("h3"); name.textContent = vehicle.name;
      const type = document.createElement("p"); type.textContent = vehicle.type;
      const location = document.createElement("p"); location.textContent = `Location: ${vehicle.location}`;
      const seats = document.createElement("p"); seats.textContent = `Seats: ${vehicle.seats}`;
      const price = document.createElement("p"); price.className = "vehicle-price"; price.textContent = `৳${Number(vehicle.price).toLocaleString("en-BD")} / day`;
      const button = document.createElement("button"); button.type = "button"; button.className = "primary-button"; button.textContent = "Book Now";
      button.addEventListener("click", () => {
        selectedVehicle.value = String(vehicle.id);
        if (filterStart && !startInput.value) startInput.value = filterStart;
        if (filterEnd && !endInput.value) endInput.value = filterEnd;
        document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
      });
      details.append(name, type, location, seats, price, button); card.append(image, details); vehicleList.appendChild(card);
    });
    if (!availableVehicles.length) resultMessage.textContent = "No vehicles match your search.";
    updateVehicleOptions(availableVehicles);
  } catch (error) {
    updateVehicleOptions([]);
    resultMessage.textContent = error.message || "Could not connect to the backend.";
  }
}
function updateVehicleOptions(vehicles) {
  const old = selectedVehicle.value; selectedVehicle.replaceChildren();
  const first = document.createElement("option"); first.value = ""; first.textContent = "Choose a vehicle"; selectedVehicle.appendChild(first);
  vehicles.forEach(vehicle => { const option = document.createElement("option"); option.value = vehicle.id; option.textContent = `${vehicle.name} - ${vehicle.type}`; selectedVehicle.appendChild(option); });
  if (vehicles.some(vehicle => String(vehicle.id) === old)) selectedVehicle.value = old;
}
document.getElementById("filterForm").addEventListener("submit", event => { event.preventDefault(); loadVehicles(); });
document.getElementById("filterForm").addEventListener("reset", () => setTimeout(loadVehicles, 0));
const filterFields = ["vehicleType", "location", "maxPrice", "filterStartDate", "filterEndDate"];
filterFields.forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    selectedVehicle.value = "";
    updateVehicleOptions([]);
    vehicleList.replaceChildren();
    resultMessage.textContent = "Filters changed. Search again to check current availability.";
  });
});
const today = new Date(); const localToday = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");
const startInput = document.getElementById("startDate"), endInput = document.getElementById("endDate");
const filterStartInput = document.getElementById("filterStartDate"), filterEndInput = document.getElementById("filterEndDate");
startInput.min = localToday; endInput.min = localToday;
filterStartInput.min = localToday; filterEndInput.min = localToday;
startInput.addEventListener("change", () => { endInput.min = startInput.value || localToday; });
filterStartInput.addEventListener("change", () => { filterEndInput.min = filterStartInput.value || localToday; });
document.getElementById("bookingForm").addEventListener("submit", async event => {
  event.preventDefault(); const message = document.getElementById("bookingMessage"); message.textContent = "Submitting your request...";
  const data = { customer_name: document.getElementById("customerName").value.trim(), vehicle_id: selectedVehicle.value, start_date: startInput.value, end_date: endInput.value };
  if (!data.vehicle_id) { message.textContent = "Please select a vehicle."; return; }
  try {
    const result = await driveRequest("/rental/bookings", { method: "POST", body: JSON.stringify(data) });
    message.textContent = result.message;
    event.target.reset(); startInput.min = localToday; endInput.min = localToday;
    await loadMyRentalBookings();
  } catch (error) { message.textContent = error.message; }
});
loadVehicles();
async function loadMyRentalBookings() {
  const root = document.getElementById('myRentalBookings');
  if (!root) return;
  if (!localStorage.getItem(DRIVE_TOKEN_KEY)) {
    root.textContent = 'Sign in to view your rental bookings.';
    return;
  }
  root.textContent = 'Loading your rental bookings…';
  try {
    const [bookings, payments] = await Promise.all([
      driveRequest('/rental/bookings'),
      driveRequest('/payments/me').catch(() => [])
    ]);
    root.replaceChildren();
    if (!bookings.length) {
      root.textContent = 'You have not submitted a rental request yet.';
      return;
    }
    const paymentByBooking = new Map((payments || []).filter(p => p.rental_booking_id).map(p => [p.rental_booking_id, p]));
    bookings.forEach(booking => {
      const card = document.createElement('article');
      card.className = 'ride-item';
      const vehicle = Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles || {};
      const title = document.createElement('strong');
      title.textContent = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle rental';
      const meta = document.createElement('div');
      meta.className = 'ride-meta';
      meta.textContent = new Date(booking.start_at).toLocaleDateString() + ' – ' + new Date(booking.end_at).toLocaleDateString()
        + ' · ' + Number(booking.total_amount).toLocaleString('en-BD') + ' ' + booking.currency
        + ' · ' + String(booking.status).toUpperCase();
      card.append(title, meta);
      const payment = paymentByBooking.get(booking.id);
      if (payment) {
        const state = document.createElement('small');
        state.className = 'ride-meta';
        state.textContent = 'Payment: ' + String(payment.status).toUpperCase() + ' · ' + String(payment.method).toUpperCase()
          + (payment.provider_reference ? ' · Transaction ID submitted' : '');
        card.append(state);
        if (payment.status === 'pending' && ['bkash', 'nagad'].includes(String(payment.method).toLowerCase()) && !payment.provider_reference) {
          const submit = document.createElement('button');
          submit.textContent = 'Submit transaction ID';
          submit.addEventListener('click', async () => {
            const reference = window.prompt('Enter your bKash/Nagad transaction ID (6–64 letters or numbers).');
            if (reference === null) return;
            try {
              const result = await driveRequest('/payments/' + encodeURIComponent(payment.id) + '/reference', {
                method: 'POST', body: JSON.stringify({ reference: reference.trim() })
              });
              document.getElementById('bookingMessage').textContent = result.message;
              await loadMyRentalBookings();
            } catch (error) {
              document.getElementById('bookingMessage').textContent = error.message;
            }
          });
          card.append(submit);
        }
      } else if (['approved', 'active'].includes(booking.status)) {
        const pay = document.createElement('button');
        pay.className = 'primary-button';
        pay.textContent = 'Pay / record payment';
        pay.addEventListener('click', async () => {
          const method = String(window.prompt('Choose payment method: cash, bkash, or nagad.', 'cash') || '').trim().toLowerCase();
          if (!['cash', 'bkash', 'nagad'].includes(method)) {
            document.getElementById('bookingMessage').textContent = 'Choose cash, bkash or nagad. Card gateway is not connected.';
            return;
          }
          pay.disabled = true;
          try {
            const result = await driveRequest('/payments/intent', {
              method: 'POST',
              body: JSON.stringify({ rentalBookingId: booking.id, method, currency: 'BDT' })
            });
            if (method === 'cash') {
              document.getElementById('bookingMessage').textContent = 'Cash payment recorded as pending. Admin confirms only after receiving cash.';
            } else {
              document.getElementById('bookingMessage').textContent = 'Payment record created. Transfer using merchant details provided by the DRIVE team, then submit the transaction ID.';
              const reference = window.prompt('After completing the ' + method.toUpperCase() + ' transfer, enter its transaction ID. Cancel to submit it later.');
              if (reference !== null && reference.trim()) {
                const submitted = await driveRequest('/payments/' + encodeURIComponent(result.payment.id) + '/reference', {
                  method: 'POST', body: JSON.stringify({ reference: reference.trim() })
                });
                document.getElementById('bookingMessage').textContent = submitted.message;
              }
            }
            await loadMyRentalBookings();
          } catch (error) {
            document.getElementById('bookingMessage').textContent = error.message;
            pay.disabled = false;
          }
        });
        card.append(pay);
      } else if (booking.status === 'pending') {
        const waiting = document.createElement('small');
        waiting.className = 'muted';
        waiting.textContent = 'Waiting for the Vehicle Owner to approve this request. Payment is not available yet.';
        card.append(waiting);
      }
      root.append(card);
    });
  } catch (error) {
    root.textContent = error.message || 'Could not load your rental bookings.';
  }
}
if (localStorage.getItem(DRIVE_TOKEN_KEY)) loadMyRentalBookings();
