/* collections.js — generado por refactor modular */
import { catStyle, fmtAmount, normPeriod, parseAmount } from '../lib/format.js';
import { dayChip, payCheckBtn, payStatus, rowMenu } from '../ui/menus.js';
import { state } from '../state.js';

export function mapIncomeRow(r) {
  const amt = parseAmount(r['AMOUNT']);
  return {
    _row:      r._row,
    name:      String(r['NAME']     || '').trim(),
    category:  String(r['CATEGORY'] || '').trim(),
    amountNum: amt,
    rawAmount: amt ? fmtAmount(amt) : '',
    date:      String(r['DATE']     || '').trim(),
    paid:      normPeriod(r['PAID']),
  };
}

/* ── INCOME FILTERS ─────────────────────────────────── */
export function populateFilters() {
  const cats  = [...new Set(state.allData.map(r => r.category).filter(Boolean))].sort();
  const dates = [...new Set(state.allData.map(r => r.date).filter(Boolean))].sort((a, b) => +a - +b);

  document.getElementById('filterCategory').innerHTML =
    '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}">${c.replace(/_/g, ' ')}</option>`).join('');

  document.getElementById('filterDate').innerHTML =
    '<option value="">Todos los días</option>' +
    dates.map(d => `<option value="${d}">Día ${d}</option>`).join('');
}

export function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const cat    = document.getElementById('filterCategory').value;
  const date   = document.getElementById('filterDate').value;
  const status = document.getElementById('filterStatus').value;

  state.filteredData = state.allData.filter(r => {
    if (search && !r.name.toLowerCase().includes(search)) return false;
    if (cat  && r.category !== cat)  return false;
    if (date && r.date !== date)     return false;
    if (status && payStatus(r) !== status) return false;
    return true;
  });

  // Por defecto (sin columna elegida): último movimiento agregado primero.
  // state.allData/state.allExpenses están en orden de hoja (antiguos→nuevos, los nuevos
  // se agregan al final), así que invertir deja lo más reciente arriba.
  if (state.sortCol) sortFiltered();
  else state.filteredData.reverse();
  renderTable();
}

/* ── INCOME SORT ────────────────────────────────────── */
const SORT_COLS = ['name', 'category', 'amount', 'date'];

export function sortBy(col) {
  state.sortDir = (state.sortCol === col && state.sortDir === 'asc') ? 'desc' : 'asc';
  state.sortCol = col;

  document.querySelectorAll('thead th').forEach((th, i) => {
    if (th.closest('#macv-sub-cobros')) th.classList.toggle('active', SORT_COLS[i] === col);
  });
  SORT_COLS.forEach(c => { const el = document.getElementById(`sa-${c}`); if (el) el.textContent = '↕'; });
  const arrow = document.getElementById(`sa-${col}`);
  if (arrow) arrow.textContent = state.sortDir === 'asc' ? '↑' : '↓';

  sortFiltered();
  renderTable();
}

export function sortFiltered() {
  state.filteredData.sort((a, b) => {
    let va, vb;
    switch (state.sortCol) {
      case 'amount':   va = a.amountNum;            vb = b.amountNum;            break;
      case 'date':     va = +a.date || 0;           vb = +b.date || 0;           break;
      case 'name':     va = a.name.toLowerCase();   vb = b.name.toLowerCase();   break;
      case 'category': va = a.category.toLowerCase(); vb = b.category.toLowerCase(); break;
      default: return 0;
    }
    if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

/* ── INCOME RENDER ──────────────────────────────────── */
export function renderTable() {
  document.getElementById('visibleCount').textContent = state.filteredData.length;
  document.getElementById('totalCount').textContent   = state.allData.length;

  const tbody = document.getElementById('tableBody');

  if (!state.filteredData.length) {
    tbody.innerHTML = '<tr class="state-row"><td colspan="5">No se encontraron cobros con esos filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = state.filteredData.map((r, i) => {
    const s        = catStyle(r.category);
    const catLabel = r.category ? r.category.replace(/_/g, ' ') : null;
    const catCell  = catLabel
      ? `<span class="badge ${s.badge}"><span class="dot ${s.dot}"></span>${catLabel}</span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    const dateCell = dayChip(r);

    return `<tr data-status="${payStatus(r)}" style="animation-delay:${i * 35}ms">
      <td class="td-name" data-label="Nombre">${r.name}</td>
      <td data-label="Día">${dateCell}</td>
      <td class="td-amount" data-label="Monto">${r.rawAmount || '—'}</td>
      <td data-label="Categoría">${catCell}</td>
      <td class="td-actions" data-label="Acciones">
        ${payCheckBtn('cobros', i, r)}
        ${rowMenu('cobros', i)}
      </td>
    </tr>`;
  }).join('');
}

/* ── KPI CARDS ──────────────────────────────────────── */
export function updateKPIs() {
  const totalIncome   = state.allData.reduce((s, r) => s + r.amountNum, 0);
  const totalExpenses = state.allExpenses.reduce((s, r) => s + r.amountNum, 0);
  const balance = totalIncome - totalExpenses;
  const people  = new Set(state.allData.map(r => r.name.trim().toLowerCase())).size;

  document.getElementById('kpiBalance').textContent  = (balance < 0 ? '-' : '') + fmtAmount(Math.abs(balance));
  document.getElementById('kpiTotal').textContent    = fmtAmount(totalIncome);
  document.getElementById('kpiExpenses').textContent = fmtAmount(totalExpenses);
  document.getElementById('kpiPeople').textContent   = people;

  const balCard = document.getElementById('kpiBalanceCard');
  balCard.classList.toggle('accent',   balance >= 0);
  balCard.classList.toggle('negative', balance < 0);
}
