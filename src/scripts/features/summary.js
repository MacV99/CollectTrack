/* summary.js — generado por refactor modular */
import { catStyle, fmtAmount } from '../lib/format.js';
import { state } from '../state.js';

/* ── SUMMARY ────────────────────────────────────────── */
function renderSumCards(map, targetId, metaFn) {
  document.getElementById(targetId).innerHTML =
    Object.entries(map).sort(([,a],[,b]) => b.total - a.total)
      .map(([cat, d]) => {
        const s = catStyle(cat === 'Sin categoría' ? null : cat);
        const lbl = cat.replace(/_/g, ' ');
        return `<div class="sum-card">
          <div class="sum-head">
            <span class="dot ${s.dot}" style="width:8px;height:8px;flex-shrink:0"></span>
            <span class="sum-name">${lbl}</span>
          </div>
          <div class="sum-total">${fmtAmount(d.total)}</div>
          <div class="sum-meta">${metaFn(d)}</div>
        </div>`;
      }).join('');
}

export function renderSummary() {
  const incMap = {};
  state.allData.forEach(r => {
    const key = r.category || 'Sin categoría';
    if (!incMap[key]) incMap[key] = { total: 0, count: 0, people: new Set() };
    incMap[key].total += r.amountNum;
    incMap[key].count++;
    incMap[key].people.add(r.name.trim().toLowerCase());
  });
  renderSumCards(incMap, 'summaryGrid', d =>
    `${d.people.size} persona${d.people.size !== 1 ? 's' : ''} · ${d.count} cobro${d.count !== 1 ? 's' : ''}`);

  const expMap = {};
  state.allExpenses.forEach(r => {
    const key = r.category || 'Sin categoría';
    if (!expMap[key]) expMap[key] = { total: 0, count: 0 };
    expMap[key].total += r.amountNum;
    expMap[key].count++;
  });
  renderSumCards(expMap, 'expSummaryGrid', d => `${d.count} pago${d.count !== 1 ? 's' : ''}`);
}
