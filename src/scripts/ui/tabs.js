/* tabs.js — generado por refactor modular */
import { renderMaciaAudit } from '../features/macia.js';

/* ── TABS ───────────────────────────────────────────── */
// Grupos de nivel superior: MACV (cobros/pagos) · MACIA (movimientos/auditoría).
export function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Cada grupo trae sus propios KPIs dentro de su vista, así que basta con
  // alternar la vista activa (estructura idéntica a la de MACIA).
  document.getElementById('view-macv').classList.toggle('active',  tab === 'macv');
  document.getElementById('view-macia').classList.toggle('active', tab === 'macia');
  try { localStorage.setItem('ct_active_tab', tab); } catch {}
}

// Sub-pestañas dentro de MACV.
export function switchMacvSubtab(sub) {
  document.querySelectorAll('.macv-subtab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.subtab === sub));
  document.getElementById('macv-sub-cobros').classList.toggle('active', sub === 'cobros');
  document.getElementById('macv-sub-pagos').classList.toggle('active',  sub === 'pagos');
  document.getElementById('macv-sub-deudas').classList.toggle('active', sub === 'deudas');
  try { localStorage.setItem('ct_macv_subtab', sub); } catch {}
}

// Restaura el último grupo / sub-pestaña usados (persisten entre recargas).
export function restoreTabs() {
  let tab = 'macv', macv = 'cobros', macia = 'movimientos';
  try {
    tab   = localStorage.getItem('ct_active_tab')  || tab;
    macv  = localStorage.getItem('ct_macv_subtab') || macv;
    macia = localStorage.getItem('ct_macia_subtab') || macia;
  } catch {}
  switchMacvSubtab(macv);
  switchMaciaSubtab(macia);
  switchTab(tab);
}

/* ── SUBTABS ──────────────────────────────────────────── */
export function switchMaciaSubtab(sub) {
  document.querySelectorAll('.macia-subtab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.subtab === sub));
  document.querySelectorAll('.macia-subview').forEach(v => v.classList.remove('active'));
  document.getElementById(`macia-sub-${sub}`).classList.add('active');
  if (sub === 'auditoria') renderMaciaAudit();
  try { localStorage.setItem('ct_macia_subtab', sub); } catch {}
}
