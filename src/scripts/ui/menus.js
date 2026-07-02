/* menus.js — generado por refactor modular */
import { postData } from '../lib/api.js';
import { API_URL } from '../config.js';
import { loadData, refreshAll } from '../features/data.js';
import { currentPeriod } from '../lib/format.js';
import { showNotification } from './notify.js';
import { resolveRow, state } from '../state.js';
import { saveCache } from '../lib/storage.js';
import { buildRowMenu, ROW_MENU_ICONS } from './rowMenu.js';

export function payStatus(r) {
  if (r.paid && r.paid === currentPeriod()) return 'paid';
  const dueDay = parseInt(r.date, 10);
  const today  = new Date().getDate();
  if (dueDay && today > dueDay) return 'overdue';
  return 'pending';
}

export const PAY_META = {
  paid:    { label: 'Al día',    dot: '#4ade80' },
  pending: { label: 'Pendiente', dot: '#fbbf24' },
  overdue: { label: 'Atrasado',  dot: '#f87171' },
};

export function payCheckBtn(sheet, r) {
  const on = payStatus(r) === 'paid';
  return `<button class="btn-row check ${on ? 'on' : ''}" title="${on ? 'Marcar pendiente' : 'Marcar pagado'}" onclick="togglePaid('${sheet}',${r._row})">✓</button>`;
}

// Due-day shown as a calendar pill. Its color reflects the pay status, and
// hover/click reveals the status label ("Al día" / "Pendiente" / "Atrasado").
export function dayChip(r) {
  const st = payStatus(r), m = PAY_META[st];
  if (!r.date) return `<span style="color:var(--text-muted)">—</span>`;
  return `<span class="day-chip ${st}" onclick="toggleDayLabel(event)">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
    + `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>`
    + `<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${r.date}`
    + `<span class="day-tip">${m.label}</span></span>`;
}

// Muestra/oculta la etiqueta de estado al tocar la fecha (útil en móvil).
export function toggleDayLabel(e) {
  e.stopPropagation();
  const chip = e.currentTarget;
  const wasOpen = chip.classList.contains('show-tip');
  closeDayTips();
  if (!wasOpen) {
    chip.classList.add('show-tip');
    chip.closest('tr')?.classList.add('tip-open');
  }
}

export function closeDayTips() {
  document.querySelectorAll('.day-chip.show-tip').forEach(c => c.classList.remove('show-tip'));
  document.querySelectorAll('tr.tip-open').forEach(r => r.classList.remove('tip-open'));
}

// Edit + delete grouped behind a ⋮ kebab menu.
export function rowMenu(sheet, r) {
  return buildRowMenu([
    { onclick: `openEditModal('${sheet}',${r._row})`, icon: ROW_MENU_ICONS.pencil, label: 'Editar' },
    { onclick: `deleteRow('${sheet}',${r._row})`, icon: ROW_MENU_ICONS.trash, label: 'Eliminar', danger: true },
  ]);
}

export function toggleRowMenu(e) {
  e.stopPropagation();
  const menu = e.currentTarget.closest('.row-menu');
  const wasOpen = menu.classList.contains('open');
  document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
  if (!wasOpen) menu.classList.add('open');
}

// Close any open kebab menu on outside click / Escape.
document.addEventListener('click', () => {
  document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
  closeDayTips();
});

/* ── TOGGLE PAID ────────────────────────────────────── */
// Marca / desmarca un registro como pagado en el periodo actual.
// Optimista: actualiza local + caché, sincroniza PAID en la hoja vía GAS.
export function togglePaid(sheet, rowNum) {
  if (!API_URL) { showNotification('Configura API_URL primero', 'err'); return; }

  const { r, allArr, allIdx } = resolveRow(sheet, rowNum);
  if (!r) { showNotification('Actualiza antes de marcar', 'err'); return; }

  const period = currentPeriod();
  const newVal = (r.paid === period) ? '' : period;  // toggle

  allArr[allIdx] = { ...r, paid: newVal };
  saveCache(state.allData, state.allExpenses);
  refreshAll();

  postData({ action: 'setPaid', sheet, _row: r._row, PAID: newVal })
    .then(() => showNotification(newVal ? 'Marcado al día ✓' : 'Marcado pendiente'))
    .catch(err => { showNotification('Error: ' + err.message, 'err'); loadData(); });
}
