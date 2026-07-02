/* ============================================================
   state.js — estado mutable compartido de la app.

   En ES modules un `let` exportado no se puede reasignar desde
   otro módulo. Por eso el estado vive en UN solo objeto: cada
   módulo lo importa y lee/escribe sus propiedades por referencia
   (`state.allData = ...`). Es la única fuente de verdad y evita
   imports circulares para compartir datos.
   ============================================================ */

export const state = {
  // ── Sesión / rol activo ('admin' | 'socio' | null) ──
  role: null,

  // ── MACV · Cobros ──
  allData: [],
  filteredData: [],
  sortCol: null,
  sortDir: 'asc',

  // ── MACV · Pagos ──
  allExpenses: [],
  filteredExpenses: [],
  sortExpCol: null,
  sortExpDir: 'asc',

  // ── Modal / borrado (MACV) ──
  modalSheet: null,   // 'cobros' | 'pagos'
  modalRow: null,      // _row (fila real en Sheets) del registro en edición, null = nuevo
  _pendingDelete: null,        // { sheet, row }
  _pendingMaciaDelete: null,

  // ── MACIA ──
  maciaTx: [],
  maciaAudit: [],
  maciaFiltered: [],
  maciaModalId: null,
  maciaSortCol: 'date',
  maciaSortDir: 'desc',

  // ── MACV · Deudas (préstamos ocasionales, solo local) ──
  debts: [],
  debtsFiltered: [],
  debtModalId: null,
  debtsSortCol: 'date',
  debtsSortDir: 'desc',
  _pendingDebtDelete: null,
};

// Resuelve un registro MACV a partir de su _row (fila real y estable en
// Sheets), junto con el arreglo completo y su índice ahí (para mutar/borrar
// en sitio). Se usa _row en vez de la posición en filteredData porque esa
// posición puede cambiar entre el render y el click (p. ej. cuando la carga
// en vivo llega después del render con caché) y dejaría la acción apuntando
// a la fila equivocada.
export function resolveRow(sheet, rowNum) {
  const allArr = sheet === 'cobros' ? state.allData : state.allExpenses;
  const r = rowNum != null ? allArr.find(x => x._row === rowNum) : undefined;
  return { r, allArr, allIdx: r ? allArr.indexOf(r) : -1 };
}
