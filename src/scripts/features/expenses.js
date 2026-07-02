/* expenses.js — generado por refactor modular */
import { fmtAmount, normPeriod, parseAmount } from '../lib/format.js';
import { dayChip, payCheckBtn, payStatus, rowMenu } from '../ui/menus.js';
import { state } from '../state.js';

export function mapExpenseRow(r) {
  const amt = parseAmount(r['AMOUNT']);
  return {
    _row:      r._row,
    category:  String(r['CATEGORY'] || '').trim(),
    amountNum: amt,
    rawAmount: amt ? fmtAmount(amt) : '',
    date:      String(r['DATE']     || '').trim(),
    paid:      normPeriod(r['PAID']),
  };
}

/* ── EXPENSES FILTERS ───────────────────────────────── */
export function populateExpFilters() {
  const cats  = [...new Set(state.allExpenses.map(r => r.category).filter(Boolean))].sort();
  const dates = [...new Set(state.allExpenses.map(r => r.date).filter(Boolean))].sort((a, b) => +a - +b);

  document.getElementById('filterExpCategory').innerHTML =
    '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('filterExpDate').innerHTML =
    '<option value="">Todos los días</option>' +
    dates.map(d => `<option value="${d}">Día ${d}</option>`).join('');
}

export function applyExpFilters() {
  const cat    = document.getElementById('filterExpCategory').value;
  const date   = document.getElementById('filterExpDate').value;
  const status = document.getElementById('filterExpStatus').value;

  state.filteredExpenses = state.allExpenses.filter(r => {
    if (cat  && r.category !== cat)  return false;
    if (date && r.date !== date)     return false;
    if (status && payStatus(r) !== status) return false;
    return true;
  });

  if (state.sortExpCol) sortExpFiltered();
  else state.filteredExpenses.reverse();
  renderExpTable();
}

/* ── EXPENSES SORT ──────────────────────────────────── */
const SORT_EXP_COLS = ['category', 'amount', 'date'];

export function sortExpBy(col) {
  state.sortExpDir = (state.sortExpCol === col && state.sortExpDir === 'asc') ? 'desc' : 'asc';
  state.sortExpCol = col;

  SORT_EXP_COLS.forEach(c => {
    const arrow = document.getElementById(`esa-${c}`);
    if (arrow) arrow.textContent = c === col ? (state.sortExpDir === 'asc' ? '↑' : '↓') : '↕';
    const th = arrow && arrow.closest('th');
    if (th) th.classList.toggle('active', c === col);
  });

  sortExpFiltered();
  renderExpTable();
}

export function sortExpFiltered() {
  state.filteredExpenses.sort((a, b) => {
    let va, vb;
    switch (state.sortExpCol) {
      case 'amount':   va = a.amountNum;              vb = b.amountNum;              break;
      case 'date':     va = +a.date || 0;             vb = +b.date || 0;             break;
      case 'category': va = a.category.toLowerCase(); vb = b.category.toLowerCase(); break;
      default: return 0;
    }
    if (va < vb) return state.sortExpDir === 'asc' ? -1 : 1;
    if (va > vb) return state.sortExpDir === 'asc' ?  1 : -1;
    return 0;
  });
}

/* ── EXPENSES RENDER ────────────────────────────────── */
export function renderExpTable() {
  document.getElementById('expVisibleCount').textContent = state.filteredExpenses.length;
  document.getElementById('expTotalCount').textContent   = state.allExpenses.length;

  const tbody = document.getElementById('expTableBody');

  if (!state.filteredExpenses.length) {
    tbody.innerHTML = state.allExpenses.length
      ? '<tr class="state-row"><td colspan="4">No se encontraron pagos con esos filtros.</td></tr>'
      : '<tr class="state-row"><td colspan="4">No hay gastos registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = state.filteredExpenses.map((r, i) => {
    const catTitle = r.category ? r.category.replace(/_/g, ' ') : '—';
    const dateCell = dayChip(r);

    return `<tr data-status="${payStatus(r)}" style="animation-delay:${i * 35}ms">
      <td class="td-name" data-label="Categoría">${catTitle}</td>
      <td class="td-amount" data-label="Monto">${r.amountNum ? fmtAmount(r.amountNum) : '—'}</td>
      <td data-label="Día">${dateCell}</td>
      <td class="td-actions" data-label="Acciones">
        ${payCheckBtn('pagos', r)}
        ${rowMenu('pagos', r)}
      </td>
    </tr>`;
  }).join('');
}
