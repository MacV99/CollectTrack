/* debts.js — MACV · Deudas: préstamos ocasionales entre personas.
   No es un sheet fijo como cobros/pagos: vive solo en localStorage,
   sin sincronización con Apps Script. */
import { fmtAmount } from '../lib/format.js';
import { showNotification } from '../ui/notify.js';
import { buildRowMenu, ROW_MENU_ICONS } from '../ui/rowMenu.js';
import { state } from '../state.js';

export const DEBTS_KEY = 'ct_debts_v1';

function debtUuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ── STORAGE (solo local) ─────────────────────────────── */
export function saveDebts() {
  try { localStorage.setItem(DEBTS_KEY, JSON.stringify(state.debts)); } catch {}
}

export function loadDebtsStorage() {
  try {
    const raw = localStorage.getItem(DEBTS_KEY);
    state.debts = raw ? JSON.parse(raw) : [];
  } catch { state.debts = []; }
}

/* ── KPIs ─────────────────────────────────────────────── */
export function updateDebtsKPIs() {
  let owedToMe = 0, iOwe = 0;
  state.debts.forEach(d => {
    if (d.status === 'pagada') return;
    if (d.type === 'me_deben') owedToMe += d.amount; else iOwe += d.amount;
  });
  const balance = owedToMe - iOwe;

  document.getElementById('debtsKpiOwed').textContent    = fmtAmount(owedToMe);
  document.getElementById('debtsKpiOwe').textContent     = fmtAmount(iOwe);
  document.getElementById('debtsKpiBalance').textContent = (balance < 0 ? '-' : '') + fmtAmount(Math.abs(balance));

  const card = document.getElementById('debtsKpiBalanceCard');
  card.classList.toggle('accent',   balance >= 0);
  card.classList.toggle('negative', balance < 0);
}

/* ── FILTERS ──────────────────────────────────────────── */
export function applyDebtFilters() {
  const type   = document.getElementById('debtFilterType').value;
  const status = document.getElementById('debtFilterStatus').value;
  const search = document.getElementById('debtFilterSearch').value.toLowerCase().trim();

  state.debtsFiltered = state.debts.filter(d => {
    if (type   && d.type   !== type)   return false;
    if (status && d.status !== status) return false;
    if (search && !d.person.toLowerCase().includes(search)
        && !(d.note || '').toLowerCase().includes(search)) return false;
    return true;
  });

  sortDebtsFiltered();
  renderDebtsTable();
}

/* ── SORT ─────────────────────────────────────────────── */
export function sortDebtsBy(col) {
  state.debtsSortDir = (state.debtsSortCol === col && state.debtsSortDir === 'asc') ? 'desc' : 'asc';
  state.debtsSortCol = col;
  ['date', 'person', 'amount'].forEach(c => {
    const el = document.getElementById(`dsa-${c}`);
    if (el) {
      el.textContent = c === col ? (state.debtsSortDir === 'asc' ? '↑' : '↓') : '↕';
      el.closest('th').classList.toggle('active', c === col);
    }
  });
  sortDebtsFiltered();
  renderDebtsTable();
}

export function sortDebtsFiltered() {
  state.debtsFiltered.sort((a, b) => {
    let va, vb;
    switch (state.debtsSortCol) {
      case 'amount': va = a.amount;               vb = b.amount;               break;
      case 'person': va = a.person.toLowerCase(); vb = b.person.toLowerCase(); break;
      default:       va = a.date || '';           vb = b.date || '';           break;
    }
    if (va < vb) return state.debtsSortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.debtsSortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

/* ── RENDER ───────────────────────────────────────────── */
// El color/badge de "tipo" reutiliza la paleta ingreso/egreso de MACIA:
// "me deben" es dinero a favor (verde), "yo debo" es dinero en contra (rojo).
const TYPE_META = {
  me_deben: { label: 'Me deben', badge: 'badge-ingreso', dot: 'dot-ingreso' },
  yo_debo:  { label: 'Yo debo',  badge: 'badge-egreso',  dot: 'dot-egreso' },
};

const STATUS_META = {
  pendiente: { label: 'Pendiente', badge: 'badge-pendiente', dot: 'dot-pendiente' },
  pagada:    { label: 'Pagada',    badge: 'badge-pagada',    dot: 'dot-pagada' },
};

export function renderDebtsTable() {
  document.getElementById('debtsVisibleCount').textContent = state.debtsFiltered.length;
  document.getElementById('debtsTotalCount').textContent   = state.debts.length;

  const tbody = document.getElementById('debtsTableBody');
  if (!state.debtsFiltered.length) {
    tbody.innerHTML = state.debts.length
      ? '<tr class="state-row"><td colspan="7">No hay deudas con esos filtros.</td></tr>'
      : '<tr class="state-row"><td colspan="7">No hay deudas registradas. Agrega una con el botón +</td></tr>';
    return;
  }

  tbody.innerHTML = state.debtsFiltered.map((d, i) => {
    const tm = TYPE_META[d.type] || TYPE_META.me_deben;
    const sm = STATUS_META[d.status] || STATUS_META.pendiente;
    const amtColor = d.type === 'me_deben' ? '#4ade80' : '#f87171';
    const amtSign  = d.type === 'me_deben' ? '+' : '−';
    const rawNote  = d.note || '';
    const note = rawNote.length > 45
      ? `<span title="${rawNote}">${rawNote.slice(0, 45)}…</span>`
      : (rawNote || '<span style="color:var(--text-muted)">—</span>');
    const paid = d.status === 'pagada';

    return `<tr data-status="${d.status}" style="animation-delay:${i * 30}ms${paid ? ';opacity:.7' : ''}">
      <td style="white-space:nowrap;font-size:12px" data-label="Fecha">${d.date || '—'}</td>
      <td class="td-name" data-label="Persona" style="font-size:13px">${d.person || '—'}</td>
      <td class="td-amount" data-label="Monto" style="color:${amtColor}">${amtSign}${fmtAmount(d.amount)}</td>
      <td data-label="Tipo"><span class="badge ${tm.badge}"><span class="dot ${tm.dot}"></span>${tm.label}</span></td>
      <td data-label="Estado"><span class="badge ${sm.badge}"><span class="dot ${sm.dot}"></span>${sm.label}</span></td>
      <td style="font-size:11px;color:var(--text-muted);max-width:180px" data-label="Nota">${note}</td>
      <td class="td-actions" data-label="Acciones">
        <button class="btn-row check ${paid ? 'on' : ''}" title="${paid ? 'Marcar pendiente' : 'Marcar pagada'}" onclick="toggleDebtStatus('${d.id}')">✓</button>
        ${debtRowMenu(d.id)}
      </td>
    </tr>`;
  }).join('');
}

function debtRowMenu(id) {
  return buildRowMenu([
    { onclick: `openDebtModal('${id}')`, icon: ROW_MENU_ICONS.pencil, label: 'Editar' },
    { onclick: `deleteDebt('${id}')`, icon: ROW_MENU_ICONS.trash, label: 'Eliminar', danger: true },
  ]);
}

/* ── TOGGLE ESTADO (pendiente ↔ pagada) ──────────────── */
export function toggleDebtStatus(id) {
  const idx = state.debts.findIndex(d => d.id === id);
  if (idx < 0) return;
  const d = state.debts[idx];
  const newStatus = d.status === 'pagada' ? 'pendiente' : 'pagada';
  state.debts[idx] = { ...d, status: newStatus };
  saveDebts();
  refreshDebts();
  showNotification(newStatus === 'pagada' ? 'Marcada como pagada ✓' : 'Marcada pendiente');
}

/* ── MODAL ────────────────────────────────────────────── */
export function openDebtModal(id) {
  state.debtModalId = id || null;
  if (id) {
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    document.getElementById('debtModalTitle').textContent = 'Editar deuda';
    document.getElementById('dfPerson').value = d.person;
    document.getElementById('dfDate').value   = d.date;
    document.getElementById('dfAmount').value = d.amount ? d.amount.toLocaleString('es-CO') : '';
    segSetDebtValue(d.type || 'me_deben');
    document.getElementById('dfNote').value   = d.note || '';
  } else {
    document.getElementById('debtModalTitle').textContent = 'Nueva deuda';
    document.getElementById('dfPerson').value = '';
    document.getElementById('dfDate').value   = new Date().toISOString().slice(0, 10);
    document.getElementById('dfAmount').value = '';
    segSetDebtValue('me_deben');
    document.getElementById('dfNote').value   = '';
  }
  document.getElementById('debtBtnSave').disabled       = false;
  document.getElementById('debtBackdrop').style.display = 'block';
  document.getElementById('debtModal').style.display    = 'flex';
}

// Control segmentado tipo (Me deben / Yo debo), mismo patrón que MACIA.
export function segSetDebt(btn) {
  const seg = btn.closest('.seg');
  seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
  const hidden = document.getElementById(seg.dataset.input);
  if (hidden) hidden.value = btn.dataset.val;
}

function segSetDebtValue(val) {
  const btn = document.querySelector(`#segDebtType .seg-btn[data-val="${val}"]`);
  if (btn) segSetDebt(btn);
}

export function closeDebtModal() {
  document.getElementById('debtBackdrop').style.display = 'none';
  document.getElementById('debtModal').style.display    = 'none';
}

export function submitDebtModal() {
  const person = document.getElementById('dfPerson').value.trim();
  const date   = document.getElementById('dfDate').value.trim();
  const amount = parseFloat(document.getElementById('dfAmount').value.replace(/\./g, '')) || 0;
  const type   = document.getElementById('dfType').value;
  const note   = document.getElementById('dfNote').value.trim();

  if (!person) { showNotification('Nombre requerido', 'err'); return; }
  if (!amount) { showNotification('Monto requerido',  'err'); return; }
  if (!date)   { showNotification('Fecha requerida',  'err'); return; }

  if (state.debtModalId) {
    const idx = state.debts.findIndex(x => x.id === state.debtModalId);
    if (idx < 0) return;
    const d = state.debts[idx];
    state.debts[idx] = { ...d, person, date, amount, type, note };
    showNotification('Actualizado ✓');
  } else {
    const id = debtUuid(), createdAt = new Date().toISOString();
    state.debts.unshift({ id, person, date, amount, type, note, status: 'pendiente', createdAt });
    showNotification('Guardado ✓');
  }
  saveDebts();
  refreshDebts();
  closeDebtModal();
}

/* ── DELETE ───────────────────────────────────────────── */
export function deleteDebt(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  document.getElementById('confirmMsg').innerHTML =
    `¿Eliminar la deuda de <b style="color:var(--text)">${d.person}</b>?<br>` +
    `<span style="color:var(--text-muted);font-size:11px">Esta acción no se puede deshacer.</span>`;
  state._pendingDebtDelete = { id };
  document.getElementById('confirmBackdrop').style.display = 'block';
  document.getElementById('confirmModal').style.display    = 'flex';
}

/* ── REFRESH ──────────────────────────────────────────── */
export function refreshDebts() {
  updateDebtsKPIs();
  applyDebtFilters();
}
