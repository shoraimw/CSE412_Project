<?php
session_start();

header("Content-Type: application/json; charset=UTF-8");

// Initialize temporary demo users if needed
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

function output($success, $message, $extra = []) {
    echo json_encode(array_merge([
        "success" => $success,
        "message" => $message
    ], $extra));
    exit;
}

// Check whether the user is logged in
if (!isset($_SESSION["user_id"])) {
    output(false, "Please login first.", [
        "redirect" => "login.html"
    ]);
}

// Find the logged-in user
$userIndex = null;

foreach ($users as $index => $user) {
    if ($user["id"] === $_SESSION["user_id"]) {
        $userIndex = $index;
        break;
    }
}

if ($userIndex === null) {
    output(false, "User account not found. Please register again.");
}

// VIEW PROFILE
if ($_SERVER["REQUEST_METHOD"] === "GET") {

    $profile = $users[$userIndex];

    unset($profile["password"]);

    output(true, "Profile loaded successfully.", [
        "user" => $profile
    ]);
}

// UPDATE PROFILE
if ($_SERVER["REQUEST_METHOD"] === "POST") {

    $data = json_decode(file_get_contents("php://input"), true);

    if (!is_array($data)) {
        output(false, "Invalid form information.");
    }

    $name = trim($data["name"] ?? "");
    $phone = trim($data["phone"] ?? "");
    $role = $data["role"] ?? "Passenger";

    if ($name === "") {
        output(false, "Name cannot be empty.");
    }

    if (!in_array($role, ["Passenger", "Driver", "Vehicle Owner"], true)) {
        $role = "Passenger";
    }

    $users[$userIndex]["name"] = $name;
    $users[$userIndex]["phone"] = $phone;
    $users[$userIndex]["role"] = $role;

    $profile = $users[$userIndex];

    unset($profile["password"]);

    output(true, "Profile updated successfully.", [
        "user" => $profile
    ]);
}

output(false, "Invalid request method.");
?>