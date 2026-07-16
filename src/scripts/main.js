/* main.js — entrypoint: imports, init, shim de compatibilidad */
import { applyFilters, sortBy } from './features/collections.js';
import { setupCombo } from './ui/combo.js';
import { loadData } from './features/data.js';
import { applyExpFilters, sortExpBy } from './features/expenses.js';
import { fmtAmountInput } from './lib/format.js';
import { applyMaciaFilters, balanceSync, cargaInicialMacia, closeBalanceModal, closeMaciaModal, closeRepartoModal, deleteMaciaTx, importMaciaCsv, loadMaciaFromGAS, loadMaciaStorage, openBalanceModal, openMaciaModal, openRepartoModal, refreshMacia, registrarReparto, segSet, sortMaciaBy, submitBalance, submitMaciaModal } from './features/macia.js';
import { applyDebtFilters, closeDebtModal, deleteDebt, initDebts, openDebtModal, segSetDebt, sortDebtsBy, submitDebtModal, toggleDebtStatus } from './features/debts.js';
import { toggleDayLabel, togglePaid, toggleRowMenu } from './ui/menus.js';
import { closeConfirm, closeModal, confirmDeleteExecute, deleteRow, openCreateModal, openEditModal, submitModal } from './features/modal.js';
import { state } from './state.js';
import { loadTags, mergeTags } from './lib/storage.js';
import { restoreTabs, switchMacvSubtab, switchTab } from './ui/tabs.js';
import { authLogin, initAuth, logout } from './features/auth.js';

/* ── INIT MACIA ───────────────────────────────────────── */
loadMaciaStorage();
refreshMacia();
loadMaciaFromGAS().then(() => cargaInicialMacia());

/* ── INIT DEUDAS (caché local + sync con hoja "deudas") ─ */
initDebts();

/* ── SERVICE WORKER ─────────────────────────────────── */
// El registro del SW lo inyecta @vite-pwa/astro en el build (autoUpdate).

/* ── COMBOS CREABLES ──────────────────────────────────── */
// Concepto (MACIA): opciones = conceptos ya usados + etiquetas guardadas.
setupCombo('mfConcept',
  () => mergeTags(state.maciaTx.map(t => t.concept), loadTags('ct_tags_concept')),
  'ct_tags_concept');

// Categoría (cobros/pagos): la fuente y el almacén dependen del sheet activo.
setupCombo('fCategory',
  () => state.modalSheet === 'pagos'
    ? mergeTags(state.allExpenses.map(r => r.category), loadTags('ct_tags_cat_pagos'))
    : mergeTags(state.allData.map(r => r.category),     loadTags('ct_tags_cat_cobros')),
  () => state.modalSheet === 'pagos' ? 'ct_tags_cat_pagos' : 'ct_tags_cat_cobros');

/* ── SHIM DE COMPATIBILIDAD (handlers inline) ─────────
   Este archivo es un ES module: sus funciones NO son globales.
   El markup de index.html (y el HTML que generan los render) usa
   handlers inline `onclick="fn(...)"`, que se resuelven contra `window`.
   Reexponemos aquí solo las funciones invocadas desde HTML.
   → Punto natural a desmontar si se migra a event delegation. */
Object.assign(window, {
  switchTab, switchMacvSubtab,
  sortBy, sortExpBy, sortMaciaBy,
  applyFilters, applyExpFilters, applyMaciaFilters,
  segSet,
  openCreateModal, openEditModal, closeModal, submitModal, deleteRow,
  confirmDeleteExecute, closeConfirm,
  togglePaid, toggleDayLabel, toggleRowMenu,
  openMaciaModal, submitMaciaModal, closeMaciaModal, deleteMaciaTx,
  registrarReparto, openRepartoModal, closeRepartoModal,
  openBalanceModal, closeBalanceModal, balanceSync, submitBalance,
  fmtAmountInput, importMaciaCsv, loadData,
  applyDebtFilters, sortDebtsBy, segSetDebt,
  openDebtModal, submitDebtModal, closeDebtModal, deleteDebt, toggleDebtStatus,
  authLogin, logout,
});

/* ── INIT ───────────────────────────────────────────── */
restoreTabs();
loadData();
initAuth();   // aplica rol guardado o muestra el login (fuerza MACIA si es socio)
