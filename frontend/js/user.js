function showProfileMessage(message, success = false) {
  const element = document.getElementById("profileMessage");
  element.textContent = message;
  element.className = success ? "message success" : "message";
}
async function loadUserProfile() {
  try {
    const user = await driveRequest("/users/me");
    document.getElementById("profileName").value = user.full_name || user.name || "";
    document.getElementById("profileEmail").value = user.email;
    document.getElementById("profilePhone").value = user.phone || "";
    document.getElementById("profileRole").value = user.role;
  } catch (error) {
    showProfileMessage(error.message);
    if (error.message.toLowerCase().includes("log in") || error.message.toLowerCase().includes("session")) {
      localStorage.removeItem(DRIVE_TOKEN_KEY);
      setTimeout(() => window.location.href = "login.html", 900);
    }
  }
}
const profileForm = document.getElementById("profileForm");
if (profileForm) {
  loadUserProfile();
  profileForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(profileForm).entries());
    try {
      const result = await driveRequest("/users/me", { method: "PATCH", body: JSON.stringify(data) });
      if (result.user) {
        document.getElementById("profileName").value = result.user.full_name || result.user.name || data.name || "";
        document.getElementById("profilePhone").value = result.user.phone || "";
      }
      showProfileMessage(result.message, true);
    } catch (error) { showProfileMessage(error.message); }
  });
}
document.getElementById("logoutButton")?.addEventListener("click", () => {
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem("drive_refresh_token");
  localStorage.removeItem("drive_user");
  window.location.href = "login.html";
});
