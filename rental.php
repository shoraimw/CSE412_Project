
<?php
header("Content-Type: application/json");

$vehicles = [
    [
        "id" => 1,
        "name" => "Toyota Axio",
        "type" => "Car",
        "location" => "Dhaka",
        "price" => 3000,
        "seats" => 5,
        "image" => "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600"
    ],
    [
        "id" => 2,
        "name" => "Honda Civic",
        "type" => "Car",
        "location" => "Chattogram",
        "price" => 4000,
        "seats" => 5,
        "image" => "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600"
    ],
    [
        "id" => 3,
        "name" => "Yamaha FZ",
        "type" => "Bike",
        "location" => "Dhaka",
        "price" => 1000,
        "seats" => 2,
        "image" => "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600"
    ]
];

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $type = $_GET["type"] ?? "All";
    $location = $_GET["location"] ?? "";
    $maxPrice = $_GET["max_price"] ?? "";

    $filteredVehicles = array_filter($vehicles, function ($vehicle) use ($type, $location, $maxPrice) {
        $matchesType = ($type === "All" || $vehicle["type"] === $type);
        $matchesLocation = ($location === "" || stripos($vehicle["location"], $location) !== false);
        $matchesPrice = ($maxPrice === "" || $vehicle["price"] <= (float) $maxPrice);

        return $matchesType && $matchesLocation && $matchesPrice;
    });

    echo json_encode(array_values($filteredVehicles));
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(["message" => "Invalid booking information."]);
        exit;
    }

    $vehicleId = filter_var($data["vehicle_id"] ?? null, FILTER_VALIDATE_INT);
    $customerName = trim($data["customer_name"] ?? "");
    $startDate = $data["start_date"] ?? "";
    $endDate = $data["end_date"] ?? "";

    $vehicleExists = false;

    foreach ($vehicles as $vehicle) {
        if ($vehicle["id"] === $vehicleId) {
            $vehicleExists = true;
            break;
        }
    }

    $start = DateTime::createFromFormat("!Y-m-d", $startDate);
    $end = DateTime::createFromFormat("!Y-m-d", $endDate);
    $today = new DateTime("today");

    if (!$vehicleId || !$vehicleExists || $customerName === "" ||
        !$start || !$end ||
        $start->format("Y-m-d") !== $startDate ||
        $end->format("Y-m-d") !== $endDate ||
        $start < $today || $end < $start) {

        http_response_code(400);
        echo json_encode(["message" => "Please provide valid booking details."]);
        exit;
    }

    echo json_encode([
        "message" => "Booking request received successfully.",
        "vehicle_id" => $vehicleId,
        "customer_name" => $customerName,
        "start_date" => $startDate,
        "end_date" => $endDate
    ]);
    exit;
}

http_response_code(405);
echo json_encode(["message" => "Method not allowed."]);
