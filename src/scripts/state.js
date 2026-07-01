/* ============================================================
   state.js — estado mutable compartido de la app.

   En ES modules un `let` exportado no se puede reasignar desde
   otro módulo. Por eso el estado vive en UN solo objeto: cada
   módulo lo importa y lee/escribe sus propiedades por referencia
   (`state.allData = ...`). Es la única fuente de verdad y evita
   imports circulares para compartir datos.
   ============================================================ */

export const state = {
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
  modalIndex: null,   // índice en filteredData/filteredExpenses, null = nuevo
  _pendingDelete: null,        // { sheet, index }
  _pendingMaciaDelete: null,

  // ── MACIA ──
  maciaTx: [],
  maciaAudit: [],
  maciaFiltered: [],
  maciaModalId: null,
  maciaSortCol: 'date',
  maciaSortDir: 'desc',
};

// Resuelve un registro MACV a partir de su índice en el arreglo filtrado,
// junto con el arreglo completo y su índice ahí (para mutar/borrar en sitio).
export function resolveRow(sheet, index) {
  const filteredArr = sheet === 'cobros' ? state.filteredData : state.filteredExpenses;
  const allArr      = sheet === 'cobros' ? state.allData      : state.allExpenses;
  const r = filteredArr[index];
  return { r, allArr, allIdx: r ? allArr.indexOf(r) : -1 };
}
