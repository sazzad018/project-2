<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Handle preflight request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get posted data
$data = json_decode(file_get_contents("php://input"));

if (
    !empty($data->api_key) &&
    !empty($data->senderid) &&
    !empty($data->msg) &&
    !empty($data->contacts)
) {
    // Use the URL from the request config or default to mram.com.bd
    $url = isset($data->url) && !empty($data->url) ? $data->url : "https://sms.mram.com.bd/smsapi";
    
    // Default to text if not provided
    $type = isset($data->type) ? $data->type : 'text'; 
    
    // Prepare data structure matching the provider's requirement
    $postData = [
      "api_key" => $data->api_key,
      "type" => $type,
      "contacts" => $data->contacts,
      "senderid" => $data->senderid,
      "msg" => $data->msg,
    ];
    
    // Optional: Scheduled Date Time
    if (!empty($data->scheduledDateTime)) {
        $postData['scheduledDateTime'] = $data->scheduledDateTime;
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    
    curl_close($ch);

    if ($curlError) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "cURL Error: " . $curlError]);
    } else {
        // Return success with the raw response from the provider
        echo json_encode([
            "success" => true, 
            "message" => "Request processed",
            "provider_response" => $response, 
            "http_code" => $httpCode
        ]);
    }
} else {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Incomplete data. API Key, Sender ID, Message, and Contacts are required."]);
}
?>