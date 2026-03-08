/* * FAV ANALYTICS - CORE V125 FINAL (FULL CODE)
 * Features: Instant Grid + Fluid Data Animation + Single Row DB + Silent Auto Draft + Cloud Delete
 */

const API_URL = "api/main_api.php";
const DRAFT_KEY = 'fav_analysis_draft';

// CONSTANTES DE COR (Chart.js)
const COL_ACCENT = '#3b82f6';
const COL_BAD = '#ef4444';
const COL_GOOD = '#10b981';
const COL_WARN = '#f59e0b';
const COL_GOLD = '#D4AF37';
const COL_BG_DARK = '#18181b';
const COL_BG_LIGHT = '#ffffff';
const COL_GOLD_DARK = '#B8860B';
const COL_GOLD_DARKER = '#8B6508';
const COL_ACCENT_HOVER = '#2563eb';

// Inicializa ícones
lucide.createIcons();
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- ESTADO GLOBAL ---
let masterDB = {
    geral: { "2025": [], "2026": [] },
    oftalmo: { "2025": [], "2026": [] }
};
let currentModule = 'geral';
let fullDB = masterDB.geral; // Ponteiro dinâmico
let currentYear = String(new Date().getFullYear());
let currentSector = 'Todos';
let currentView = 'table';
let currentTheme = localStorage.getItem('fav_theme') || 'dark';
let deadlineDay = parseInt(localStorage.getItem('fav_deadline')) || 15;
let charts = {};
let chartInstance = null;
let currentMetricId = null;
let isNewSectorMode = false;
let statusChartMode = 'last';
let hiddenSectors = JSON.parse(localStorage.getItem('fav_hidden_sectors')) || [];
let analyticsPeriod = { start: 0, end: 11 };

// Variável para armazenar as análises (Sincronizado com BD_ANALISES)
let analysisDB = {};
let activeAnalysis = { id: null, idx: null };

// --- INICIALIZAÇÃO ---
window.onload = async () => {
    applyTheme(currentTheme, false);
    
    // Verifica se o usuário está logado antes de carregar dados
    try {
        const resp = await fetch('api/login_api.php?action=check', { credentials: 'same-origin' });
        const res = await resp.json();
        
        if (!res.logado) {
            window.location.href = 'index.html?next=dashboard.html';
            return; // Interrompe o carregamento
        }
    } catch (e) {
        console.error("Erro ao checar sessão:", e);
    }
    
    loadData();
    setupOutsideClick();
    setupDraftAutoSave();
};

// --- RASCUNHO AUTOMÁTICO (LOCAL & SILENCIOSO) ---
function setupDraftAutoSave() {
    const fields = ['ana-critical', 'ana-cause', 'ana-plan', 'ana-responsible', 'ana-next-meta'];

    fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('input', () => {
                if (activeAnalysis.id !== null && activeAnalysis.idx !== null) {
                    const draftData = {
                        id: activeAnalysis.id,
                        idx: activeAnalysis.idx,
                        year: currentYear,
                        data: {
                            analiseCritica: document.getElementById('ana-critical').value,
                            causa: document.getElementById('ana-cause').value,
                            planoAcao: document.getElementById('ana-plan').value,
                            responsavel: document.getElementById('ana-responsible').value,
                            metaProximoMes: document.getElementById('ana-next-meta').value
                        },
                        timestamp: Date.now()
                    };

                    const isEmpty = Object.values(draftData.data).every(val => val.trim() === '');

                    if (isEmpty) {
                        localStorage.removeItem(DRAFT_KEY);
                    } else {
                        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
                    }
                }
            });
        }
    });
}

// --- FECHAR AO CLICAR FORA ---
function setupOutsideClick() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        let isMouseDownInside = false;

        overlay.addEventListener('mousedown', (e) => {
            isMouseDownInside = (e.target !== overlay);
        });

        overlay.addEventListener('click', (e) => {
            if (!isMouseDownInside && e.target === overlay) {
                if (overlay.id === 'analysisModal' && currentView === 'table') {
                    renderTable(fullDB[currentYear]);
                }
                closeModal(overlay.id);
            }
        });
    });
}

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    toggleLoading(true);
    try {
        const res = await fetch(API_URL, { credentials: 'same-origin' });
        const data = await res.json();

        // Tratamento caso o backend acuse erro de token/permissão
        if (data.result === "error") {
            throw new Error(data.error);
        }

        if (data["2025"]) masterDB.geral["2025"] = data["2025"];
        if (data["2026"]) masterDB.geral["2026"] = data["2026"];
        if (data["OFT_2025"]) masterDB.oftalmo["2025"] = data["OFT_2025"];
        if (data["OFT_2026"]) masterDB.oftalmo["2026"] = data["OFT_2026"];

        fullDB = masterDB[currentModule]; // Atualiza o ponteiro

        if (data["analysis"]) {
            analysisDB = data["analysis"];
        } else {
            analysisDB = {};
        }

        // 🧹 O trecho antigo do NPS que chamava o "migrateNPSDataIfNeeded" foi totalmente removido daqui.

        renderApp();
    } catch (e) {
        console.error(e);
        if (e.message.includes("401") || e.message.includes("Sessão expirada")) {
             window.location.href = 'index.html?next=dashboard.html';
        } else {
             showToast("Modo Offline", "error");
        }
    } finally {
        toggleLoading(false);
    }
}

// --- SALVAMENTO GERAL (APENAS NÚMEROS) ---
async function saveData() {
    const payload = {
        "2025": masterDB.geral["2025"],
        "2026": masterDB.geral["2026"],
        "OFT_2025": masterDB.oftalmo["2025"],
        "OFT_2026": masterDB.oftalmo["2026"]
    };
    try {
        await fetch(API_URL, { method: 'POST', credentials: 'same-origin', body: JSON.stringify(payload) });
    } catch (e) {
        showToast("Erro ao salvar", "error");
    }
}

// --- SALVAMENTO ESPECÍFICO DE ANÁLISE ---
async function saveAnalysisToCloud(id, year, monthIdx, dataObj) {
    const item = fullDB[year].find(i => i.id == id);
    const itemName = item ? item.name : "Indicador";

    const payload = {
        type: "save_analysis",
        data: {
            id: id,
            name: itemName,
            year: year,
            monthIdx: monthIdx,
            data: dataObj
        }
    };

    try {
        await fetch(API_URL, { method: 'POST', credentials: 'same-origin', body: JSON.stringify(payload) });
    } catch (e) {
        console.error(e);
        showToast("Erro ao gravar", "error");
    }
}

// --- EXCLUSÃO ESPECÍFICA DE ANÁLISE ---
async function deleteAnalysisFromCloud(id, year, monthIdx) {
    const payload = {
        type: "delete_analysis",
        data: {
            id: id,
            year: year,
            monthIdx: monthIdx
        }
    };

    try {
        await fetch(API_URL, { method: 'POST', credentials: 'same-origin', body: JSON.stringify(payload) });
    } catch (e) {
        console.error(e);
        showToast("Erro ao excluir", "error");
    }
}

// --- INTERFACE E LÓGICA ---

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('fav_theme', currentTheme);
    applyTheme(currentTheme, true);
    if (currentView === 'exec') {
        renderApp();
    }
}

function applyTheme(theme, animate = false) {
    document.body.setAttribute('data-theme', theme);
    const btn = document.querySelector('button[onclick="toggleTheme()"]');
    if (btn) {
        const iconName = theme === 'light' ? 'moon' : 'sun';
        const className = animate ? 'icon-spin' : '';
        btn.innerHTML = `<i id="theme-icon" class="${className}" data-lucide="${iconName}"></i>`;
        lucide.createIcons();
        if (animate) {
            setTimeout(() => {
                const icon = document.getElementById('theme-icon');
                if (icon) icon.classList.remove('icon-spin');
            }, 600);
        }
    }
}

function setModule(mod) {
    currentModule = mod;
    fullDB = masterDB[currentModule];
    currentSector = 'Todos'; // Reseta o setor para evitar conflito de dados ocultos

    // 1. Alterna a classe 'active' nas "pílulas" do menu superior esquerdo
    document.getElementById('mod-geral').classList.toggle('active', mod === 'geral');
    document.getElementById('mod-oftalmo').classList.toggle('active', mod === 'oftalmo');

    // 2. Transição da Logo e Título
    const title = document.getElementById('app-title');
    const logoIcon = document.getElementById('logo-icon');

    if (mod === 'oftalmo') {
        title.innerHTML = "LINHA DE CUIDADO<br>DE CATARATA";
        title.style.lineHeight = "1.1";
        title.style.fontSize = "0.85rem";
        logoIcon.setAttribute('data-lucide', 'eye');
        logoIcon.style.color = '#10b981'; // Um tom esmeralda para diferenciar bem
    } else {
        title.innerHTML = "FAV ANALYTICS";
        title.style.lineHeight = "normal";
        title.style.fontSize = "1rem";
        logoIcon.setAttribute('data-lucide', 'database-zap');
        logoIcon.style.color = 'var(--accent)'; // O azul original
    }
    lucide.createIcons(); // Recarrega o ícone correto

    // 3. Regra de Negócio: Trancar a visão Gerencial no módulo Oftalmo
    const btnManager = document.getElementById('btn-view-manager');
    if (mod === 'oftalmo') {
        if (btnManager) btnManager.style.display = 'none';

        // Se o usuário estava na visão gerencial ao clicar, joga ele para a tabela
        if (currentView === 'manager') {
            switchView('table');
        }
    } else {
        if (btnManager) btnManager.style.display = 'flex';
    }

    // 4. Renderiza tudo com os novos dados
    populateSectorFilter();
    renderApp();
    showToast(mod === 'oftalmo' ? "Base: Linha de Cuidado de Catarata" : "Base: Institucional", "wait");
}


function renderApp(filter = currentSector) {
    populateSectorFilter();
    const data = fullDB[currentYear] || [];
    // PREPARE DATA: exclude hidden sectors from calculations
    const displayData = filter === 'Todos' ? data : data.filter(i => i.sector === filter);
    // If viewing 'Todos', exclude hidden. If viewing specific, show all (dashboard shows specific data).
    const activeData = (filter === 'Todos')
        ? displayData.filter(i => !hiddenSectors.includes(i.sector))
        : displayData;

    const perfLabel = document.getElementById('kpi-perf-label');
    if (perfLabel) {
        if (filter === 'Todos') {
            perfLabel.innerText = "Perf. Inst.";
        } else {
            // Tenta abreviar se for muito longo para não quebrar o layout mini
            const name = filter.length > 15 ? filter.substring(0, 12) + '...' : filter;
            perfLabel.innerText = "Perf. " + name;
        }
    }

    // Initialize Analytics Filter if empty (only once)
    const anStart = document.getElementById('an-start');
    if (anStart && anStart.options.length === 0) populateAnalyticsFilter();

    // Toggle Period Filter Visibility
    const periodFilter = document.getElementById('period-filter-wrapper');
    if (periodFilter) {
        // periodFilter.style.display = (currentView === 'manager') ? 'none' : 'flex'; // REMOVED
        if (currentView === 'manager') {
            periodFilter.classList.add('filter-disabled');
        } else {
            periodFilter.classList.remove('filter-disabled');
            periodFilter.style.display = 'flex';
        }
    }

    if (currentView === 'table') {
        const start = analyticsPeriod.start;
        const end = analyticsPeriod.end;
        updateKPIs(activeData, start, end); // KPIs respect filter in table view too
        renderTable(displayData);
        updateTableVisibility(start, end);
    } else {
        // Analytics View: Respect the period filter
        updateKPIs(activeData, analyticsPeriod.start, analyticsPeriod.end);
        renderExecutiveCharts(activeData);
    }

    // Toggle do botão Adicionar (FAB) - Visível apenas na tabela
    const fab = document.querySelector('.fab');
    if (fab) {
        fab.style.display = (currentView === 'table') ? 'flex' : 'none';
    }

    document.getElementById('btn-2025').classList.toggle('active', currentYear === '2025');
    document.getElementById('btn-2026').classList.toggle('active', currentYear === '2026');
    lucide.createIcons();
}

function checkOnTime(dateStr, monthIdx) {
    if (!dateStr) return false;
    const delivery = new Date(dateStr + "T12:00:00");
    const curYear = parseInt(currentYear);
    const minDate = new Date(curYear, monthIdx, 1, 0, 0, 0);

    let limitYear = curYear;
    let limitMonth = monthIdx + 1;
    if (limitMonth > 11) {
        limitMonth = 0;
        limitYear++;
    }
    const limitDate = new Date(limitYear, limitMonth, deadlineDay, 23, 59, 59);

    return delivery >= minDate && delivery <= limitDate;
}

function getStatus(val, meta, logic, fmt) {
    if (val === null || val === undefined) return "empty";
    const sVal = String(val).trim();
    if (sVal === "" || sVal === "NaN" || sVal === "null" || sVal === "undefined" || sVal === "-") return "empty";

    // NO META (Empty) = INDEFINITELY GOOD ("Within Meta")
    if (meta === null || meta === undefined || String(meta).trim() === "") {
        return "good";
    }

    let v, m;

    if (fmt === 'time') {
        v = timeToDec(val);
        m = timeToDec(meta);
    } else {
        let sVal = String(val).replace(',', '.');
        let sMeta = String(meta).replace(',', '.');
        v = parseFloat(sVal);
        m = parseFloat(sMeta);
    }

    if (isNaN(v) || isNaN(m)) return "empty";

    if (logic === 'maior') {
        return v >= m ? 'good' : 'bad';
    } else {
        return v <= m ? 'good' : 'bad';
    }
}

function formatVal(v, f) {
    if (v === null || v === undefined || v === "" || v === "NaN") return "-";

    if (f === 'time') {
        if (typeof v === 'number' && !isNaN(v)) {
            let h = Math.floor(v);
            let m = Math.round((v - h) * 60);
            if (m === 60) { h++; m = 0; }
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        let str = String(v);
        const match = str.match(/(\d{1,2}):(\d{2})/);
        if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
        return str;
    }

    let num;
    if (typeof v === 'string') {
        const clean = v.replace(/[^\d.,\-]/g, '').replace(',', '.');
        num = parseFloat(clean);
    } else {
        num = parseFloat(v);
    }

    if (isNaN(num)) return "-";

    const br = num.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

    switch (f) {
        case 'money': return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        case 'percent': return num.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
        case 'minutes': return br + ' min';
        case 'days': return br + ' dias';
        case 'years': return br + ' anos';
        case 'm3': return br + ' m³';
        case 'liters': return br + ' L';
        case 'ml': return br + ' ml';
        case 'kg': return br + ' kg';
        case 'kwh': return br + ' kWh';
        case 'gas': return br + ' bot.';
        case 'cm': return br + ' cm';
        case 'package': return br + ' pct';
        case 'patients': return br + ' pac.';
        default: return br;
    }
}

function timeToDec(t) {
    if (!t || typeof t !== 'string') return NaN;
    const match = t.match(/(\d{1,2}):(\d{2})/);
    if (match) return parseFloat(match[1]) + (parseFloat(match[2]) / 60);
    return NaN;
}

function updateKPIs(data, startIdx = 0, endIdx = 11) {
    let totalPerf = 0, hitsPerf = 0;
    let countCrit = 0;
    let puncTotal = 0, puncHits = 0;

    data.forEach(item => {
        // Calculate only within range
        for (let i = startIdx; i <= endIdx; i++) {
            const val = item.data[i];
            if (val !== null && val !== "") {
                const st = getStatus(val, item.meta, item.logic, item.format);
                if (st !== 'empty') {
                    totalPerf++;
                    if (st === 'good') hitsPerf++;
                    if (st === 'bad') countCrit++;
                }
            }

            if (item.dates && item.dates[i]) {
                const dVal = item.data[i]; // Needs data to be considered for punctuality? Usually yes.
                if (dVal !== null && dVal !== "") {
                    puncTotal++;
                    if (checkOnTime(item.dates[i], i)) puncHits++;
                }
            }
        }
    });

    const perf = totalPerf ? parseFloat(((hitsPerf / totalPerf) * 100).toFixed(2)) : 0;
    const punc = puncTotal ? parseFloat(((puncHits / puncTotal) * 100).toFixed(2)) : 0;

    setText('kpi-perf', perf.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + "%");
    setText('kpi-punc', punc.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + "%");
    setText('kpi-crit', countCrit);
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const tableEl = document.querySelector('#main-table');
    tbody.innerHTML = '';

    if (!data.length) {
        tableEl.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    tableEl.style.display = 'table';
    emptyState.style.display = 'none';

    const sectors = currentSector === 'Todos' ? [...new Set(data.map(i => i.sector))].sort() : [currentSector];
    let delayCounter = 0;

    // PRE-CALC PARA REINCIDÊNCIA (Omitido visualmente na tabela conforme pedido)

    sectors.forEach(sec => {
        const items = data.filter(i => i.sector === sec);
        if (items.length === 0) return;

        if (currentSector === 'Todos') {
            const isHidden = hiddenSectors.includes(sec);
            if (isHidden) return; // STRICTLY HIDDEN (No header, no rows)

            tbody.innerHTML += `
                <tr class="sector-header cascade-item" style="animation-delay: ${delayCounter * 30}ms">
                    <td colspan="14">
                         <div style="font-weight:700; letter-spacing:0.5px;">${sec}</div>
                    </td>
                </tr>
            `;
            delayCounter++;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'cascade-item';
            tr.style.animationDelay = `${delayCounter * 30}ms`;
            delayCounter++;

            const logicLabel = item.logic === 'maior' ? 'Maior Melhor ↑' : 'Menor Melhor ↓';

            // Clean Render (Sem Badges)
            let html = `
                <td class="col-name" onclick="openMainModal(${item.id})">${item.name}</td>
                <td class="col-meta" onclick="openMainModal(${item.id})">
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <span>${formatVal(item.meta, item.format)}</span>
                        <span style="font-size:0.55rem; opacity:0.8; margin-top:2px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${logicLabel}</span>
                    </div>
                </td>
            `;

            for (let i = 0; i < 12; i++) {
                const val = item.data[i];
                const status = getStatus(val, item.meta, item.logic, item.format);

                let cls = 'cell-empty';
                if (status === 'good') cls = 'cell-good';
                else if (status === 'bad') cls = 'cell-bad';

                const hasAnalysis = getAnalysis(item.id, currentYear, i) !== null;
                const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
                const hasDraft = (draft && draft.id === item.id && draft.idx === i && draft.year === currentYear);

                // Apenas bolinha azul se tiver análise (sem warning vermelho)
                let analysisClass = (hasAnalysis || hasDraft) ? ' has-analysis' : '';

                html += `<td class="${cls}${analysisClass}" onclick="openAnalysisModal(${item.id}, ${i})">
                    ${formatVal(val, item.format)}
                </td>`;
            }
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    });
}

function renderExecutiveCharts(data) {
    if (currentView !== 'exec') return;

    const cards = document.querySelectorAll('.chart-card');
    cards.forEach((card, i) => {
        card.classList.remove('cascade-item');
        void card.offsetWidth;
        card.classList.add('cascade-item');
        card.style.animationDelay = `${i * 100}ms`;
    });

    renderTrendChart(data);
    renderStatusChart(data);
    renderPuncChart(data);
}

function getChartColors() {
    const isDark = currentTheme === 'dark';
    return {
        // Light Mode: Escureci para Zinc-900 (#18181b) para contraste máximo
        text: isDark ? '#a1a1aa' : COL_BG_DARK,
        grid: isDark ? '#27272a' : '#d4d4d8',
        bg: isDark ? COL_BG_DARK : COL_BG_LIGHT,
        title: isDark ? COL_BG_LIGHT : COL_BG_DARK
    };
}

function renderTrendChart(data) {
    const ctxTrend = document.getElementById('chart-trend').getContext('2d');
    if (charts.trend) charts.trend.destroy();

    const colors = getChartColors();
    const isLight = currentTheme === 'light';

    // Validate Range
    const start = analyticsPeriod.start;
    const end = analyticsPeriod.end;
    const rangeLength = end - start + 1;
    const activeMonths = months.slice(start, end + 1);

    // --- CÁLCULO DOS DADOS (Constância de Metas) ---
    // Arrays sized to the range
    const mAvg = Array(rangeLength).fill(0);
    const mCount = Array(rangeLength).fill(0);
    const mTieBreaker = Array(rangeLength).fill(0);

    data.forEach(item => {
        // Iterate only the selected range
        for (let i = 0; i < rangeLength; i++) {
            const MonthIdx = start + i; // Real Index
            const val = item.data[MonthIdx];

            if (val !== null && val !== "") {
                const st = getStatus(val, item.meta, item.logic, item.format);

                // Contabiliza se bateu a meta (100% ou 0%)
                if (st !== 'empty') {
                    mAvg[i] += (st === 'good' ? 100 : 0);
                    mCount[i]++;
                }

                // --- DESEMPATE (Quem superou mais a meta) ---
                let numVal = parseFloat(val);
                let target = parseFloat(item.meta);
                if (item.format === 'time') {
                    numVal = timeToDec(val);
                    target = timeToDec(item.meta);
                }

                if (!isNaN(numVal) && !isNaN(target) && target !== 0) {
                    let relativePerformance = 0;
                    if (item.logic === 'maior') relativePerformance = (numVal - target) / target;
                    else relativePerformance = (target - numVal) / target;
                    // Use 'i' (relative index)
                    mTieBreaker[i] += relativePerformance;
                }
            }
        }
    });

    const trendData = mAvg.map((s, i) => mCount[i] ? parseFloat((s / mCount[i]).toFixed(2)) : 0);

    // --- MELHOR MÊS ---
    let maxVal = -Infinity;
    let candidates = [];
    trendData.forEach((val, i) => {
        if (val > maxVal) { maxVal = val; candidates = [i]; }
        else if (val === maxVal) candidates.push(i);
    });

    let bestIdx = -1;
    if (maxVal > 0 && candidates.length > 0) {
        if (candidates.length === 1) bestIdx = candidates[0];
        else {
            let bestScore = -Infinity;
            candidates.forEach(idx => {
                if (mTieBreaker[idx] > bestScore) { bestScore = mTieBreaker[idx]; bestIdx = idx; }
            });
            if (bestIdx === -1) bestIdx = candidates[candidates.length - 1];
        }
    }

    // --- VISUAL (LINHA RETA + ANIMAÇÃO NATURAL) ---
    const pointBgColors = trendData.map((_, i) => i === bestIdx ? COL_GOLD : COL_ACCENT);
    const finalRadii = trendData.map((_, i) => i === bestIdx ? 8 : 4);
    const pointHoverRadii = trendData.map((_, i) => i === bestIdx ? 10 : 7);

    // --- CONTROLE DE ANIMAÇÃO ÚNICA (Anti-Flicker) ---
    const displayedPoints = new Set();

    // Plugin 1: Labels (Linhas + Valor)
    const dataLabelPlugin = {
        id: 'customDataLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            const yScale = chart.scales.y;

            meta.data.forEach((point, index) => {
                if (point.x && point.y) {
                    // Restore Animation: Calculate value from current Y position
                    let currentVal = yScale.getValueForPixel(point.y);
                    if (currentVal < 0) currentVal = 0;

                    const finalValue = chart.data.datasets[0].data[index];

                    // Determine if we should show (using finalValue for logic)
                    if (finalValue > 0) {
                        ctx.save();

                        const isBest = index === bestIdx;
                        // No Light Mode, se não for gold, usa preto puro para contraste
                        const color = isBest ? COL_GOLD : (isLight ? '#000000' : colors.text);

                        ctx.fillStyle = color;
                        // ctx.strokeStyle = color; // Linha removida

                        // Fontes Extra Grandes e com Sombra para destaque total
                        ctx.font = isBest ? '900 22px Inter' : 'bold 15px Inter';

                        // CORREÇÃO: Alinha à direita se for o último mês VISÍVEL
                        if (index === (activeMonths.length - 1)) {
                            ctx.textAlign = 'right';
                        } else {
                            ctx.textAlign = 'center';
                        }

                        ctx.textBaseline = 'bottom';

                        // Sombra suave apenas no Dark Mode. No Light, removemos para evitar sujeira.
                        if (!isLight) {
                            ctx.save();
                            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                            ctx.shadowBlur = 6;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 2;
                        }

                        // Coordenadas
                        const r = point.options.radius || 0;
                        const labelY = point.y - (r + 12);

                        if (point.y > 0) {
                            // Format current animated value
                            const txt = currentVal.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
                            ctx.fillText(txt, point.x, labelY);
                        }

                        if (!isLight) ctx.restore(); // Restaura sombra

                        ctx.restore();
                    }
                }
            });
        }
    };

    // Plugin 2: Melhor Mês (Estabilizado)
    const bestMonthPlugin = {
        id: 'bestMonthPlugin',
        afterDraw: (chart) => {
            const container = chart.canvas.parentNode;

            const meta = chart.getDatasetMeta(0);
            // Relaxamos a verificação: se o dataset existe, tentamos desenhar
            if (bestIdx === -1 || !meta.data[bestIdx]) {
                const oldBadge = container.querySelector('.best-month-badge');
                if (oldBadge) oldBadge.remove();
                container.querySelectorAll('.sparkle').forEach(el => el.remove());
                return;
            }

            const point = meta.data[bestIdx];
            let badge = container.querySelector('.best-month-badge');

            // Cria apenas se não existir
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'best-month-badge';
                badge.innerText = 'Melhor mês';
                badge.style.background = 'linear-gradient(135deg, #B8860B, #8B6508)';
                badge.style.border = '1px solid #D4AF37';

                badge.style.opacity = '0';
                badge.style.animation = 'fadeIn 0.5s ease-out forwards';
                container.appendChild(badge);

                const sparkleOffsets = [{ x: -15, y: -15 }, { x: 15, y: -10 }, { x: 0, y: 20 }];
                sparkleOffsets.forEach((off, idx) => {
                    const sparkle = document.createElement('div');
                    sparkle.className = 'sparkle';
                    sparkle.dataset.idx = idx;
                    sparkle.style.animationDelay = (idx * 0.3) + 's';
                    container.appendChild(sparkle);
                });
            }

            // Atualiza posições sempre, garantindo que segue o ponto
            badge.style.left = point.x + 'px';
            badge.style.top = (point.y - 45) + 'px';

            const sparkleOffsets = [{ x: -15, y: -15 }, { x: 15, y: -10 }, { x: 0, y: 20 }];
            const sparkles = container.querySelectorAll('.sparkle');
            if (sparkles.length === 3) {
                sparkles.forEach((s, i) => {
                    s.style.left = (point.x + sparkleOffsets[i].x) + 'px';
                    s.style.top = (point.y + sparkleOffsets[i].y) + 'px';
                });
            }
        }
    };

    // Plugin 3: Highlight do Mês no Eixo X
    const activeMonthPlugin = {
        id: 'activeMonthPlugin',
        afterDraw(chart) {
            const { ctx, scales: { x } } = chart;
            const activeElements = chart.getActiveElements();

            if (activeElements.length > 0) {
                const idx = activeElements[0].index;
                const xPos = x.getPixelForTick(idx);
                const yPos = x.bottom - 15; // Ajuste vertical

                ctx.save();

                // CORREÇÃO 2: Se for o Melhor Mês, usa Dourado. Senão, Azul.
                const isBest = idx === bestIdx;

                ctx.fillStyle = isBest ? COL_GOLD : COL_ACCENT;
                ctx.shadowColor = isBest ? 'rgba(212, 175, 55, 0.4)' : 'rgba(59, 130, 246, 0.4)';
                ctx.shadowBlur = 8;

                const text = months[idx];
                ctx.font = 'bold 12px Inter';
                const textWidth = ctx.measureText(text).width;
                const padding = 8;
                const width = textWidth + (padding * 2);
                const height = 24;

                // Rounded Rect (Centralizado verticalmente com o texto)
                ctx.beginPath();
                // Ajuste fino: yPos - height/2 centraliza matematicamente. Subtraímos 1px para ajuste ótico da fonte Inter.
                ctx.roundRect(xPos - (width / 2), yPos - (height / 2) - 1, width, height, 12);
                ctx.fill();

                // Texto Branco por cima
                ctx.fillStyle = COL_BG_LIGHT;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 0;
                ctx.fillText(text, xPos, yPos);

                ctx.restore();
            }
        }
    };

    // Novo Estilo Gráfico: Gráfico de Área Suave com Gradiente
    const gradientFill = ctxTrend.createLinearGradient(0, 0, 0, 400);
    gradientFill.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradientFill.addColorStop(1, 'rgba(59, 130, 246, 0.05)');

    // Hover Colors Array
    const pointHoverBgColors = trendData.map((_, i) => i === bestIdx ? COL_GOLD : COL_ACCENT_HOVER);

    charts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: activeMonths,
            datasets: [{
                label: '% Performance',
                data: trendData,
                borderColor: COL_ACCENT,
                backgroundColor: gradientFill,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: pointBgColors,
                pointBorderColor: COL_BG_LIGHT,
                pointBorderWidth: 2,
                pointRadius: finalRadii,
                // Efeito Hover "Pop" mais bonito
                pointHoverRadius: 10,
                pointHoverBackgroundColor: pointHoverBgColors, // Cor correta para cada tipo (Gold vs Blue)
                pointHoverBorderColor: COL_BG_LIGHT,
                pointHoverBorderWidth: 4,
                pointHitRadius: 30, // Facilita pegar o ponto com mouse
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                // Padding top maior para acomodar fontes extra grandes
                padding: { top: 80, bottom: 10, left: 10, right: 20 }
            },
            animations: {
                y: {
                    easing: 'easeOutQuart',
                    duration: 1000,
                    delay: (ctx) => ctx.index * 150 + 300,
                    from: (ctx) => {
                        if (ctx.type === 'data' && ctx.mode === 'default' && !ctx.dropped) {
                            ctx.dropped = true;
                            return ctx.chart.scales.y.getPixelForValue(0);
                        }
                    }
                },
                radius: {
                    duration: 400,
                    easing: 'easeOutBack',
                    delay: (ctx) => {
                        // Se já exibiu, delay 0. Se não, delay sequencial.
                        if (displayedPoints.has(ctx.index)) return 0;
                        displayedPoints.add(ctx.index);
                        return ctx.index * 150 + 800;
                    },
                    from: (ctx) => {
                        // Se já exibiu, não reseta radius
                        if (displayedPoints.has(ctx.index)) return undefined;
                        return 0;
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: true,
                axis: 'x'
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false } // Remove tooltip chato redundant
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 105,
                    grid: { color: colors.grid, borderDash: [5, 5] },
                    ticks: { color: colors.text, stepSize: 20, padding: 20 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text, font: { size: 11 } }
                }
            }
        },
        plugins: [dataLabelPlugin, bestMonthPlugin, activeMonthPlugin]
    });
}

function renderStatusChart(data) {
    const ctxStatus = document.getElementById('chart-status').getContext('2d');

    const colors = getChartColors();

    // --- helper: calcula contagens por modo (mesma lógica que você já usa) ---
    const computeCounts = (dataset, mode) => {
        let batido = 0, naoBatido = 0, naoContabilizado = 0;

        dataset.forEach(item => {
            if (mode === 'year') {
                // Range-aware 'year' mode
                for (let i = analyticsPeriod.start; i <= analyticsPeriod.end; i++) {
                    const val = item.data[i];
                    const st = getStatus(val, item.meta, item.logic, item.format);
                    if (st === 'good') batido++;
                    else if (st === 'bad') naoBatido++;
                    else naoContabilizado++;
                }
            } else {
                // 'last' mode: Find the last valid data point WITHIN the selected range
                // Iterate backwards from end to start
                let found = false;
                for (let i = analyticsPeriod.end; i >= analyticsPeriod.start; i--) {
                    const val = item.data[i];
                    if (val !== null && val !== undefined) {
                        const sVal = String(val).trim();
                        if (sVal !== "" && sVal !== "NaN" && sVal !== "null" && sVal !== "undefined" && sVal !== "-") {
                            // Found valid data
                            const status = getStatus(val, item.meta, item.logic, item.format);
                            if (status === 'good') batido++;
                            else if (status === 'bad') naoBatido++;
                            else naoContabilizado++;
                            found = true;
                            break;
                        }
                    }
                }
                if (!found) naoContabilizado++;
            }
        });

        return { batido, naoBatido, naoContabilizado };
    };

    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: function (chart) {
            if (chart.config.type !== 'doughnut') return;
            const width = chart.width, height = chart.height, ctx = chart.ctx;
            ctx.restore();

            const fontSize = (height / 140).toFixed(2);
            ctx.font = `bold ${fontSize}em Inter`;
            ctx.textBaseline = "middle";
            ctx.fillStyle = colors.title;

            // texto central dinâmico
            const text = statusChartMode === 'year' ? "ANO" : "ATUAL";
            const textX = Math.round((width - ctx.measureText(text).width) / 2);
            const textY = height / 2;

            ctx.fillText(text, textX, textY);

            ctx.font = `normal ${fontSize * 0.4}em Inter`;
            ctx.fillStyle = colors.text;
            const sub = "(Clique)";
            const subX = Math.round((width - ctx.measureText(sub).width) / 2);
            ctx.fillText(sub, subX, textY + 20);

            ctx.save();
        }
    };

    const sliceLabelPlugin = {
        id: 'sliceLabel',
        afterDraw: (chart) => {
            const { ctx, data } = chart;
            ctx.save();
            ctx.font = 'bold 11px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COL_BG_LIGHT;

            const meta = chart.getDatasetMeta(0);
            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);

            meta.data.forEach((element, index) => {
                if (!element.hidden && data.datasets[0].data[index] > 0) {
                    const value = data.datasets[0].data[index];
                    const percentage = value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
                    const numericPerc = (value / total);

                    if (total > 0 && numericPerc > 0.05) {
                        const { x, y } = element.tooltipPosition();
                        ctx.fillText(percentage, x, y);
                    }
                }
            });

            ctx.restore();
        }
    };

    // --- cria ou atualiza com animação suave ---
    const counts = computeCounts(data, statusChartMode);
    const nextData = [counts.batido, counts.naoBatido, counts.naoContabilizado];

    // Se já existe, NÃO destrói: atualiza com animação
    if (charts.status) {
        charts.status.data.datasets[0].data = nextData;

        // animação "morfando" ao trocar ANO/ATUAL
        charts.status.options.animation = {
            duration: 900,
            easing: 'easeOutQuart',
            animateRotate: true,
            animateScale: true
        };

        // Atualiza a função de clique para garantir que use o contexto (ano) atual
        charts.status.options.onClick = () => {
            statusChartMode = statusChartMode === 'last' ? 'year' : 'last';
            showToast(`Visão: ${statusChartMode === 'year' ? 'Acumulado do Ano' : 'Status Atual'}`, "wait");

            const d = fullDB[currentYear] || [];
            const f = currentSector === 'Todos' ? d : d.filter(i => i.sector === currentSector);
            renderStatusChart(f);
        };

        charts.status.update();
        return;
    }

    // Se não existe, cria normal
    charts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Batido', 'Não Batido', 'S/ Dados'],
            datasets: [{
                data: nextData,
                backgroundColor: ['#10b981', '#ef4444', '#6b7280'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            onClick: () => {
                statusChartMode = statusChartMode === 'last' ? 'year' : 'last';
                showToast(`Visão: ${statusChartMode === 'year' ? 'Acumulado do Ano' : 'Status Atual'}`, "wait");

                const d = fullDB[currentYear] || [];
                const f = currentSector === 'Todos' ? d : d.filter(i => i.sector === currentSector);
                renderStatusChart(f);
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: colors.text, font: { size: 11 }, usePointStyle: true, padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const arr = context.chart.data.datasets[0].data || [];
                            const total = arr.reduce((a, b) => a + b, 0);
                            const perc = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${perc}%)`;
                        }
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutBack',
                animateRotate: true,
                animateScale: true
            }
        },
        plugins: [centerTextPlugin, sliceLabelPlugin]
    });
}
function renderPuncChart(data) {
    const ctxPunc = document.getElementById('chart-punc').getContext('2d');
    if (charts.punc) charts.punc.destroy();

    const colors = getChartColors();
    const start = analyticsPeriod.start;
    const end = analyticsPeriod.end;
    const rangeLength = end - start + 1;
    const activeMonths = months.slice(start, end + 1);

    const pData = Array(rangeLength).fill(0).map((_, i) => {
        let ok = 0, tot = 0;
        const monthIdx = start + i;

        data.forEach(item => {
            if (item.dates && item.dates[monthIdx] && item.data[monthIdx] !== null) {
                tot++;
                if (checkOnTime(item.dates[monthIdx], monthIdx)) ok++;
            }
        });
        return tot ? parseFloat(((ok / tot) * 100).toFixed(2)) : 0;
    });

    const gradientPunc = ctxPunc.createLinearGradient(0, 0, 0, 300);
    gradientPunc.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    gradientPunc.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

    // --- CONTROLE DE ANIMAÇÃO ÚNICA (Anti-Flicker) ---
    const displayedPoints = new Set();

    // Plugin de Labels (Linhas + Valor)
    const dataLabelPlugin = {
        id: 'puncDataLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            const yScale = chart.scales.y;

            meta.data.forEach((point, index) => {
                if (point.x && point.y) {
                    // Restore Animation
                    let currentVal = yScale.getValueForPixel(point.y);
                    if (currentVal < 0) currentVal = 0;

                    const finalValue = chart.data.datasets[0].data[index];

                    if (finalValue >= 0) {
                        ctx.save();

                        const color = '#f59e0b'; // Laranja do tema Punc

                        ctx.fillStyle = colors.text; // Texto na cor padrão

                        // Fonte maior e bold com sombra
                        ctx.font = 'bold 15px Inter';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        // Sombra
                        ctx.save();
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2;

                        // Coordenadas
                        const r = point.options.radius || 0;
                        const labelY = point.y - (r + 12);

                        if (point.y > 0) {
                            const txt = currentVal.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
                            ctx.fillText(txt, point.x, labelY);
                        }
                        ctx.restore();

                        ctx.restore();
                    }
                }
            });
        }
    };

    charts.punc = new Chart(ctxPunc, {
        type: 'line',
        data: {
            labels: activeMonths,
            datasets: [{
                label: 'Pontualidade',
                data: pData,
                borderColor: '#f59e0b',
                backgroundColor: gradientPunc,
                borderWidth: 2,
                pointBackgroundColor: colors.bg,
                pointBorderColor: '#f59e0b',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 70, bottom: 10, left: 10, right: 20 }
            },
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 105, grid: { color: colors.grid }, ticks: { color: colors.text, padding: 20 } },
                x: { grid: { display: false }, ticks: { color: colors.text, font: { size: 10 } } }
            },
            animations: {
                y: {
                    easing: 'easeOutQuart',
                    duration: 1000,
                    delay: (ctx) => ctx.index * 150,
                    from: (ctx) => {
                        if (ctx.type === 'data' && ctx.mode === 'default' && !ctx.dropped) {
                            ctx.dropped = true;
                            return ctx.chart.scales.y.getPixelForValue(0);
                        }
                    }
                },
                radius: {
                    duration: 400,
                    easing: 'easeOutBack',
                    delay: (ctx) => {
                        if (displayedPoints.has(ctx.index)) return 0;
                        displayedPoints.add(ctx.index);
                        return ctx.index * 150 + 500;
                    },
                    from: (ctx) => {
                        if (displayedPoints.has(ctx.index)) return undefined;
                        return 0;
                    }
                }
            }
        },
        plugins: [dataLabelPlugin]
    });
}

// --- MODAL PRINCIPAL (COM CUSTOM TOOLTIPS) ---
function openMainModal(id) {
    currentMetricId = id;
    const item = fullDB[currentYear].find(i => i.id == id);
    if (!item) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    setText('modalTitle', item.name);
    setText('viewMetaDisplay', formatVal(item.meta, item.format));
    setText('viewLogicBadge', item.logic === 'maior' ? 'Maior Melhor ↑' : 'Menor Melhor ↓');

    let nMeta = 0;
    if (item.format === 'time') {
        nMeta = timeToDec(item.meta);
    } else {
        nMeta = parseFloat(String(item.meta).replace(',', '.'));
    }

    const setStatWithTooltip = (elementId, valNum, contextLabel) => {
        const el = document.getElementById(elementId);
        if (!el) return;

        if (!nMeta || isNaN(nMeta) || isNaN(valNum) || nMeta === 0) {
            el.innerText = '-';
            el.removeAttribute('data-tooltip');
            return;
        }

        const pct = (valNum / nMeta) * 100;
        const pctStr = pct.toFixed(1) + '%';
        let displayStr = '';
        let descStr = '';

        if (item.logic === 'menor') {
            displayStr = `${pctStr} do Limite`;
            descStr = `Cálculo: (Valor Utilizado / Limite) * 100. \n O indicador bateu ${pctStr} do limite máximo permitido.`;
        } else {
            displayStr = `${pctStr} da Meta`;
            descStr = `Cálculo: (Valor Realizado / Meta) * 100. \nIndica que você atingiu ${pctStr} da meta estabelecida.`;
        }

        el.innerText = displayStr;
        el.setAttribute('data-tooltip', descStr);
    };

    const valid = item.data.filter(v => v !== null && v !== "");

    if (valid.length > 0) {
        const last = valid[valid.length - 1];
        let hits = 0;
        valid.forEach(v => {
            const s = getStatus(v, item.meta, item.logic, item.format);
            if (s === 'good') hits++;
        });

        setText('viewLast', formatVal(last, item.format));
        let nLast = item.format === 'time' ? timeToDec(last) : parseFloat(String(last).replace(',', '.'));
        setStatWithTooltip('viewLastPct', nLast, 'Último');

        const targetEl = document.getElementById('viewTarget');
        if (valid.length > 0) {
            const pctBatida = Math.round((hits / valid.length) * 100);
            targetEl.innerText = pctBatida + '%';
            const tooltipText = `Regra: (Meses na Meta / Meses Lançados) * 100.\nIndica a consistência: de ${valid.length} meses lançados, a meta foi atingida em ${hits}.`;
            targetEl.setAttribute('data-tooltip', tooltipText);
        } else {
            targetEl.innerText = "-";
            targetEl.removeAttribute('data-tooltip');
        }

        // Cálculo da Média (agora suporta Time também)
        const values = valid.map(v => {
            if (item.format === 'time') return timeToDec(v);
            return parseFloat(String(v).replace(',', '.'));
        }).filter(n => !isNaN(n));

        if (values.length > 0) {
            const sum = values.reduce((a, b) => a + b, 0);
            const avg = sum / values.length;
            setText('viewAvg', formatVal(avg, item.format));
            setStatWithTooltip('viewAvgPct', avg, 'Média');
        } else {
            setText('viewAvg', "-");
            setText('viewAvgPct', "-");
        }
    } else {
        setText('viewLast', "-");
        setText('viewLastPct', "-");
        setText('viewAvg', "-");
        setText('viewAvgPct', "-");
        setText('viewTarget', "-");
    }

    let pCount = 0, pTotal = 0;
    const dates = item.dates || Array(12).fill(null);
    dates.forEach((d, i) => {
        if (item.data[i] !== null && item.data[i] !== "") {
            pTotal++;
            if (checkOnTime(d, i)) pCount++;
        }
    });
    const pScore = pTotal ? Math.round((pCount / pTotal) * 100) : 0;
    setText('viewPunc', pTotal ? pScore + "%" : "-");

    const badgeEl = document.getElementById('puncBadge');
    if (badgeEl) {
        if (pTotal === 0) badgeEl.innerHTML = '<span class="badge badge-warn">Sem dados</span>';
        else if (pScore === 100) badgeEl.innerHTML = '<span class="badge badge-good">Excelente</span>';
        else if (pScore >= 70) badgeEl.innerHTML = '<span class="badge badge-warn">Regular</span>';
        else badgeEl.innerHTML = '<span class="badge badge-bad">Crítico</span>';
    }

    renderTimeline(item);
    populateEditForm(item);

    switchToViewMode();
    document.getElementById('mainModal').classList.add('open');

    // --- LÓGICA DE RENDERIZAÇÃO INSTANTÂNEA ---
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            renderDetailChart(item);
        });
    });
}

function renderTimeline(item) {
    const c = document.getElementById('timelineTrack');
    let h = '';

    for (let i = 0; i < 12; i++) {
        const hasData = item.data[i] !== null && item.data[i] !== "";

        if (hasData) {
            const dateStr = item.dates[i];
            let cls = 'tl-dot';
            let tip = 'Entregue';

            if (dateStr) {
                if (checkOnTime(dateStr, i)) { cls += ' ok'; tip = 'No Prazo'; }
                else { cls += ' late'; tip = 'Atrasado'; }
            } else {
                cls += ' empty'; tip = 'Sem data';
            }

            h += `<div class="timeline-item" title="${months[i]}: ${tip}">
                <div class="${cls}"></div><div class="tl-label">${months[i]}</div>
            </div>`;
        }
    }

    c.innerHTML = h || '<div style="color:#666;font-size:0.8rem;text-align:center;width:100%;padding:10px">Sem dados lançados.</div>';
}

function populateEditForm(item) {
    document.getElementById('inp-id').value = item.id;
    document.getElementById('inp-name').value = item.name;
    document.getElementById('inp-meta').value = item.meta;
    document.getElementById('inp-logic').value = item.logic;
    document.getElementById('inp-format').value = item.format;

    const secSel = document.getElementById('inp-sector');
    const secs = [...new Set(fullDB[currentYear].map(i => i.sector))];
    secSel.innerHTML = secs.map(s => `<option value="${s}">${s}</option>`).join('');
    secSel.value = item.sector;

    const c = document.getElementById('monthsGrid');
    c.innerHTML = '';
    months.forEach((m, i) => {
        const v = item.data[i] || '';
        const d = item.dates[i] || '';
        c.innerHTML += `
            <div class="month-inp-group">
                <div class="mig-header"><span>${m}</span></div>
                <input type="text" id="mv-${i}" class="input-field" value="${v}" placeholder="-" style="text-align:center">
                <input type="date" id="md-${i}" class="date-inp" value="${d}">
            </div>
        `;
    });
}

function saveItem() {
    const id = document.getElementById('inp-id').value;
    const name = document.getElementById('inp-name').value;
    const sector = isNewSectorMode ? document.getElementById('inp-new-sector').value : document.getElementById('inp-sector').value;

    if (!name || !sector) return alert("Preencha Nome e Setor.");

    const newData = [];
    const newDates = [];
    for (let i = 0; i < 12; i++) {
        newData.push(document.getElementById(`mv-${i}`).value || null);
        newDates.push(document.getElementById(`md-${i}`).value || null);
    }

    const newItem = {
        id: id ? parseFloat(id) : Date.now(),
        name, sector,
        meta: document.getElementById('inp-meta').value,
        logic: document.getElementById('inp-logic').value,
        format: document.getElementById('inp-format').value,
        data: newData, dates: newDates
    };

    if (id) {
        const idx = fullDB[currentYear].findIndex(i => i.id == id);
        fullDB[currentYear][idx] = newItem;
        currentMetricId = newItem.id;
        openMainModal(currentMetricId);
    } else {
        fullDB[currentYear].push(newItem);
        if (currentYear === '2025') {
            const clone = { ...newItem, id: Date.now() + 1, data: Array(12).fill(null), dates: Array(12).fill(null) };
            fullDB['2026'].push(clone);
        }
        closeModal('mainModal');
    }
    saveData();
    renderApp(currentSector);
}

function openCreateModal() {
    currentMetricId = null;
    setText('modalTitle', 'Novo Indicador');
    document.getElementById('inp-id').value = "";
    document.getElementById('inp-name').value = "";
    document.getElementById('inp-meta').value = "";

    const c = document.getElementById('monthsGrid');
    c.innerHTML = '';
    months.forEach((m, i) => {
        c.innerHTML += `
            <div class="month-inp-group">
                <div class="mig-header"><span>${m}</span></div>
                <input type="text" id="mv-${i}" class="input-field" placeholder="-" style="text-align:center">
                <input type="date" id="md-${i}" class="date-inp">
            </div>
        `;
    });

    const secSel = document.getElementById('inp-sector');
    const secs = [...new Set(fullDB[currentYear].map(i => i.sector))];
    secSel.innerHTML = secs.map(s => `<option value="${s}">${s}</option>`).join('');

    switchToEditMode();
    document.getElementById('mainModal').classList.add('open');
}

function openPdfModal() { document.getElementById('pdfModal').classList.add('open'); }

function generateExport(type) {
    closeModal('pdfModal');

    if (type === 'table-pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(16);
        doc.text(`Relatório FAV Analytics - ${currentYear}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Setor: ${currentSector}`, 14, 28);

        const rows = [];
        const pdfRowMap = {};
        let currentRowIndex = 0;

        const sectors = currentSector === 'Todos' ? [...new Set(fullDB[currentYear].map(i => i.sector))].sort() : [currentSector];

        sectors.forEach(sec => {
            rows.push([{
                content: sec, colSpan: 14,
                styles: { fillColor: [228, 228, 231], textColor: [24, 24, 27], fontStyle: 'bold', halign: 'left' }
            }]);
            pdfRowMap[currentRowIndex] = null;
            currentRowIndex++;

            const items = fullDB[currentYear].filter(i => i.sector === sec);
            items.forEach(item => {
                rows.push([
                    item.name, formatVal(item.meta, item.format),
                    ...item.data.map(v => formatVal(v, item.format))
                ]);
                pdfRowMap[currentRowIndex] = item;
                currentRowIndex++;
            });
        });

        doc.autoTable({
            head: [['Indicador', 'Meta', ...months]],
            body: rows,
            startY: 35,
            styles: { fontSize: 7, cellPadding: 2, lineColor: 200, lineWidth: 0.1, halign: 'center', valign: 'middle' },
            headStyles: { fillColor: [59, 130, 246], halign: 'center' },
            didParseCell: function (dataCell) {
                if (dataCell.section === 'body' && dataCell.column.index >= 2) {
                    const rowIndex = dataCell.row.index;
                    const item = pdfRowMap[rowIndex];

                    if (item) {
                        const monthIndex = dataCell.column.index - 2;
                        const rawValue = item.data[monthIndex];
                        const status = getStatus(rawValue, item.meta, item.logic, item.format);

                        if (status === 'good') {
                            dataCell.cell.styles.fillColor = [16, 185, 129];
                            dataCell.cell.styles.textColor = [255, 255, 255];
                        } else if (status === 'bad') {
                            dataCell.cell.styles.fillColor = [239, 68, 68];
                            dataCell.cell.styles.textColor = [255, 255, 255];
                        }
                    }
                }
            }
        });
        doc.save(`Relatorio_${currentYear}.pdf`);

    } else if (type === 'excel') {
        const data = currentSector === 'Todos' ? fullDB[currentYear] : fullDB[currentYear].filter(i => i.sector === currentSector);
        const wsData = data.map(item => {
            const row = { "Indicador": item.name, "Setor": item.sector, "Meta": item.meta };
            months.forEach((m, i) => row[m] = item.data[i] || "");
            return row;
        });
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dados");
        XLSX.writeFile(wb, `FAV_Dados_${currentYear}.xlsx`);

    } else if (type === 'visual-pdf') {
        showToast("Gerando PDF...", "wait");

        const wasTable = currentView === 'table';
        if (wasTable) switchView('exec');

        setTimeout(() => {
            const element = document.getElementById('charts-area');
            const options = {
                scale: 2, useCORS: true,
                backgroundColor: currentTheme === 'light' ? COL_BG_LIGHT : '#09090b',
                logging: false,
                onclone: function (clonedDoc) {
                    const clonedChartsArea = clonedDoc.getElementById('charts-area');
                    if (clonedChartsArea) {
                        const bg = currentTheme === 'light' ? COL_BG_LIGHT : '#09090b';
                        const cardBg = currentTheme === 'light' ? COL_BG_LIGHT : COL_BG_DARK;
                        const border = currentTheme === 'light' ? '#d4d4d8' : '#3f3f46';

                        clonedChartsArea.style.padding = '20px';
                        clonedChartsArea.style.backgroundColor = bg;
                        const chartCards = clonedChartsArea.querySelectorAll('.chart-card');
                        chartCards.forEach(card => {
                            card.style.boxShadow = 'none';
                            card.style.border = `1px solid ${border}`;
                            card.style.backgroundColor = cardBg;
                            card.style.overflow = 'visible';
                        });
                        const canvases = clonedChartsArea.querySelectorAll('canvas');
                        canvases.forEach(canvas => {
                            canvas.style.display = 'block';
                            canvas.style.width = '100%';
                            canvas.style.height = '100%';
                        });
                    }
                }
            };

            html2canvas(element, options).then(canvas => {
                const imgData = canvas.toDataURL('image/png', 1.0);
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('l', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const imgWidth = pageWidth - 20;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                if (currentTheme === 'dark') {
                    doc.setFillColor(9, 9, 11);
                    doc.rect(0, 0, pageWidth, pageHeight, 'F');
                    doc.setTextColor(255, 255, 255);
                } else {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(0, 0, pageWidth, pageHeight, 'F');
                    doc.setTextColor(0, 0, 0);
                }

                doc.setFontSize(16);
                doc.text(`Dashboard FAV Analytics - ${currentYear}`, pageWidth / 2, 15, { align: 'center' });

                doc.setFontSize(10);
                doc.setTextColor(150, 150, 150);
                doc.text(`Setor: ${currentSector} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`,
                    pageWidth / 2, 22, { align: 'center' });

                const xPos = (pageWidth - imgWidth) / 2;
                const yPos = 30;

                if (yPos + imgHeight > pageHeight) {
                    const adjustedHeight = pageHeight - yPos - 10;
                    const adjustedWidth = (canvas.width * adjustedHeight) / canvas.height;
                    const adjustedXPos = (pageWidth - adjustedWidth) / 2;
                    doc.addImage(imgData, 'PNG', adjustedXPos, yPos, adjustedWidth, adjustedHeight);
                } else {
                    doc.addImage(imgData, 'PNG', xPos, yPos, imgWidth, imgHeight);
                }

                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.text('Página 1/1', pageWidth - 10, pageHeight - 10, { align: 'right' });

                doc.save(`Dashboard_FAV_${currentYear}_${currentSector}.pdf`);

                if (wasTable) {
                    setTimeout(() => switchView('table'), 500);
                }
                showToast("PDF gerado com sucesso!");
            }).catch(error => {
                console.error('Erro ao gerar PDF:', error);
                showToast("Erro ao gerar PDF!", "error");
                if (wasTable) switchView('table');
            });
        }, 1000);
    }
}

function renderDetailChart(item) {
    const ctx = document.getElementById('detailChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const colors = getChartColors();
    const cData = item.data.map(v => {
        if (v === null || v === "") return null;
        let n = item.format === 'time' ? timeToDec(v) : parseFloat(v.replace(',', '.'));
        return isNaN(n) ? null : n;
    });

    const cMeta = item.format === 'time' ? timeToDec(item.meta) : parseFloat(item.meta.replace(',', '.'));

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Real',
                data: cData,
                borderColor: COL_ACCENT,
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: colors.bg,
                animations: {
                    y: {
                        duration: 1200,
                        easing: 'easeOutQuart',
                        from: (ctx) => {
                            return ctx.chart.height;
                        }
                    }
                },
                pointBorderColor: COL_ACCENT
            }, {
                label: 'Meta',
                data: Array(12).fill(cMeta),
                borderColor: '#ef4444',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { left: 0, right: 20, top: 10, bottom: 0 }
            },
            plugins: { legend: { display: false } },
            // Permite clicar no mês do gráfico para abrir a análise
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    openAnalysisModal(item.id, elements[0].index);
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text, font: { size: 10 } }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text },
                    beginAtZero: true
                }
            },
            // --- ANIMAÇÃO GLOBAL REMOVIDA (MOVIDO PARA DATASET) ---
        }
    });
}

function temDadosValidos(item) {
    for (let i = 0; i < item.data.length; i++) {
        const val = item.data[i];
        if (val !== null && val !== undefined) {
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed !== "" && trimmed !== "null" && trimmed !== "undefined" && trimmed !== "NaN") {
                    return true;
                }
            } else {
                return true;
            }
        }
    }
    return false;
}

// Helpers diversos
function populateSectorFilter() {
    const d = fullDB[currentYear] || [];
    // Ordena os setores alfabeticamente
    const uniqueSectors = [...new Set(d.map(i => i.sector))].sort();
    // Adiciona "Todos" manualmente no topo
    const finalList = ['Todos', ...uniqueSectors];

    const el = document.getElementById('sector-filter');
    el.innerHTML = finalList.map(x => `<option value="${x}">${x}</option>`).join('');
    el.value = currentSector;
}

// --- TOGGLE SETOR IMÓVEL (SWAP) ---
function toggleNewSector() {
    isNewSectorMode = !isNewSectorMode;
    const selectEl = document.getElementById('inp-sector');
    const inputEl = document.getElementById('inp-new-sector');
    const btnEl = document.getElementById('btn-toggle-sector');

    if (isNewSectorMode) {
        selectEl.style.display = 'none';
        inputEl.style.display = 'block';
        if (btnEl) btnEl.innerText = "(Voltar)";
        inputEl.focus();
    } else {
        selectEl.style.display = 'block';
        inputEl.style.display = 'none';
        if (btnEl) btnEl.innerText = "(Novo?)";
        inputEl.value = "";
    }
}

function openSectorManager() {
    currentMetricId = null;
    setText('modalTitle', 'Visibilidade de Setores');

    document.getElementById('mode-view').style.display = 'none';
    document.getElementById('footer-view').style.display = 'none';
    document.getElementById('mode-edit').style.display = 'none';
    document.getElementById('footer-edit').style.display = 'none';

    const container = document.getElementById('mode-sectors');
    container.style.display = 'grid'; // grid for layout
    container.style.gridTemplateColumns = '1fr 1fr';
    container.style.gap = '10px';
    container.style.padding = '10px';
    container.style.maxHeight = '60vh'; // Limit height
    container.style.overflowY = 'auto'; // Enable scrolling
    document.getElementById('footer-sectors').style.display = 'flex';

    const allSectors = [...new Set(fullDB[currentYear].map(i => i.sector))].sort();

    let html = '';
    allSectors.forEach(s => {
        const isHidden = hiddenSectors.includes(s);
        const icon = isHidden ? 'square' : 'check-square';
        const color = isHidden ? 'var(--text-muted)' : 'var(--accent)';
        const opacity = isHidden ? '0.6' : '1';

        html += `
            <div onclick="toggleSectorHIDDEN('${s}')" 
                 style="background:var(--bg-elevated); padding:12px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:10px; border:1px solid var(--border); user-select:none;">
                <i data-lucide="${icon}" style="color:${color}"></i>
                <span style="font-weight:600; opacity:${opacity}">${s}</span>
            </div>
        `;
    });

    container.innerHTML = html;
    document.getElementById('mainModal').classList.add('open');
    lucide.createIcons();
}

function toggleSectorHIDDEN(sec) {
    if (hiddenSectors.includes(sec)) {
        hiddenSectors = hiddenSectors.filter(s => s !== sec);
    } else {
        hiddenSectors.push(sec);
    }
    localStorage.setItem('fav_hidden_sectors', JSON.stringify(hiddenSectors));
    openSectorManager(); // Re-render modal to refresh icons
}

function switchToEditMode() { document.getElementById('mode-view').style.display = 'none'; document.getElementById('footer-view').style.display = 'none'; document.getElementById('mode-edit').style.display = 'block'; document.getElementById('footer-edit').style.display = 'flex'; if (currentMetricId) setText('modalTitle', 'Editar Indicador'); }
function switchToViewMode() {
    document.getElementById('mode-view').style.display = 'block';
    document.getElementById('footer-view').style.display = 'flex';
    document.getElementById('mode-edit').style.display = 'none';
    document.getElementById('footer-edit').style.display = 'none';
    document.getElementById('mode-sectors').style.display = 'none';
    document.getElementById('footer-sectors').style.display = 'none';
    if (currentMetricId) setText('modalTitle', fullDB[currentYear].find(i => i.id == currentMetricId).name);
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    // Reset modal state to view mode when closing, to avoid stucking in sector mode
    if (id === 'mainModal') switchToViewMode();
}
function setSector(val) { currentSector = val; renderApp(); }
// Removed previous toggleSectorVisibility as logic moved to hidden modal
function setYear(y) {
    currentYear = y;

    // Atualiza visual do seletor
    document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('btn-' + y);
    if (btn) btn.classList.add('active');

    populateAnalyticsFilter(); // Refresh if year changes (unlikely to change month names, but safe)
    if (currentView === 'manager') renderManagerialView();
    else renderApp();

}

function populateAnalyticsFilter() {
    const s = document.getElementById('an-start');
    const e = document.getElementById('an-end');
    if (!s || !e) return;

    s.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    e.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');

    s.value = analyticsPeriod.start;
    e.value = analyticsPeriod.end;
}

function setAnalyticsPeriod() {
    const s = parseInt(document.getElementById('an-start').value);
    const e = parseInt(document.getElementById('an-end').value);

    if (s > e) {
        // Auto-correct: if start > end, set end = start
        document.getElementById('an-end').value = s;
        analyticsPeriod.start = s;
        analyticsPeriod.end = s;
    } else {
        analyticsPeriod.start = s;
        analyticsPeriod.end = e;
    }
    renderApp();
}
// --- SWITCH VIEW (CONTROLE GERAL) ---
function switchView(v) {
    currentView = v;

    const viewTable = document.getElementById('view-table');
    const viewExec = document.getElementById('view-exec');
    const viewManager = document.getElementById('view-manager');

    if (viewTable) viewTable.style.display = v === 'table' ? 'block' : 'none';
    if (viewExec) viewExec.style.display = v === 'exec' ? 'block' : 'none';
    if (viewManager) viewManager.style.display = v === 'manager' ? 'block' : 'none';

    // Toggle KPI Bar (Redundant in Manager View)
    const kpiBar = document.querySelector('.kpi-bar');
    if (kpiBar) kpiBar.style.display = v === 'manager' ? 'none' : 'flex';


    // Manage NPS Button Visibility (Agora é um link externo e fica sempre visível)
    const npsBtn = document.getElementById('btn-nps-toggle');
    if (npsBtn) {
        npsBtn.style.display = 'flex';
        npsBtn.classList.remove('active');
    }

    // Toggle Filters
    const sectorFilter = document.getElementById('sector-filter');
    const yearSelector = document.querySelector('.year-selector');
    const periodFilterWrapper = document.getElementById('period-filter-wrapper');

    if (v === 'manager') {
        if (sectorFilter) { sectorFilter.disabled = true; sectorFilter.classList.add('filter-disabled'); }
        if (yearSelector) { yearSelector.style.pointerEvents = 'all'; yearSelector.style.opacity = '1'; }
        if (periodFilterWrapper) periodFilterWrapper.classList.add('filter-disabled');
    } else {
        if (sectorFilter) { sectorFilter.disabled = false; sectorFilter.classList.remove('filter-disabled'); }
        if (yearSelector) { yearSelector.style.pointerEvents = 'all'; yearSelector.style.opacity = '1'; }
        if (periodFilterWrapper) {
            periodFilterWrapper.classList.remove('filter-disabled');
            periodFilterWrapper.style.display = 'flex';
        }
    }

    document.getElementById('btn-view-table').classList.toggle('active', v === 'table');
    document.getElementById('btn-view-exec').classList.toggle('active', v === 'exec');
    const btnMan = document.getElementById('btn-view-manager');
    if (btnMan) btnMan.classList.toggle('active', v === 'manager');

    if (v === 'manager') renderManagerialView();
    else renderApp();
}
function toggleLoading(s) { document.getElementById('loading-overlay').style.display = s ? 'flex' : 'none'; }
function showToast(m, t) { const el = document.getElementById('toast'); el.innerText = m; el.className = `toast ${t}`; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
function setText(id, txt) { const el = document.getElementById(id); if (el) el.innerText = txt; }
function configDeadline() { const n = prompt("Novo dia limite (Ex: 15):", deadlineDay); if (n && !isNaN(n)) { deadlineDay = parseInt(n); localStorage.setItem('fav_deadline', deadlineDay); renderApp(); } }
function importFrom2025() { if (confirm("Deseja importar?")) { fullDB['2026'] = fullDB['2025'].map(i => ({ ...i, id: Date.now() + Math.random(), data: Array(12).fill(null), dates: Array(12).fill(null), analysis: {} })); saveData(); renderApp(); } }
function deleteItem() { if (confirm("Excluir?")) { fullDB[currentYear] = fullDB[currentYear].filter(i => i.id != currentMetricId); saveData(); closeModal('mainModal'); renderApp(); } }


/* =================================================================
   ADD-ON: ANÁLISE GERENCIAL (MANAGER ANALYTICS V2)
   ================================================================= */

function loadAnalysisData() {
    const stored = localStorage.getItem('fav_analysis');
    if (stored) {
        analysisDB = JSON.parse(stored);
    }
}

// --- MODIFICADO: Função Open com Verificação de Rascunho ---
function openAnalysisModal(id, idx) {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    let targetId = id;
    let targetIdx = idx;
    let usingDraft = false;

    // Se existe rascunho do ano atual
    if (draft && draft.year === currentYear) {
        // Se o rascunho é para OUTRO item, avisa
        if (draft.id !== id || draft.idx !== idx) {
            const itemDraft = fullDB[currentYear].find(i => i.id == draft.id);
            const nomeDraft = itemDraft ? itemDraft.name : "Indicador desconhecido";
            const mesDraft = months[draft.idx];

            if (confirm(`Você tem um rascunho pendente em:\n"${nomeDraft}" (${mesDraft}).\n\nDeseja retomar esse rascunho?\n[OK] Sim, ir para o rascunho.\n[Cancelar] Não, descartar e abrir o novo.`)) {
                // Redireciona para o rascunho
                targetId = draft.id;
                targetIdx = draft.idx;
                usingDraft = true;
            } else {
                // Descarta e segue para o novo
                localStorage.removeItem(DRAFT_KEY);
                usingDraft = false;
            }
        } else {
            // Se o rascunho é para o MESMO item, carrega automaticamente
            usingDraft = true;
        }
    }

    activeAnalysis = { id: targetId, idx: targetIdx };
    const item = fullDB[currentYear].find(i => i.id == targetId);
    if (!item) return;

    // Dados básicos
    setText('analysisName', item.name);
    setText('analysisPeriodLabel', `${months[targetIdx]}/${currentYear}`);

    // --- NOVA EXIBIÇÃO CLARA (V2) ---
    const val = item.data[targetIdx];
    const meta = item.meta;

    // 1. Meta
    setText('analysisMeta', formatVal(meta, item.format));

    // 2. Realizado
    setText('analysisReal', formatVal(val, item.format));
    const valEl = document.getElementById('analysisReal');

    // Cor do Realizado baseada no status
    const currentStatus = getStatus(val, item.meta, item.logic, item.format);
    valEl.className = ''; // Reset
    if (currentStatus === 'good') valEl.style.color = 'var(--good)';
    else if (currentStatus === 'bad') valEl.style.color = 'var(--bad)';
    else valEl.style.color = 'var(--text-main)';

    // 3. Lógica (Objetivo)
    const logicEl = document.getElementById('analysisLogic');
    let logicText = "";
    let logicIconType = "";

    if (item.logic === 'maior') {
        logicText = "Maior é Melhor";
        logicIconType = "arrow-up";
    } else {
        logicText = "Menor é Melhor";
        logicIconType = "arrow-down";
    }

    // Estilo "Blue Shape" (Pílula Azul com Seta)
    // Usamos cores hardcoded aqui para garantir o visual "azul com setinha" que o usuário pediu,
    // ou podemos usar classes CSS se existirem. Vamos fazer inline estilizado para garantir.
    logicEl.innerHTML = `
        <div style="
            display: inline-flex; 
            align-items: center; 
            gap: 6px; 
            background: rgba(59, 130, 246, 0.15); 
            color: #3b82f6; 
            padding: 4px 10px; 
            border-radius: 6px; 
            font-size: 0.8rem; 
            font-weight: 600;
            border: 1px solid rgba(59, 130, 246, 0.2);
        ">
            <i data-lucide="${logicIconType}" style="width: 14px; height: 14px;"></i>
            ${logicText}
        </div>
    `;

    // Reinicializa os ícones Lucide dentro do modal
    lucide.createIcons({
        root: logicEl,
        nameAttr: 'data-lucide',
        attrs: {
            class: "lucide-icon"
        }
    });

    // 4. Badge de Desvio (Reimplementado para o novo local)
    // Limpa badge anterior se houver
    const oldBadgeContainer = document.getElementById('analysisDeviationBadge');
    if (oldBadgeContainer) oldBadgeContainer.innerHTML = '';

    const valNum = item.format === 'time' ? timeToDec(val) : parseFloat(String(val).replace(',', '.'));
    const metaNum = item.format === 'time' ? timeToDec(item.meta) : parseFloat(String(item.meta).replace(',', '.'));

    if (!isNaN(valNum) && !isNaN(metaNum) && metaNum !== 0 && val !== null && val !== "") {
        const diff = valNum - metaNum;
        const pctDev = (diff / metaNum) * 100;
        const signal = pctDev > 0 ? '+' : '';

        let badgeColor = 'var(--text-muted)';
        let badgeBg = 'var(--bg-panel)';

        // Se maior é melhor: diff > 0 é bom (verde), diff < 0 é ruim (vermelho)
        // Se menor é melhor: diff < 0 é bom (verde), diff > 0 é ruim (vermelho)
        const isGood = item.logic === 'maior' ? diff >= 0 : diff <= 0;

        badgeColor = isGood ? 'var(--good)' : 'var(--bad)';
        badgeBg = isGood ? 'var(--good-bg)' : 'var(--bad-bg)';

        if (oldBadgeContainer) {
            oldBadgeContainer.innerText = `${signal}${pctDev.toFixed(1)}% vs Meta`;
            oldBadgeContainer.style.backgroundColor = badgeBg;
            oldBadgeContainer.style.color = badgeColor;
            oldBadgeContainer.style.padding = '2px 6px';
            oldBadgeContainer.style.borderRadius = '4px';
            oldBadgeContainer.style.display = 'inline-block';
        }
    } else {
        if (oldBadgeContainer) oldBadgeContainer.style.display = 'none';
    }

    // Bloco de Revisão (Lógica mantida V109)
    const prevBlock = document.getElementById('previousReviewBlock');
    const prevCauseText = document.getElementById('prevCauseText'); // Novo
    const prevPlanText = document.getElementById('prevPlanText');
    const prevMetaValue = document.getElementById('prevMetaValue');
    const prevBadge = document.getElementById('prevResultBadge');

    let prevIdx = targetIdx - 1;
    if (prevIdx >= 0) {
        // Busca análise no objeto carregado da nuvem (via getAnalysis)
        const prevAnalysis = getAnalysis(targetId, currentYear, prevIdx);

        if (prevAnalysis && (prevAnalysis.planoAcao || prevAnalysis.causa)) {
            prevBlock.style.display = 'block';

            // Popula Causa
            if (prevAnalysis.causa) {
                prevCauseText.innerText = `"${prevAnalysis.causa}"`;
                prevCauseText.style.display = 'block';
            } else {
                prevCauseText.innerText = '-';
                // Opcional: esconder label se não tiver causa, mas deixar assim por padrão
            }

            // Popula Plano
            prevPlanText.innerText = prevAnalysis.planoAcao ? `"${prevAnalysis.planoAcao}"` : "-";
            prevMetaValue.innerText = prevAnalysis.metaProximoMes ? formatVal(prevAnalysis.metaProximoMes, item.format) : "N/D";

            // --- CÁLCULOS AVANÇADOS (Crescimento Real) ---
            let htmlBadges = "";
            let currentValNum = item.format === 'time' ? timeToDec(val) : parseFloat(String(val).replace(',', '.'));

            // 1. Verificação da Meta Estipulada (Melhora Esperada)
            if (val !== null && val !== "" && prevAnalysis.metaProximoMes) {
                const targetValNum = item.format === 'time' ? timeToDec(prevAnalysis.metaProximoMes) : parseFloat(String(prevAnalysis.metaProximoMes).replace(',', '.'));

                let success = false;
                if (!isNaN(currentValNum) && !isNaN(targetValNum)) {
                    if (item.logic === 'maior') success = currentValNum >= targetValNum;
                    else success = currentValNum <= targetValNum;
                }

                if (success) htmlBadges += '<span class="result-badge result-success">Melhora Esperada OK</span>';
                else htmlBadges += '<span class="result-badge result-fail">Abaixo da Expectativa</span>';
            }

            // 2. Crescimento Real
            const prevValRaw = item.data[prevIdx];
            if (val !== null && val !== "" && prevValRaw !== null && prevValRaw !== "") {
                const prevValNum = item.format === 'time' ? timeToDec(prevValRaw) : parseFloat(String(prevValRaw).replace(',', '.'));

                if (!isNaN(currentValNum) && !isNaN(prevValNum) && prevValNum !== 0) {
                    const diff = currentValNum - prevValNum;
                    const pctDiff = (diff / prevValNum) * 100;

                    let growthLabel = "";
                    let growthClass = "result-neutral";
                    const formattedDiff = pctDiff.toFixed(1) + "%";
                    const symbol = diff > 0 ? "+" : "";

                    if (item.logic === 'maior') {
                        if (diff > 0) { growthLabel = `Cresceu ${symbol}${formattedDiff}`; growthClass = "result-success"; }
                        else if (diff < 0) { growthLabel = `Caiu ${formattedDiff}`; growthClass = "result-fail"; }
                        else { growthLabel = "Estável"; }
                    } else {
                        if (diff < 0) { growthLabel = `Melhorou ${formattedDiff}`; growthClass = "result-success"; }
                        else if (diff > 0) { growthLabel = `Piorou ${symbol}${formattedDiff}`; growthClass = "result-fail"; }
                        else { growthLabel = "Estável"; }
                    }
                    htmlBadges += `<span class="result-badge ${growthClass}">${growthLabel} vs Mês Anterior</span>`;
                }
            }
            if (htmlBadges === "") htmlBadges = '<span style="color:var(--text-muted); font-size:0.7rem">Dados insuficientes para cálculo.</span>';
            prevBadge.innerHTML = htmlBadges;

        } else {
            prevBlock.style.display = 'none';
        }
    } else {
        prevBlock.style.display = 'none';
    }

    // --- CARREGAMENTO DOS CAMPOS ---
    let dataToLoad = {};

    if (usingDraft) {
        // Carrega do Rascunho
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
        dataToLoad = d.data;
        showToast("Rascunho recuperado", "wait");
    } else {
        // Carrega do Banco de Dados
        const saved = getAnalysis(targetId, currentYear, targetIdx);
        dataToLoad = saved || { analiseCritica: '', causa: '', planoAcao: '', responsavel: '', metaProximoMes: '' };
    }

    document.getElementById('ana-critical').value = dataToLoad.analiseCritica;
    document.getElementById('ana-cause').value = dataToLoad.causa;
    document.getElementById('ana-plan').value = dataToLoad.planoAcao;
    document.getElementById('ana-responsible').value = dataToLoad.responsavel;
    document.getElementById('ana-next-meta').value = dataToLoad.metaProximoMes;

    document.getElementById('analysisModal').classList.add('open');
}

// --- NOVO: Função para limpar o formulário visualmente ---
function clearAnalysisForm() {
    document.getElementById('ana-critical').value = '';
    document.getElementById('ana-cause').value = '';
    document.getElementById('ana-plan').value = '';
    document.getElementById('ana-responsible').value = '';
    document.getElementById('ana-next-meta').value = '';
    document.getElementById('ana-critical').focus();

    // Remove rascunho ao limpar
    localStorage.removeItem(DRAFT_KEY);

    // IMPORTANTE: NÃO CHAMAMOS renderTable() AQUI PARA EVITAR A PISCADA

    showToast("Campos limpos. Clique em Salvar para remover da nuvem.", "wait");
}

function saveAnalysis() {
    const { id, idx } = activeAnalysis;
    if (!id && id !== 0) return;

    if (!analysisDB[id]) analysisDB[id] = {};
    if (!analysisDB[id][currentYear]) analysisDB[id][currentYear] = {};

    const critica = document.getElementById('ana-critical').value;
    const causa = document.getElementById('ana-cause').value;
    const plano = document.getElementById('ana-plan').value;
    const resp = document.getElementById('ana-responsible').value;
    const meta = document.getElementById('ana-next-meta').value;

    const isEmpty = !critica.trim() && !causa.trim() && !plano.trim() && !resp.trim() && !meta.trim();

    // Objeto para salvar
    const dataObj = {
        analiseCritica: critica,
        causa: causa,
        planoAcao: plano,
        responsavel: resp,
        metaProximoMes: meta,
        dataRegistro: new Date().toISOString()
    };

    if (isEmpty) {
        // Se vazio, remove do objeto local (faz bolinha sumir)
        if (analysisDB[id] && analysisDB[id][currentYear]) {
            delete analysisDB[id][currentYear][idx];
            if (Object.keys(analysisDB[id][currentYear]).length === 0) delete analysisDB[id][currentYear];
        }
        showToast("Análise removida!");
        // CHAMA A EXCLUSÃO FÍSICA NO BACKEND
        deleteAnalysisFromCloud(id, currentYear, idx);
    } else {
        // Se tem dados, salva no objeto local
        analysisDB[id][currentYear][idx] = dataObj;
        showToast("Análise Salva!");

        // E dispara o salvamento na nuvem (linha específica na aba BD_ANALISES)
        saveAnalysisToCloud(id, currentYear, idx, dataObj);
    }

    // Limpa o rascunho pois foi "comitado"
    localStorage.removeItem(DRAFT_KEY);

    // Não usamos mais localStorage para persistência final, pois usamos a nuvem
    // Mas se quiser manter um cache local, pode descomentar:
    // localStorage.setItem('fav_analysis', JSON.stringify(analysisDB)); 

    closeModal('analysisModal');

    // Re-renderiza a tabela para atualizar a "bolinha"
    if (currentView === 'table') renderTable(fullDB[currentYear]);
}


function getAnalysis(id, year, idx) {
    if (analysisDB[id] && analysisDB[id][year] && analysisDB[id][year][idx]) {
        return analysisDB[id][year][idx];
    }
    return null;
}


/* =================================================================
   --- MANAGERIAL VIEW LOGIC (NEW CORE) ---
   ================================================================= */

function renderManagerialView() {
    const rawData = fullDB[currentYear] || [];
    const data = rawData.filter(i => !hiddenSectors.includes(i.sector)); // Exclude hidden sectors from managerial view
    const metrics = calculateManagerialMetrics(data);

    // 1. Render KPIs
    // Maturidade Geral (Média dos Scores dos Setores)
    const avgMaturity = metrics.globalMaturity;
    setText('man-score-total', avgMaturity);

    // Críticos Total (Soma de todos os meses ruins do ano)
    setText('man-critical-total', metrics.totalCriticalCount);

    // Cobertura de Análises Global
    setText('man-analysis-coverage', (metrics.globalCoverage !== null) ? metrics.globalCoverage + "%" : "N/A");

    // Eficácia (Quantos planos geraram melhora / Total planos)
    setText('man-plan-efficacy', metrics.globalEfficacy + "%");


    // 2. Render Sector Ranking
    const tbody = document.getElementById('manager-sector-list');
    tbody.innerHTML = '';

    metrics.sectorRanking.forEach((sec, idx) => {
        let badgeClass = 'score-low';
        if (sec.score >= 80) badgeClass = 'score-high';
        else if (sec.score >= 50) badgeClass = 'score-med';

        // Lógica de Medalhas (Com Ícones)
        let rankDisplay = `<span class="rank-text">${idx + 1}</span>`;
        if (idx === 0) rankDisplay = `<div class="rank-medal medal-gold"><i data-lucide="trophy" size="14"></i></div>`;
        else if (idx === 1) rankDisplay = `<div class="rank-medal medal-silver"><i data-lucide="medal" size="14"></i></div>`;
        else if (idx === 2) rankDisplay = `<div class="rank-medal medal-bronze"><i data-lucide="medal" size="14"></i></div>`;

        // Lógica de Texto de Cobertura
        let covText = (sec.coverage !== null) ? `${sec.coverage}% Cob.` : `<span style="opacity:0.5; font-style:italic">N/A (Cob.)</span>`;
        if (sec.criticos === 0) {
            covText = `<span style="opacity:0.5; font-style:italic;">N/A (Cob.)</span>`;
        }

        tbody.innerHTML += `
            <tr class="cascade-item" style="animation-delay: ${0.2 + (idx * 0.05)}s" onclick="setSector('${sec.name}'); switchView('exec');">
                <td style="text-align:center;">${rankDisplay}</td>
                <td style="font-weight:600; color:var(--text-main)">${sec.name}</td>
                <td style="text-align:center"><span class="score-badge ${badgeClass}">${sec.score}</span></td>
                <td style="text-align:right; font-size:0.75rem; color:var(--text-muted)">
                   ${sec.punc}% Pontual • ${covText}
                </td>
            </tr>
        `;
    });

    // 3. Render Recurrent List (Reincidentes) - ORDENADO POR MESES (DESC)
    const recList = document.getElementById('man-recurrent-list');
    recList.innerHTML = '';

    // Ordenação aqui
    const sortedRecurrent = metrics.recurrentItems.sort((a, b) => b.consecutive - a.consecutive);

    if (sortedRecurrent.length === 0) {
        recList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted)">Nenhuma reincidência detectada.</div>';
    } else {
        sortedRecurrent.forEach((item, i) => {
            recList.innerHTML += `
                <div class="insight-item cascade-item" style="animation-delay: ${0.2 + (i * 0.1)}s" onclick="openMainModal(${item.id})">
                    <div class="ii-main">
                        <div class="ii-title">${item.name} <span class="badge-recurrent">${item.consecutive} Meses</span></div>
                        <div class="ii-sub">Setor: ${item.sector}</div>
                    </div>
                    <div class="ii-action">Ver <i data-lucide="arrow-right" size="14"></i></div>
                </div>
            `;
        });
    }

    // 4. Render Missing Analysis (Sem Análise)
    const missList = document.getElementById('man-missing-list');
    missList.innerHTML = '';

    if (metrics.missingAnalysisItems.length === 0) {
        missList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted)">Tudo em dia! Nenhuma pendência.</div>';
    } else {
        metrics.missingAnalysisItems.forEach((item, i) => {
            missList.innerHTML += `
                <div class="insight-item cascade-item" style="animation-delay: ${0.2 + (i * 0.1)}s" onclick="openAnalysisModal(${item.id}, ${item.monthIdx})">
                    <div class="ii-main">
                        <div class="ii-title">${item.name}</div>
                        <div class="ii-sub">Mês: ${months[item.monthIdx]} • <span style="color:var(--bad)">Sem Análise</span></div>
                    </div>
                    <div class="ii-action">Resolver <i data-lucide="edit-3" size="14"></i></div>
                </div>
            `;
        });
    }

    lucide.createIcons();
}

function calculateManagerialMetrics(data) {
    // Agrupamento por Setor
    const sectors = {};
    const recurrentItems = [];
    const missingAnalysisItems = [];

    let totalPlanos = 0;
    let totalMelhora = 0;
    let totalCriticosYear = 0;
    let totalAnalisesYear = 0;

    // Inicializa Setores
    data.forEach(item => {
        if (!sectors[item.sector]) {
            sectors[item.sector] = {
                name: item.sector,
                metaHits: 0, metaTotal: 0,
                puncHits: 0, puncTotal: 0,
                criticos: 0, analises: 0
            };
        }
    });

    data.forEach(item => {
        const sec = sectors[item.sector];
        let consecutiveBad = 0;

        // Loop Mensal
        for (let i = 0; i < 12; i++) {
            const val = item.data[i];
            const hasVal = (val !== null && val !== "" && val !== "NaN");

            // 1. Meta (Atingimento)
            if (hasVal) {
                sec.metaTotal++;
                const st = getStatus(val, item.meta, item.logic, item.format);

                if (st === 'good') {
                    sec.metaHits++;
                    consecutiveBad = 0; // Reset
                } else if (st === 'bad') {
                    sec.criticos++;
                    totalCriticosYear++;
                    consecutiveBad++;

                    // Check Missing Analysis
                    const ana = getAnalysis(item.id, currentYear, i);
                    if (ana) {
                        sec.analises++;
                        totalAnalisesYear++;

                        // Check Improvement (Eficácia)
                        // Olha o MÊS SEGUINTE (i+1) pra ver se melhorou
                        if (i < 11) { // Só se tiver mês seguinte
                            const nextVal = item.data[i + 1];
                            const hasNext = (nextVal !== null && nextVal !== "");
                            if (hasNext) {
                                totalPlanos++; // Tinha plano no mês i, e temos dado no i+1 para validar
                                if (checkImprovement(nextVal, val, item.logic)) {
                                    totalMelhora++;
                                }
                            }
                        }

                    } else {
                        // Está ruim e SEM análise
                        missingAnalysisItems.push({
                            id: item.id,
                            name: item.name,
                            monthIdx: i,
                            sector: item.sector
                        });
                    }
                } else {
                    consecutiveBad = 0;
                }
            }

            // 2. Pontualidade
            if (item.dates && item.dates[i] && hasVal) {
                sec.puncTotal++;
                if (checkOnTime(item.dates[i], i)) sec.puncHits++;
            }

            // 3. Reincidência Check
            if (consecutiveBad >= 2) {
                // Adiciona se já não tiver adicionado
                if (!recurrentItems.find(r => r.id === item.id)) {
                    recurrentItems.push({
                        id: item.id,
                        name: item.name,
                        sector: item.sector,
                        consecutive: consecutiveBad
                    });
                } else {
                    // Atualiza count se for maior
                    const r = recurrentItems.find(r => r.id === item.id);
                    if (consecutiveBad > r.consecutive) r.consecutive = consecutiveBad;
                }
            }
        }
    });

    // Calcula Scores Finais
    const sectorRanking = Object.values(sectors).map(s => {
        // % Metas
        const percMeta = s.metaTotal ? (s.metaHits / s.metaTotal) * 100 : 0;
        // % Pontualidade
        const percPunc = s.puncTotal ? (s.puncHits / s.puncTotal) * 100 : 0;

        // % Cobertura (Analises / Críticos)
        let percCob = null; // Default to null (N/A)
        let score = 0;

        if (s.criticos > 0) {
            percCob = (s.analises / s.criticos) * 100;
            // 40% Resultado + 30% Disciplina + 30% Gestão
            score = Math.round((percMeta * 0.4) + (percPunc * 0.3) + (percCob * 0.3));
        } else {
            // Se não teve críticos, a Cobertura (Gestão) não entra na conta para não inflar artificialmente
            // Apenas re-normalizamos os outros 70% (40 Performance + 30 Pontualidade) para valerem 100%
            score = Math.round(((percMeta * 0.4) + (percPunc * 0.3)) / 0.7);
        }

        return {
            name: s.name,
            score: score,
            punc: Math.round(percPunc),
            coverage: (percCob !== null) ? Math.round(percCob) : null,
            criticos: s.criticos // Passando para o renderizador saber
        };
    }).sort((a, b) => b.score - a.score);

    // Global Metrics
    const globalMaturity = sectorRanking.length
        ? Math.round(sectorRanking.reduce((acc, curr) => acc + curr.score, 0) / sectorRanking.length)
        : 0;

    const globalCoverage = totalCriticosYear
        ? Math.round((totalAnalisesYear / totalCriticosYear) * 100)
        : null; // Se não tem críticos, não tem cobertura (N/A)

    const globalEfficacy = totalPlanos
        ? Math.round((totalMelhora / totalPlanos) * 100)
        : 0;

    return {
        sectorRanking,
        recurrentItems,
        missingAnalysisItems,
        globalMaturity,
        totalCriticalCount: totalCriticosYear,
        globalCoverage,
        globalEfficacy
    };
}

function checkImprovement(curr, prev, logic) {
    if (!curr || !prev) return false;
    // Transforma para numero
    const c = parseFloat(String(curr).replace(',', '.'));
    const p = parseFloat(String(prev).replace(',', '.'));
    if (isNaN(c) || isNaN(p)) return false;

    if (logic === 'maior') return c > p;
    else return c < p;
}


function updateTableVisibility(start, end) {
    const table = document.getElementById('main-table');
    if (!table) return;

    // Header cells
    const ths = table.querySelectorAll('thead th');
    // Month columns are from index 2 to 13 (Indicador, Meta, Jan...)
    // Jan is 2 (0-indexed)
    for (let i = 0; i < 12; i++) {
        const colIdx = i + 2;
        if (ths[colIdx]) {
            ths[colIdx].style.display = (i >= start && i <= end) ? '' : 'none';
        }
    }

    // Body cells
    const rows = table.querySelectorAll('tbody tr:not(.empty-state)');
    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        // Check if it's a sector header (colspan)
        if (tds.length === 1 && tds[0].colSpan > 1) {
            // It's a header row
            const visibleMonths = (end - start + 1);
            tds[0].colSpan = 2 + visibleMonths;
        } else {
            // Data row
            for (let i = 0; i < 12; i++) {
                const colIdx = i + 2; // Data starts at index 2 (Name=0, Meta=1)
                if (tds[colIdx]) {
                    tds[colIdx].style.display = (i >= start && i <= end) ? '' : 'none';
                }
            }
        }
    });

    // Update KPI Labels respecting filter (top headers) - line 2696 in previous view
    const kpiPerf = document.getElementById('kpi-perf-label');
    if (kpiPerf && start !== 0 && end !== 11) {
        // Maybe change title? No need for now.
    }
}



// --- REDIRECIONAMENTO PARA O NOVO PAINEL NPS ---
function abrirPainelNPS() {
    // Abre o nps.html em uma nova aba
    window.open('nps.html', '_blank');
}
