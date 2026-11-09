const USER_API = "../backend/user.php";

// LOAD USER PROFILE
async function loadUserProfile() {

    try {

        const response = await fetch(USER_API);
        const result = await response.json();

        if (!result.success) {

            if (result.redirect) {
                window.location.href = result.redirect;
                return;
            }

            showProfileMessage(result.message, false);
            return;
        }

        document.getElementById("profileName").value =
            result.user.name;

        document.getElementById("profileEmail").value =
            result.user.email;

        document.getElementById("profilePhone").value =
            result.user.phone || "";

        document.getElementById("profileRole").value =
            result.user.role;

    } catch (error) {

        showProfileMessage(
            "Unable to load profile. Check XAMPP.",
            false
        );
    }
}

// SHOW MESSAGE
function showProfileMessage(message, success) {

    const element = document.getElementById("profileMessage");

    element.textContent = message;

    element.className = success
        ? "message success"
        : "message";
}

// UPDATE PROFILE
const profileForm = document.getElementById("profileForm");

if (profileForm) {

    loadUserProfile();

    profileForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const formData = Object.fromEntries(
            new FormData(profileForm).entries()
        );

        try {

            const response = await fetch(USER_API, {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(formData)

            });

            const result = await response.json();

            showProfileMessage(
                result.message,
                result.success
            );

        } catch (error) {

            showProfileMessage(
                "Unable to update profile. Check XAMPP.",
                false
            );
        }
    });
}

// LOGOUT
const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {

    logoutButton.addEventListener("click", async function() {

        try {

            const response = await fetch(
                "../backend/auth.php?action=logout",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({})
                }
            );

            const result = await response.json();

            if (result.success) {
                window.location.href = "login.html";
            } else {
                showProfileMessage(result.message, false);
            }

        } catch (error) {

            showProfileMessage(
                "Logout failed. Check XAMPP.",
                false
            );
        }
    });
}