/* data.js — generado por refactor modular */
import { fetchJSONP } from '../lib/api.js';
import { applyFilters, mapIncomeRow, populateFilters, updateKPIs } from './collections.js';
import { API_URL, CSV_URL, EXPENSES_URL } from '../config.js';
import { parseCsv } from '../lib/csv.js';
import { applyExpFilters, mapExpenseRow, populateExpFilters } from './expenses.js';
import { formatAgo } from '../lib/format.js';
import { loadMaciaFromGAS } from './macia.js';
import { setStatus } from '../ui/notify.js';
import { state } from '../state.js';
import { loadCache, saveCache } from '../lib/storage.js';
import { renderSummary } from './summary.js';

/* ── LOAD ───────────────────────────────────────────── */
export async function loadData() {
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('loading');
  document.getElementById('errorBar').style.display = 'none';

  const cached = loadCache();
  if (cached) {
    state.allData     = cached.income   || [];
    state.allExpenses = cached.expenses || [];
    refreshAll();
    setStatus('caché · ' + formatAgo(cached.ts), 'var(--text-muted)');
  } else {
    document.getElementById('tableBody').innerHTML =
      '<tr class="state-row"><td colspan="5"><span class="spinner"></span>Cargando datos…</td></tr>';
    document.getElementById('expTableBody').innerHTML =
      '<tr class="state-row"><td colspan="4"><span class="spinner"></span>Cargando datos…</td></tr>';
  }

  let incomeOk = false, expensesOk = false;

  if (API_URL) {
    // ── modo GAS (JSONP → lectura + escritura habilitada) ──
    const [incRes, expRes] = await Promise.allSettled([
      fetchJSONP(API_URL + '?sheet=cobros'),
      fetchJSONP(API_URL + '?sheet=pagos'),
    ]);

    if (incRes.status === 'fulfilled' && Array.isArray(incRes.value)) {
      state.allData   = incRes.value.filter(r => r['NAME']).map(mapIncomeRow);
      incomeOk  = true;
    }

    if (expRes.status === 'fulfilled' && Array.isArray(expRes.value)) {
      state.allExpenses  = expRes.value.filter(r => r['CATEGORY'] || r['AMOUNT']).map(mapExpenseRow);
      expensesOk   = true;
    }

  } else {
    // ── fallback CSV (solo lectura) ──────────────────────
    const [incRes, expRes] = await Promise.allSettled([
      fetch(CSV_URL),
      fetch(EXPENSES_URL),
    ]);

    try {
      if (incRes.status === 'fulfilled' && incRes.value.ok) {
        const text = await incRes.value.text();
        state.allData   = parseCsv(text).filter(r => r['NAME']).map(mapIncomeRow);
        incomeOk  = true;
      }
    } catch (e) { console.error('income csv:', e); }

    try {
      if (expRes.status === 'fulfilled' && expRes.value.ok) {
        const text = await expRes.value.text();
        state.allExpenses  = parseCsv(text).filter(r => r['CATEGORY'] || r['AMOUNT']).map(mapExpenseRow);
        expensesOk   = true;
      }
    } catch (e) { console.error('expenses csv:', e); }
  }

  if (incomeOk || expensesOk) {
    saveCache(state.allData, state.allExpenses);
    refreshAll();
    const t = new Date();
    setStatus('actualizado ' + t.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
  } else if (!cached) {
    document.getElementById('errorBar').style.display = 'block';
    document.getElementById('tableBody').innerHTML =
      '<tr class="state-row"><td colspan="5">No se pudieron cargar los datos.</td></tr>';
    document.getElementById('expTableBody').innerHTML =
      '<tr class="state-row"><td colspan="4">No se pudieron cargar los datos.</td></tr>';
  } else {
    setStatus('sin conexión', '#f87171');
  }

  loadMaciaFromGAS();
  btn.classList.remove('loading');
}

export function refreshAll() {
  populateFilters();
  applyFilters();
  populateExpFilters();
  applyExpFilters();
  updateKPIs();
  renderSummary();
}
