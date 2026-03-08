<?php
/**
 * API DE LOGIN
 * Gerencia autenticação com sessões PHP (sem token no frontend).
 */

require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Rota: POST /login_api.php?action=login
if ($method === 'POST' && $action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $usuario = trim($input['usuario'] ?? '');
    $senha = trim($input['senha'] ?? '');

    if (!$usuario || !$senha) {
        http_response_code(400);
        echo json_encode(["erro" => "Usuário e senha são obrigatórios."]);
        exit;
    }

    try {
        $stmt = $pdo->prepare("SELECT id, usuario, senha_hash FROM usuarios WHERE usuario = ? LIMIT 1");
        $stmt->execute([$usuario]);
        $user = $stmt->fetch();

        if ($user && password_verify($senha, $user['senha_hash'])) {
            // Login OK: cria a sessão
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['usuario'] = $user['usuario'];
            $_SESSION['logado'] = true;
            echo json_encode(["sucesso" => true, "usuario" => $user['usuario']]);
        } else {
            http_response_code(401);
            echo json_encode(["erro" => "Usuário ou senha incorretos."]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["erro" => "Erro interno: " . $e->getMessage()]);
    }
    exit;
}

// Rota: GET /login_api.php?action=check
if ($method === 'GET' && $action === 'check') {
    if (isset($_SESSION['logado']) && $_SESSION['logado'] === true) {
        echo json_encode(["logado" => true, "usuario" => $_SESSION['usuario']]);
    } else {
        echo json_encode(["logado" => false]);
    }
    exit;
}

// Rota: GET /login_api.php?action=logout
if ($method === 'GET' && $action === 'logout') {
    session_destroy();
    echo json_encode(["sucesso" => true]);
    exit;
}

// Rota: POST /login_api.php?action=criar_admin (uso único para criar o primeiro usuário)
if ($method === 'POST' && $action === 'criar_admin') {
    $input = json_decode(file_get_contents('php://input'), true);
    $usuario = trim($input['usuario'] ?? '');
    $senha = trim($input['senha'] ?? '');

    if (!$usuario || !$senha) {
        http_response_code(400);
        echo json_encode(["erro" => "Informe usuário e senha."]);
        exit;
    }

    try {
        // Verifica se já existe algum usuário (só permite criar se a tabela estiver vazia)
        $count = $pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
        if ($count > 0) {
            http_response_code(403);
            echo json_encode(["erro" => "Já existe um administrador cadastrado."]);
            exit;
        }

        $hash = password_hash($senha, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)");
        $stmt->execute([$usuario, $hash]);
        echo json_encode(["sucesso" => true, "mensagem" => "Admin criado com sucesso!"]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["erro" => $e->getMessage()]);
    }
    exit;
}
?>
