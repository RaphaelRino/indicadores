<?php
// Função simples para carregar o .env
function loadEnv($path)
{
    if (!file_exists($path)) {
        return false;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
    return true;
}

// Carrega as variáveis do .env localizado na mesma pasta (api/)
loadEnv(__DIR__ . '/.env');

// Configurações do Banco de Dados a partir do .env
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'fav_analytics');

// Token de segurança (deve ser o mesmo do frontend)
define('API_TOKEN', getenv('API_TOKEN') ?: '110423');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Tratar requisição OPTIONS (Preflight do CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Inicia a sessão para todas as chamadas
session_start();

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die(json_encode(["result" => "error", "error" => "Database connection failed", "details" => $e->getMessage()]));
}

// Função utilitária para validar SESSÃO (Login com usuário/senha)
function validarSessao() {
    if (!isset($_SESSION['logado']) || $_SESSION['logado'] !== true) {
        http_response_code(401);
        echo json_encode(["result" => "error", "error" => "Sessão expirada. Faça login novamente."]);
        exit();
    }
}

// Função utilitária para validar token (usada apenas internamente pela sincronização)
function validarToken() {
    $token = '';
    
    // Verifica GET ou form-data
    if (isset($_REQUEST['token'])) {
        $token = $_REQUEST['token'];
    } 
    // Verifica JSON payload
    else {
        $input = json_decode(file_get_contents('php://input'), true);
        if (isset($input['token'])) {
            $token = $input['token'];
        }
    }

    if ($token !== API_TOKEN) {
        http_response_code(403);
        echo json_encode(["result" => "error", "error" => "Token inválido ou ausente"]);
        exit();
    }
}
?>
