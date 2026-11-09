const AUTH_API = "../backend/auth.php";

async function sendAuthRequest(url, data) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    return await response.json();
}

function displayMessage(id, message, success) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = message;
        element.className = success
            ? "message success"
            : "message";
    }
}

// REGISTRATION
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const formData = Object.fromEntries(
            new FormData(registerForm).entries()
        );

        try {
            const result = await sendAuthRequest(
                AUTH_API + "?action=register",
                formData
            );

            displayMessage(
                "registerMessage",
                result.message,
                result.success
            );

            if (result.success) {
                setTimeout(function() {
                    window.location.href = result.redirect;
                }, 1000);
            }

        } catch (error) {
            displayMessage(
                "registerMessage",
                "Server connection failed. Check XAMPP.",
                false
            );
        }
    });
}

// LOGIN
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const formData = Object.fromEntries(
            new FormData(loginForm).entries()
        );

        try {
            const result = await sendAuthRequest(
                AUTH_API + "?action=login",
                formData
            );

            displayMessage(
                "loginMessage",
                result.message,
                result.success
            );

            if (result.success) {
                setTimeout(function() {
                    window.location.href = result.redirect;
                }, 1000);
            }

        } catch (error) {
            displayMessage(
                "loginMessage",
                "Server connection failed. Check XAMPP.",
                false
            );
        }
    });
}