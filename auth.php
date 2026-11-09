<?php
session_start();

header("Content-Type: application/json; charset=UTF-8");

// Temporary demo users stored in PHP session
if (!isset($_SESSION["demo_users"])) {
    $_SESSION["demo_users"] = [
        [
            "id" => 1,
            "name" => "Demo User",
            "email" => "demo@drive.com",
            "password" => password_hash("Drive123", PASSWORD_DEFAULT),
            "phone" => "01700000000",
            "role" => "Passenger"
        ]
    ];
}

$users = &$_SESSION["demo_users"];

function respond($success, $message, $extra = []) {
    echo json_encode(array_merge([
        "success" => $success,
        "message" => $message
    ], $extra));
    exit;
}

function getInput() {
    $data = json_decode(file_get_contents("php://input"), true);
    return is_array($data) ? $data : [];
}

$action = $_GET["action"] ?? "";
$method = $_SERVER["REQUEST_METHOD"];

// USER REGISTRATION
if ($action === "register" && $method === "POST") {

    $data = getInput();

    $name = trim($data["name"] ?? "");
    $email = strtolower(trim($data["email"] ?? ""));
    $phone = trim($data["phone"] ?? "");
    $password = $data["password"] ?? "";
    $role = $data["role"] ?? "Passenger";

    if ($name === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(false, "Please enter a valid name and email.");
    }

    if (strlen($password) < 6) {
        respond(false, "Password must contain at least 6 characters.");
    }

    foreach ($users as $user) {
        if ($user["email"] === $email) {
            respond(false, "This email is already registered.");
        }
    }

    if (!in_array($role, ["Passenger", "Driver", "Vehicle Owner"], true)) {
        $role = "Passenger";
    }

    $newUser = [
        "id" => count($users) ? max(array_column($users, "id")) + 1 : 1,
        "name" => $name,
        "email" => $email,
        "password" => password_hash($password, PASSWORD_DEFAULT),
        "phone" => $phone,
        "role" => $role
    ];

    $users[] = $newUser;

    $_SESSION["user_id"] = $newUser["id"];

    respond(true, "Registration successful!", [
        "redirect" => "profile.html"
    ]);
}

// USER LOGIN
if ($action === "login" && $method === "POST") {

    $data = getInput();

    $email = strtolower(trim($data["email"] ?? ""));
    $password = $data["password"] ?? "";

    foreach ($users as $user) {

        if (
            $user["email"] === $email &&
            password_verify($password, $user["password"])
        ) {
            $_SESSION["user_id"] = $user["id"];

            respond(true, "Login successful!", [
                "redirect" => "profile.html"
            ]);
        }
    }

    respond(false, "Incorrect email or password.");
}

// USER LOGOUT
if ($action === "logout" && $method === "POST") {

    unset($_SESSION["user_id"]);

    respond(true, "Logout successful!", [
        "redirect" => "login.html"
    ]);
}

respond(false, "Invalid request.");
?>