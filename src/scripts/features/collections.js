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

// En mobile la tabla colapsa a tarjetas y el thead (con el sort de Día) se
// oculta (ver project.css @media max-width:640px) — sin control de orden a
// la vista, el orden queda fijo: día ascendente.
const mobileQuery = window.matchMedia('(max-width: 640px)');

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

  if (mobileQuery.matches) {
    state.filteredData.sort((a, b) => (+a.date || 0) - (+b.date || 0));
  } else if (state.sortCol) {
    sortFiltered();
  } else {
    // Por defecto (sin columna elegida): último movimiento agregado primero.
    // state.allData/state.allExpenses están en orden de hoja (antiguos→nuevos, los nuevos
    // se agregan al final), así que invertir deja lo más reciente arriba.
    state.filteredData.reverse();
  }
  renderTable();
}

// Re-aplica el orden al cruzar el breakpoint (rotar el dispositivo, resize
// de ventana), para que "mobile = siempre por día" se cumpla sin recargar.
mobileQuery.addEventListener('change', applyFilters);

/* ── INCOME SORT ────────────────────────────────────── */
// Único orden disponible en Cobros: por día (el resto de columnas no se
// pueden ordenar, ver CobrosPanel.astro).
export function sortBy(col) {
  if (col !== 'date') return;
  state.sortDir = (state.sortCol === col && state.sortDir === 'asc') ? 'desc' : 'asc';
  state.sortCol = col;

  const arrow = document.getElementById('sa-date');
  if (arrow) {
    arrow.textContent = state.sortDir === 'asc' ? '↑' : '↓';
    arrow.closest('th').classList.add('active');
  }

  sortFiltered();
  renderTable();
}

export function sortFiltered() {
  if (state.sortCol !== 'date') return;
  state.filteredData.sort((a, b) => {
    const va = +a.date || 0, vb = +b.date || 0;
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
        ${payCheckBtn('cobros', r)}
        ${rowMenu('cobros', r)}
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
