/* modal.js — generado por refactor modular */
import { postData } from '../lib/api.js';
import { API_URL } from '../config.js';
import { loadData, refreshAll } from './data.js';
import { fmtAmount } from '../lib/format.js';
import { closeMaciaModal, loadMaciaFromGAS, refreshMacia, saveMacia } from './macia.js';
import { loadDebtsFromGAS, refreshDebts, saveDebts } from './debts.js';
import { closeDayTips } from '../ui/menus.js';
import { showNotification } from '../ui/notify.js';
import { resolveRow, state } from '../state.js';
import { saveCache, saveTag } from '../lib/storage.js';

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
  closeDayTips();
  closeModal();
  closeConfirm();
  closeMaciaModal();
});

/* ── MODAL ──────────────────────────────────────────── */
export function openCreateModal(sheet) {
  if (!API_URL) { showNotification('Configura API_URL primero', 'err'); return; }
  state.modalSheet = sheet;
  state.modalRow = null;
  document.getElementById('modalTitle').textContent      = sheet === 'cobros' ? 'Nuevo cobro' : 'Nuevo pago';
  document.getElementById('fieldName').style.display     = sheet === 'cobros' ? '' : 'none';
  document.getElementById('fName').value                 = '';
  document.getElementById('fCategory').value             = '';
  document.getElementById('fAmount').value               = '';
  document.getElementById('fDate').value                 = '';
  document.getElementById('btnSave').disabled            = false;
  document.getElementById('btnSave').textContent         = 'Guardar';
  _showModal();
}

export function openEditModal(sheet, rowNum) {
  if (!API_URL) { showNotification('Configura API_URL primero', 'err'); return; }
  const { r } = resolveRow(sheet, rowNum);
  if (!r) { showNotification('Actualiza antes de editar', 'err'); return; }
  state.modalSheet = sheet;
  state.modalRow = rowNum;
  document.getElementById('modalTitle').textContent      = sheet === 'cobros' ? 'Editar cobro' : 'Editar pago';
  document.getElementById('fieldName').style.display     = sheet === 'cobros' ? '' : 'none';
  if (sheet === 'cobros') document.getElementById('fName').value = r.name || '';
  document.getElementById('fCategory').value             = r.category || '';
  document.getElementById('fAmount').value               = r.amountNum ? r.amountNum.toLocaleString('es-CO') : '';
  document.getElementById('fDate').value                 = r.date || '';
  document.getElementById('btnSave').disabled            = false;
  document.getElementById('btnSave').textContent         = 'Guardar';
  _showModal();
}

function _showModal() {
  document.getElementById('modalBackdrop').style.display = 'block';
  document.getElementById('modal').style.display         = 'flex';
  setTimeout(() => {
    const first = state.modalSheet === 'cobros'
      ? document.getElementById('fName')
      : document.getElementById('fCategory');
    first.focus();
  }, 50);
}

export function closeModal() {
  document.getElementById('modalBackdrop').style.display = 'none';
  document.getElementById('modal').style.display         = 'none';
}

export async function submitModal() {
  const name     = document.getElementById('fName').value.trim();
  const category = document.getElementById('fCategory').value.trim();
  const amount   = parseFloat(document.getElementById('fAmount').value.replace(/\./g, '')) || 0;
  const date     = document.getElementById('fDate').value.trim();

  if (state.modalSheet === 'cobros' && !name) { showNotification('Nombre requerido', 'err'); return; }
  if (!amount)                          { showNotification('Monto requerido', 'err');  return; }

  // La categoría usada queda registrada como etiqueta reutilizable.
  if (category) saveTag(state.modalSheet === 'pagos' ? 'ct_tags_cat_pagos' : 'ct_tags_cat_cobros', category);

  const btn = document.getElementById('btnSave');
  btn.disabled    = true;
  btn.textContent = 'Guardando…';

  if (state.modalRow === null) {
    // ── CREATE ───────────────────────────────────────
    const newItem = state.modalSheet === 'cobros'
      ? { _row: null, name, category, amountNum: amount, rawAmount: fmtAmount(amount), date, paid: '' }
      : { _row: null, category, amountNum: amount, rawAmount: fmtAmount(amount), date, paid: '' };

    if (state.modalSheet === 'cobros') state.allData.push(newItem);
    else                          state.allExpenses.push(newItem);

    saveCache(state.allData, state.allExpenses);
    refreshAll();
    closeModal();

    const payload = { action: 'create', sheet: state.modalSheet };
    Object.assign(payload, state.modalSheet === 'cobros'
      ? { NAME: name, CATEGORY: category, AMOUNT: amount, DATE: date }
      : { CATEGORY: category, AMOUNT: amount, DATE: date });

    postData(payload)
      .then(() => { showNotification('Guardado ✓'); loadData(); })
      .catch(err => { showNotification('Error: ' + err.message, 'err'); loadData(); });

  } else {
    // ── UPDATE ───────────────────────────────────────
    const { r, allArr, allIdx } = resolveRow(state.modalSheet, state.modalRow);
    if (!r) { showNotification('Actualiza antes de guardar', 'err'); closeModal(); return; }

    const updated = state.modalSheet === 'cobros'
      ? { ...r, name, category, amountNum: amount, rawAmount: fmtAmount(amount), date }
      : { ...r, category, amountNum: amount, rawAmount: fmtAmount(amount), date };

    allArr[allIdx] = updated;
    saveCache(state.allData, state.allExpenses);
    refreshAll();
    closeModal();

    const payload = { action: 'update', sheet: state.modalSheet, _row: r._row };
    Object.assign(payload, state.modalSheet === 'cobros'
      ? { NAME: name, CATEGORY: category, AMOUNT: amount, DATE: date }
      : { CATEGORY: category, AMOUNT: amount, DATE: date });

    postData(payload)
      .then(() => showNotification('Actualizado ✓'))
      .catch(err => { showNotification('Error: ' + err.message, 'err'); loadData(); });
  }
}

export function deleteRow(sheet, rowNum) {
  if (!API_URL) { showNotification('Configura API_URL primero', 'err'); return; }
  const { r } = resolveRow(sheet, rowNum);
  if (!r) { showNotification('Actualiza antes de eliminar', 'err'); return; }
  const label = sheet === 'cobros'
    ? (r.name || 'este cobro')
    : (r.category || 'este pago');
  document.getElementById('confirmMsg').innerHTML =
    `¿Eliminar <b style="color:var(--text)">${label}</b>?<br><span style="color:var(--text-muted);font-size:11px">Esta acción no se puede deshacer.</span>`;
  state._pendingDelete = { sheet, row: rowNum };
  document.getElementById('confirmBackdrop').style.display = 'block';
  document.getElementById('confirmModal').style.display    = 'flex';
}

export function closeConfirm() {
  document.getElementById('confirmBackdrop').style.display = 'none';
  document.getElementById('confirmModal').style.display    = 'none';
  state._pendingDelete      = null;
  state._pendingMaciaDelete = null;
  state._pendingDebtDelete  = null;
}

export function confirmDeleteExecute() {
  if (state._pendingDebtDelete !== null) {
    const { id, row } = state._pendingDebtDelete;
    closeConfirm();
    state.debts = state.debts.filter(x => x.id !== id);
    saveDebts();
    refreshDebts();
    if (API_URL && row) {
      postData({ action: 'delete', sheet: 'deudas', _row: row })
        .then(() => showNotification('Eliminado ✓'))
        .catch(err => { showNotification('Error: ' + err.message, 'err'); loadDebtsFromGAS(); });
    } else {
      showNotification('Eliminado ✓');
    }
    return;
  }
  if (state._pendingMaciaDelete !== null) {
    const { id, row } = state._pendingMaciaDelete;
    closeConfirm();
    state.maciaTx = state.maciaTx.filter(x => x.id !== id);
    saveMacia();
    refreshMacia();
    if (API_URL && row) {
      postData({ action: 'delete', sheet: 'macia', _row: row })
        .then(() => showNotification('Eliminado ✓'))
        .catch(err => { showNotification('Error: ' + err.message, 'err'); loadMaciaFromGAS(); });
    } else {
      showNotification('Eliminado ✓');
    }
    return;
  }
  if (!state._pendingDelete) return;
  const { sheet, row } = state._pendingDelete;
  closeConfirm();

  const { r, allArr, allIdx } = resolveRow(sheet, row);
  if (!r) { showNotification('Actualiza antes de eliminar', 'err'); return; }
  const rowNum = r._row;

  allArr.splice(allIdx, 1);
  saveCache(state.allData, state.allExpenses);
  refreshAll();

  postData({ action: 'delete', sheet, _row: rowNum })
    .then(() => showNotification('Eliminado ✓'))
    .catch(err => { showNotification('Error: ' + err.message, 'err'); loadData(); });
}
