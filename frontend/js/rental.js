const vehicleList = document.getElementById("vehicleList");
const resultMessage = document.getElementById("resultMessage");
const selectedVehicle = document.getElementById("selectedVehicle");
let availableVehicles = [];
async function loadVehicles() {
  resultMessage.textContent = "Loading vehicles...";
  vehicleList.replaceChildren();
  const params = new URLSearchParams({
    type: document.getElementById("vehicleType").value,
    location: document.getElementById("location").value.trim(),
    max_price: document.getElementById("maxPrice").value
  });
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
        document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
      });
      details.append(name, type, location, seats, price, button); card.append(image, details); vehicleList.appendChild(card);
    });
    if (!availableVehicles.length) resultMessage.textContent = "No vehicles match your search.";
    updateVehicleOptions(availableVehicles);
  } catch (error) { resultMessage.textContent = error.message || "Could not connect to the backend."; }
}
function updateVehicleOptions(vehicles) {
  const old = selectedVehicle.value; selectedVehicle.replaceChildren();
  const first = document.createElement("option"); first.value = ""; first.textContent = "Choose a vehicle"; selectedVehicle.appendChild(first);
  vehicles.forEach(vehicle => { const option = document.createElement("option"); option.value = vehicle.id; option.textContent = `${vehicle.name} - ${vehicle.type}`; selectedVehicle.appendChild(option); });
  if (vehicles.some(vehicle => String(vehicle.id) === old)) selectedVehicle.value = old;
}
document.getElementById("filterForm").addEventListener("submit", event => { event.preventDefault(); loadVehicles(); });
document.getElementById("filterForm").addEventListener("reset", () => setTimeout(loadVehicles, 0));
const today = new Date(); const localToday = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");
const startInput = document.getElementById("startDate"), endInput = document.getElementById("endDate");
startInput.min = localToday; endInput.min = localToday;
startInput.addEventListener("change", () => { endInput.min = startInput.value || localToday; });
document.getElementById("bookingForm").addEventListener("submit", async event => {
  event.preventDefault(); const message = document.getElementById("bookingMessage"); message.textContent = "Submitting your request...";
  const data = { customer_name: document.getElementById("customerName").value.trim(), vehicle_id: Number(selectedVehicle.value), start_date: startInput.value, end_date: endInput.value };
  if (!data.vehicle_id) { message.textContent = "Please select a vehicle."; return; }
  try {
    const result = await driveRequest("/rental/bookings", { method: "POST", body: JSON.stringify(data) });
    message.textContent = result.message + " (Demo only: booking is stored temporarily.)";
    event.target.reset(); startInput.min = localToday; endInput.min = localToday;
  } catch (error) { message.textContent = error.message; }
});
loadVehicles();