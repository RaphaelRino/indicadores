<?php
require_once 'config.php';

validarSessao();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (isset($input['type'])) {
        if ($input['type'] === 'save_analysis') {
            salvarAnalise($pdo, $input['data']);
        } elseif ($input['type'] === 'delete_analysis') {
            deletarAnalise($pdo, $input['data']);
        } else {
            echo json_encode(["result" => "error", "error" => "Tipo de operação desconhecido"]);
        }
    } else {
        salvarDadosGlobais($pdo, $input);
    }
} elseif ($method === 'GET') {
    retornarDadosGlobais($pdo);
}

// ======== FUNÇÕES AUXILIARES ========

function getModuloId($pdo, $nome_modulo) {
    $stmt = $pdo->prepare("SELECT id FROM modulos WHERE nome = ?");
    $stmt->execute([$nome_modulo]);
    $res = $stmt->fetch();
    return $res['id'] ?? null;
}

function getOrInsertSetor($pdo, $nome_setor) {
    $stmt = $pdo->prepare("SELECT id FROM setores WHERE nome = ?");
    $stmt->execute([$nome_setor]);
    $res = $stmt->fetch();
    if ($res) return $res['id'];

    $stmt_ins = $pdo->prepare("INSERT INTO setores (nome) VALUES (?)");
    $stmt_ins->execute([$nome_setor]);
    return $pdo->lastInsertId();
}

function getIndicadorPK($pdo, $id_sistema, $modulo_id, $ano) {
    $stmt = $pdo->prepare("SELECT id FROM indicadores WHERE id_sistema = ? AND modulo_id = ? AND ano = ?");
    $stmt->execute([$id_sistema, $modulo_id, $ano]);
    $res = $stmt->fetch();
    return $res['id'] ?? null;
}

// ======== FUNÇÕES POST ========

function salvarDadosGlobais($pdo, $input) {
    $mapeamento_modulos = [
        "2025" => ["modulo" => "geral", "ano" => "2025"],
        "2026" => ["modulo" => "geral", "ano" => "2026"],
        "OFT_2025" => ["modulo" => "oftalmo", "ano" => "2025"],
        "OFT_2026" => ["modulo" => "oftalmo", "ano" => "2026"]
    ];

    try {
        $pdo->beginTransaction();

        foreach ($mapeamento_modulos as $key => $map) {
            if (isset($input[$key]) && is_array($input[$key])) {
                $nome_modulo = $map['modulo'];
                $ano = $map['ano'];
                $modulo_id = getModuloId($pdo, $nome_modulo);
                
                if (!$modulo_id) continue;

                $ids_enviados = array_column($input[$key], 'id');
                
                if (!empty($ids_enviados)) {
                    $placeholders = implode(',', array_fill(0, count($ids_enviados), '?'));
                    $stmt_del = $pdo->prepare("DELETE FROM indicadores WHERE modulo_id = ? AND ano = ? AND id_sistema NOT IN ($placeholders)");
                    $params = array_merge([$modulo_id, $ano], $ids_enviados);
                    $stmt_del->execute($params);
                } else {
                    $stmt_del = $pdo->prepare("DELETE FROM indicadores WHERE modulo_id = ? AND ano = ?");
                    $stmt_del->execute([$modulo_id, $ano]);
                }

                foreach ($input[$key] as $item) {
                    $id_sistema = $item['id'];
                    $nome = $item['name'];
                    $setor_id = getOrInsertSetor($pdo, $item['sector']);
                    $meta = isset($item['meta']) ? $item['meta'] : null;
                    $logica = $item['logic'];
                    $formato = $item['format'];

                    $indicador_pk = getIndicadorPK($pdo, $id_sistema, $modulo_id, $ano);
                    
                    if ($indicador_pk) {
                        $stmt_upd = $pdo->prepare("UPDATE indicadores SET setor_id=?, nome=?, meta=?, logica=?, formato=? WHERE id=?");
                        $stmt_upd->execute([$setor_id, $nome, $meta, $logica, $formato, $indicador_pk]);
                    } else {
                        $stmt_ins = $pdo->prepare("INSERT INTO indicadores (id_sistema, modulo_id, ano, setor_id, nome, meta, logica, formato) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt_ins->execute([$id_sistema, $modulo_id, $ano, $setor_id, $nome, $meta, $logica, $formato]);
                        $indicador_pk = $pdo->lastInsertId();
                    }

                    $pdo->prepare("DELETE FROM dados_mensais WHERE indicador_id = ?")->execute([$indicador_pk]);
                    $stmt_data = $pdo->prepare("INSERT INTO dados_mensais (indicador_id, mes_indice, valor, data_entrega) VALUES (?, ?, ?, ?)");

                    for ($i = 0; $i < 12; $i++) {
                        $val = isset($item['data'][$i]) && $item['data'][$i] !== "" ? $item['data'][$i] : null;
                        $del_date = isset($item['dates'][$i]) && $item['dates'][$i] !== "" ? $item['dates'][$i] : null;
                        $stmt_data->execute([$indicador_pk, $i, $val, $del_date]);
                    }
                }
            }
        }

        $pdo->commit();
        echo json_encode(["status" => "success", "message" => "Dados salvos com sucesso"]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["result" => "error", "message" => $e->getMessage()]);
    }
}

function salvarAnalise($pdo, $data) {
    try {
        $id_sistema = $data['id'];
        $ano = $data['year'];
        
        $stmt_find = $pdo->prepare("SELECT id FROM indicadores WHERE id_sistema = ? AND ano = ? LIMIT 1");
        $stmt_find->execute([$id_sistema, $ano]);
        $res = $stmt_find->fetch();
        
        if (!$res) throw new Exception("Indicador não encontrado.");
        $indicador_pk = $res['id'];

        $comentario = $data['data']['analiseCritica'] ?? null;
        $causa = $data['data']['causa'] ?? null;
        $plano = $data['data']['planoAcao'] ?? null;
        $resp = $data['data']['responsavel'] ?? null;
        $meta = $data['data']['metaProximoMes'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO analises_detalhadas (indicador_id, mes_indice, comentario, causa, plano_acao, responsavel, meta_proxima)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                comentario=VALUES(comentario), causa=VALUES(causa), plano_acao=VALUES(plano_acao), 
                responsavel=VALUES(responsavel), meta_proxima=VALUES(meta_proxima)
        ");
        $stmt->execute([$indicador_pk, $data['monthIdx'], $comentario, $causa, $plano, $resp, $meta]);

        echo json_encode(["status" => "success", "message" => "Análise salva"]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["result" => "error", "message" => $e->getMessage()]);
    }
}

function deletarAnalise($pdo, $data) {
    try {
        $stmt_find = $pdo->prepare("SELECT id FROM indicadores WHERE id_sistema = ? AND ano = ? LIMIT 1");
        $stmt_find->execute([$data['id'], $data['year']]);
        $res = $stmt_find->fetch();
        
        if ($res) {
            $stmt = $pdo->prepare("DELETE FROM analises_detalhadas WHERE indicador_id = ? AND mes_indice = ?");
            $stmt->execute([$res['id'], $data['monthIdx']]);
        }
        echo json_encode(["status" => "success", "message" => "Deletado"]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["result" => "error", "message" => $e->getMessage()]);
    }
}

// ======== FUNÇÕES GET ========

function retornarDadosGlobais($pdo) {
    try {
        $saida = [
            "2025" => [], "2026" => [], "OFT_2025" => [], "OFT_2026" => [], "analysis" => new stdClass()
        ];

        $stmt = $pdo->query("
            SELECT i.id, i.id_sistema, i.ano, i.nome, i.meta, i.logica, i.formato, 
                   s.nome as nome_setor, m.nome as nome_modulo
            FROM indicadores i
            JOIN setores s ON i.setor_id = s.id
            JOIN modulos m ON i.modulo_id = m.id
            ORDER BY s.nome ASC, i.nome ASC
        ");
        $indicadores = $stmt->fetchAll();

        $mapa_indicadores = [];

        foreach ($indicadores as $i) {
            $item = [
                "id" => (float) $i['id_sistema'],
                "name" => $i['nome'],
                "sector" => $i['nome_setor'],
                "meta" => $i['meta'],
                "logic" => $i['logica'],
                "format" => $i['formato'],
                "data" => array_fill(0, 12, null),
                "dates" => array_fill(0, 12, null)
            ];

            $mapa_indicadores[$i['id']] = [
                'modulo' => $i['nome_modulo'],
                'ano' => $i['ano'],
                'dados' => $item
            ];
        }

        $stmt_dados = $pdo->query("SELECT indicador_id, mes_indice, valor, data_entrega FROM dados_mensais");
        $linhas_dados = $stmt_dados->fetchAll();

        foreach ($linhas_dados as $l) {
            $pk = $l['indicador_id'];
            $mes = (int)$l['mes_indice'];
            if (isset($mapa_indicadores[$pk])) {
                $mapa_indicadores[$pk]['dados']['data'][$mes] = $l['valor'] !== null ? $l['valor'] : "";
                $mapa_indicadores[$pk]['dados']['dates'][$mes] = $l['data_entrega'] !== null ? $l['data_entrega'] : "";
            }
        }

        foreach ($mapa_indicadores as $pk => $info) {
            $chave = ($info['modulo'] === 'oftalmo' ? 'OFT_' : '') . $info['ano'];
            if (isset($saida[$chave])) {
                $saida[$chave][] = $info['dados'];
            }
        }

        $stmt_ana = $pdo->query("
            SELECT a.indicador_id, a.mes_indice, a.comentario, a.causa, a.plano_acao, a.responsavel, a.meta_proxima,
                   i.id_sistema, i.ano, i.nome
            FROM analises_detalhadas a
            JOIN indicadores i ON a.indicador_id = i.id
        ");
        $analises = $stmt_ana->fetchAll();
        
        $obj_analise = [];
        foreach ($analises as $a) {
            $id_sis = $a['id_sistema'];
            $ano = $a['ano'];
            $idx = $a['mes_indice'];
            $k = "{$id_sis}_{$ano}_{$idx}";
            
            $obj_analise[$k] = [
                "id" => (float) $id_sis,
                "name" => $a['nome'],
                "year" => $ano,
                "monthIdx" => (int) $idx,
                "data" => [
                    "analiseCritica" => $a['comentario'] ?? "",
                    "causa" => $a['causa'] ?? "",
                    "planoAcao" => $a['plano_acao'] ?? "",
                    "responsavel" => $a['responsavel'] ?? "",
                    "metaProximoMes" => $a['meta_proxima'] ?? ""
                ]
            ];
        }

        if (!empty($obj_analise)) {
            $saida['analysis'] = $obj_analise;
        }

        echo json_encode($saida);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["result" => "error", "message" => $e->getMessage()]);
    }
}
?>
