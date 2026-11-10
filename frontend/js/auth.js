function showAuthMessage(id, message, success = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = success ? "message success" : "message";
}
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    try {
      const result = await driveRequest("/auth/register", { method: "POST", body: JSON.stringify(data) });
      localStorage.setItem(DRIVE_TOKEN_KEY, result.accessToken);
      showAuthMessage("registerMessage", "Account created. Opening your DRIVE dashboard...", true);
      setTimeout(() => window.location.href = "dashboard.html", 700);
    } catch (error) { showAuthMessage("registerMessage", error.message); }
  });
}
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());
    try {
      const result = await driveRequest("/auth/login", { method: "POST", body: JSON.stringify(data) });
      localStorage.setItem(DRIVE_TOKEN_KEY, result.accessToken);
      showAuthMessage("loginMessage", "Login successful. Opening your DRIVE dashboard...", true);
      setTimeout(() => window.location.href = "dashboard.html", 700);
    } catch (error) { showAuthMessage("loginMessage", error.message); }
  });
}
