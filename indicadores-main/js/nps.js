try {
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.color = '#94a3b8';
    if (Chart.defaults.scale) Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
} catch (e) {
    console.warn("Aviso ChartJS no carregamento:", e);
}

const API_URL = "https://script.google.com/macros/s/AKfycbzr0go-Z0nSoGO1IWtnVHbbmHiwCJqAGIyoRAUTYrKJhIS7MP9BekAbXN8ZlBKgtNTi/exec";
const SYSTEM_TOKEN = "110423"; // Token padrão do sistema

let chartEvolucao, chartDistribuicao;
let rawDataFav = [];
let rawDataCer = [];
let unidadeAtual = 'INSTITUCIONAL'; // Inicia mostrando tudo
let comentariosAtuaisParaIA = [];

function animarContador(id, valorFinal, prefixo = '') {
    const elemento = document.getElementById(id);
    if (!elemento) return;

    if (elemento.temporizadorContador) {
        cancelAnimationFrame(elemento.temporizadorContador);
    }

    if (isNaN(valorFinal) || valorFinal === '--' || valorFinal === null) {
        elemento.innerText = valorFinal;
        return;
    }

    let inicio = 0;
    let startTime = null;
    const duration = 1500; // ~1.5 segundos para sincronizar com os gráficos

    const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);

        // Efeito easing: mais rápido no começo e lento no fim (easeOutQuart)
        const easeOut = 1 - Math.pow(1 - progress, 4);
        const atual = Math.floor(inicio + (valorFinal - inicio) * easeOut);

        elemento.innerText = prefixo + atual;

        if (progress < 1) {
            elemento.temporizadorContador = requestAnimationFrame(step);
        } else {
            elemento.innerText = prefixo + valorFinal;
        }
    };

    elemento.temporizadorContador = requestAnimationFrame(step);
}

// ==========================================
// 1. INICIALIZAÇÃO E AUTENTICAÇÃO BLINDADA
// ==========================================
// Carrega de forma mais segura após o DOM real sem matar outros possíveis loads
document.addEventListener('DOMContentLoaded', () => {
    // Definir o filtro de meses com o mês atual da máquina (1 a 12)
    const filtroMes = document.getElementById('filtro-mes');
    if (filtroMes) {
        const dataAtual = new Date();
        const mesAtual = (dataAtual.getMonth() + 1).toString();
        filtroMes.value = mesAtual;
    }

    // Carregamento automático sem tela de login
    const conteudoDashboard = document.getElementById('conteudo-dashboard');
    if (conteudoDashboard) {
        conteudoDashboard.style.display = 'flex';
    }
    
    carregarDados(SYSTEM_TOKEN);
});

async function carregarDados(token) {
    if (!token) return;
    
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
        console.log("Enviando requisição ao banco/api...");
        const fetchUrl = `${API_URL}?action=nps_data&token=${encodeURIComponent(token)}`;
        const resposta = await fetch(fetchUrl);
        const dados = await resposta.json();

        if (dados.erro || dados.error) {
            console.error("Retorno de erro do banco de dados:", dados.erro || dados.error);
            alert("Erro ao carregar dados: " + (dados.erro || dados.error));
            return;
        }

        rawDataFav = dados.fav || [];
        rawDataCer = dados.cer || [];

        setTimeout(() => {
            aplicarFiltros();
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }, 300);

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
}

function limparSessao() {
    window.close();
}

function sairDoPainel() { limparSessao(); }

// ==========================================
// 2. LÓGICA DE DADOS E FILTROS
// ==========================================
function mudarUnidade(unidade) {
    unidadeAtual = unidade;
    document.getElementById('titulo-unidade').innerText = `Visão Geral - ${unidade === 'INSTITUCIONAL' ? 'Institucional' : unidade}`;

    // Atualiza botões
    document.getElementById('btn-inst').classList.toggle('active', unidade === 'INSTITUCIONAL');
    document.getElementById('btn-fav').classList.toggle('active', unidade === 'FAV');
    document.getElementById('btn-cer').classList.toggle('active', unidade === 'CER');

    aplicarFiltros();
}

function extrairData(linha) {
    const chaves = Object.keys(linha);
    const chaveData = chaves.find(k => k.toUpperCase().includes('DATA') || k.toUpperCase().includes('CARIMBO'));
    if (!chaveData) return null;
    return new Date(linha[chaveData]);
}

function extrairNotaNPS(linha) {
    const chaves = Object.keys(linha);
    const chaveNota = chaves.find(k => k.includes('0 a 10') || k.toUpperCase().includes('NPS') || k.toUpperCase().includes('RECOMENDA'));
    if (!chaveNota) return null;
    return parseInt(linha[chaveNota]);
}

// Localiza a coluna de Prontuário/Atendimento
function extrairProntuario(linha) {
    // Agora o backend já manda mastigado como PRONTUARIO_ID
    return linha["PRONTUARIO_ID"] || 'Não identificado';
}

function aplicarFiltros() {
    let baseDados = [];
    if (unidadeAtual === 'FAV') baseDados = rawDataFav;
    else if (unidadeAtual === 'CER') baseDados = rawDataCer;
    else baseDados = [...rawDataFav, ...rawDataCer]; // Unifica Institucional

    const mesSelecionado = document.getElementById('filtro-mes').value;
    const boxFeedbacks = document.getElementById('feedbacks-container');
    if (boxFeedbacks) boxFeedbacks.innerHTML = '';

    let promotores = 0, neutros = 0, detratores = 0;
    let historicoDias = {};
    comentariosAtuaisParaIA = [];

    baseDados.forEach(linha => {
        const dataStr = extrairData(linha);
        if (!dataStr) return;
        if (mesSelecionado !== 'todos' && (dataStr.getMonth() + 1).toString() !== mesSelecionado) return;

        const nota = extrairNotaNPS(linha);
        if (nota !== null && !isNaN(nota)) {
            if (nota >= 9) promotores++;
            else if (nota >= 7) neutros++;
            else detratores++;
        }

        const diaMes = `${String(dataStr.getDate()).padStart(2, '0')}/${String(dataStr.getMonth() + 1).padStart(2, '0')}`;
        historicoDias[diaMes] = (historicoDias[diaMes] || 0) + 1;

        // IA e Relatos (Filtro Detratores 0-6)
        const textos = [linha["IA_TEXTO_1"], linha["IA_TEXTO_2"]];
        textos.forEach(txt => {
            if (txt && txt.length > 5 && txt.toLowerCase() !== "ok" && txt.toLowerCase() !== "nada" && txt.toLowerCase() !== "não") {
                comentariosAtuaisParaIA.push(txt);
                if (nota !== null && nota <= 6) { // Regra do Detrator
                    boxFeedbacks.innerHTML += `
                        <div class="feedback-item" style="border-left: 4px solid var(--danger); margin-bottom: 15px; padding: 15px; background: rgba(239, 68, 68, 0.05); border-radius: 8px; border: 1px solid var(--border-glass);">
                            <div style="display: flex; justify-content: space-between; color: var(--danger); font-weight: bold; font-size: 13px; margin-bottom: 10px; background: rgba(239, 68, 68, 0.1); padding: 8px 12px; border-radius: 6px;">
                                <span><i class="ph-fill ph-warning-circle"></i> PRONTUÁRIO: ${linha["PRONTUARIO_ID"] || '---'}</span>
                                <span>NOTA NPS: ${nota}</span>
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">Data da Avaliação: ${diaMes}</div>
                            <div style="font-size: 14px; color: var(--text-main); line-height: 1.5;">"${txt}"</div>
                        </div>`;
                }
            }
        });
    });

    if (boxFeedbacks && boxFeedbacks.innerHTML === '') {
        boxFeedbacks.innerHTML = '<p style="color: var(--text-dim); padding: 10px;">Nenhum relato escrito neste período.</p>';
    }

    const total = promotores + neutros + detratores;
    const npsFinal = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : 0;

    animarContador('kpi-nps', total > 0 ? npsFinal : '--');
    animarContador('kpi-promotores', promotores);
    animarContador('kpi-neutros', neutros);
    animarContador('kpi-detratores', detratores);

    const nomesDosMeses = {
        'todos': 'Todo o Período',
        '1': 'Janeiro', '2': 'Fevereiro', '3': 'Março', '4': 'Abril',
        '5': 'Maio', '6': 'Junho', '7': 'Julho', '8': 'Agosto',
        '9': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };

    const periodoTexto = mesSelecionado === 'todos' ? 'Todo o Período' : `Mês de ${nomesDosMeses[mesSelecionado]}`;

    const subtituloEl = document.getElementById('subtitulo-periodo');
    if (subtituloEl) {
        subtituloEl.innerHTML = `<i class="ph-fill ph-calendar-blank" style="margin-right: 6px;"></i> Período Selecionado: ${periodoTexto}`;
    }

    renderizarGraficos(promotores, neutros, detratores, Object.keys(historicoDias).sort(), Object.values(historicoDias));

    document.getElementById('ia-status-mes').innerText = mesSelecionado === 'todos' ? "Período: Geral" : `Mês Filtrado: ${nomesDosMeses[mesSelecionado]}`;
}

// ==========================================
// 3. RENDERIZAÇÃO DE GRÁFICOS (COM ANIMAÇÃO)
// ==========================================
function renderizarGraficos(p, n, d, labelsLinha, dadosLinha) {
    // 1. Gráfico de Rosca
    const ctxDist = document.getElementById('chartDistribuicao');
    if (ctxDist) {
        if (chartDistribuicao) {
            chartDistribuicao.data.datasets[0].data = [p, n, d];
            chartDistribuicao.update();
        } else {
            chartDistribuicao = new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: ['Promotores', 'Neutros', 'Detratores'],
                    datasets: [{
                        data: [0, 0, 0], // Inicia zerado para forçar o efeito visual crescendo
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '75%',
                    plugins: { legend: { position: 'bottom' } },
                    animation: { duration: 1500, easing: 'easeOutQuart' }
                }
            });
            // O timeout garante a montagem prévia; .update engatilha a animação pra valer.
            setTimeout(() => {
                chartDistribuicao.data.datasets[0].data = [p, n, d];
                chartDistribuicao.update();
            }, 100);
        }
    }

    // 2. Gráfico de Linha
    const ctxEvolucao = document.getElementById('chartEvolucao');
    if (ctxEvolucao) {
        if (chartEvolucao) {
            chartEvolucao.data.labels = labelsLinha.length > 0 ? labelsLinha : ['Sem dados'];
            chartEvolucao.data.datasets[0].data = dadosLinha.length > 0 ? dadosLinha : [0];
            chartEvolucao.update();
        } else {
            const labelsData = labelsLinha.length > 0 ? labelsLinha : ['Sem dados'];
            const actualData = dadosLinha.length > 0 ? dadosLinha : [0];

            chartEvolucao = new Chart(ctxEvolucao, {
                type: 'line',
                data: {
                    labels: labelsData,
                    datasets: [{
                        label: 'Vol. Pesquisas',
                        data: actualData.map(() => 0), // Inicia na linha do zero
                        borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3, tension: 0.4, fill: true
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
                    animation: { duration: 1500, easing: 'easeOutQuart' }
                }
            });

            setTimeout(() => {
                chartEvolucao.data.datasets[0].data = actualData;
                chartEvolucao.update();
            }, 100);
        }
    }
}

// ==========================================
// 4. MÓDULO DE INTELIGÊNCIA ARTIFICIAL
// ==========================================
async function gerarInsightsIA() {
    if (comentariosAtuaisParaIA.length === 0) {
        alert("Não há avaliações de texto suficientes neste período para gerar a análise.");
        return;
    }

    const btn = document.getElementById('btn-gerar-ia');
    btn.innerHTML = '<div class="spinner" style="width:16px; height:16px; margin:0; border-width:2px;"></div> Processando IA...';
    btn.disabled = true;

    try {
        const tokenAtivo = SYSTEM_TOKEN;
        // A CORREÇÃO DA IA ESTÁ AQUI (Token na URL da requisição POST)
        const fetchUrlComToken = `${API_URL}?action=ia_insights&token=${encodeURIComponent(tokenAtivo)}`;

        const payload = {
            action: 'ia_insights',
            comentarios: comentariosAtuaisParaIA
        };

        const resp = await fetch(fetchUrlComToken, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const dadosIA = await resp.json();

        const listaElogios = document.getElementById('lista-elogios');
        const listaCriticas = document.getElementById('lista-criticas');

        listaElogios.innerHTML = '';
        listaCriticas.innerHTML = '';

        (dadosIA.elogios || ["Sem elogios detectados."]).forEach(t => listaElogios.innerHTML += `<li>${t}</li>`);
        (dadosIA.criticas || ["Nenhuma crítica destacada."]).forEach(t => listaCriticas.innerHTML += `<li>${t}</li>`);

    } catch (e) {
        alert("Erro ao conectar com a Inteligência Artificial. Verifique sua conexão.");
    } finally {
        btn.innerHTML = '<i class="ph-fill ph-magic-wand"></i> Gerar Auditoria IA';
        btn.disabled = false;
    }
}
