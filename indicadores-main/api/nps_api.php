<?php
require_once 'config.php';

validarSessao();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Ação: nps_data - Retornar dados gerais
    if (isset($_GET['action']) && $_GET['action'] === 'nps_data') {
        retornarDadosNPS($pdo);
        exit;
    }
    
    // Ação: sync_data - Sincronizar com o Google Sheets
    if (isset($_GET['action']) && $_GET['action'] === 'sync_data') {
        sincronizarComGoogle($pdo);
        exit;
    }
    // Futuro: ia_insights
} elseif ($method === 'POST') {
    // Quando migrarmos a IA, ela ficará aqui
}

function retornarDadosNPS($pdo) {
    try {
        $saida = ["fav" => [], "cer" => []];
        
        $stmt = $pdo->query("SELECT unidade, data_hora, nota, prontuario, texto_1, texto_2 FROM pesquisas_nps ORDER BY data_hora DESC");
        $linhas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($linhas as $l) {
            $unidade = strtolower($l['unidade']);
            if (isset($saida[$unidade])) {
                $saida[$unidade][] = [
                    "CARIMBO" => $l['data_hora'],
                    "NOTA" => (int)$l['nota'],
                    "PRONTUARIO_ID" => $l['prontuario'],
                    "IA_TEXTO_1" => $l['texto_1'],
                    "IA_TEXTO_2" => $l['texto_2']
                ];
            }
        }
        
        echo json_encode($saida);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["erro" => "Erro ao buscar dados: " . $e->getMessage()]);
    }
}

function sincronizarComGoogle($pdo) {
    try {
        $apps_script_url = "https://script.google.com/macros/s/AKfycbzr0go-Z0nSoGO1IWtnVHbbmHiwCJqAGIyoRAUTYrKJhIS7MP9BekAbXN8ZlBKgtNTi/exec?action=nps_data&token=" . API_TOKEN;
        
        $ctx = stream_context_create(['http'=> ['timeout' => 60]]);
        $json_data = @file_get_contents($apps_script_url, false, $ctx);
        
        if (!$json_data) throw new Exception("Não foi possível acessar o Google Sheets.");
        
        $input = json_decode($json_data, true);
        if (!$input || isset($input['erro'])) throw new Exception("Dados inválidos do Google.");

        $pdo->beginTransaction();
        // Em vez de TRUNCATE, vamos usar INSERT IGNORE para manter o que já temos e só adicionar o novo
        $stmt = $pdo->prepare("
            INSERT IGNORE INTO pesquisas_nps (unidade, data_hora, nota, prontuario, texto_1, texto_2) 
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        
        $count = 0;
        $processar = function($dados, $unidade) use ($stmt, &$count) {
            foreach ($dados as $linha) {
                $chaves = array_keys($linha);
                $chaveData = current(array_filter($chaves, function($k) { return stripos($k, 'DATA') !== false || stripos($k, 'CARIMBO') !== false; }));
                $chaveNota = current(array_filter($chaves, function($k) { return stripos($k, '0 a 10') !== false || stripos($k, 'NPS') !== false || stripos($k, 'RECOMENDA') !== false || stripos($k, 'NOTA') !== false; }));
                
                if (!$chaveData || !$chaveNota) continue;
                
                $time = strtotime($linha[$chaveData]);
                if (!$time) continue;
                
                $stmt->execute([
                    strtoupper($unidade), 
                    date("Y-m-d H:i:s", $time), 
                    (int)$linha[$chaveNota], 
                    $linha["PRONTUARIO_ID"] ?? null, 
                    $linha["IA_TEXTO_1"] ?? null, 
                    $linha["IA_TEXTO_2"] ?? null
                ]);
                if ($stmt->rowCount() > 0) $count++;
            }
        };

        if (isset($input['fav'])) $processar($input['fav'], 'FAV');
        if (isset($input['cer'])) $processar($input['cer'], 'CER');

        $pdo->commit();
        echo json_encode(["sucesso" => true, "novos" => $count]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["erro" => $e->getMessage()]);
    }
}
?>
