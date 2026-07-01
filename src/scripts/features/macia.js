/* macia.js — generado por refactor modular */
import { fetchJSONP, postData } from '../lib/api.js';
import { API_URL } from '../config.js';
import { parseCsv } from '../lib/csv.js';
import { fmtAmount, normMaciaDate, parseAmount } from '../lib/format.js';
import { showNotification } from '../ui/notify.js';
import { buildRowMenu, ROW_MENU_ICONS } from '../ui/rowMenu.js';
import { state } from '../state.js';
import { saveTag } from '../lib/storage.js';

export function mapMaciaRow(r) {
  return {
    _row:         r._row,
    id:           String(r['ID']           || '').trim() || maciaUuid(),
    date:         normMaciaDate(r['DATE']),
    concept:      String(r['CONCEPT']      || '').trim(),
    amount:       parseAmount(r['AMOUNT']),
    type:         String(r['TYPE']         || 'ingreso').trim().toLowerCase(),
    account:      String(r['ACCOUNT']      || 'nu').trim().toLowerCase(),
    observations: String(r['OBSERVATIONS'] || '').trim(),
    createdAt:    String(r['CREATED_AT']   || '').trim(),
  };
}

export function mapMaciaAuditRow(r) {
  return {
    _row:   r._row,
    id:     String(r['ID']        || '').trim(),
    action: String(r['ACTION']    || '').trim(),
    detail: String(r['DETAIL']    || '').trim(),
    ts:     String(r['TIMESTAMP'] || '').trim(),
  };
}

/* ═══════════════════════════════════════════════════════
   MACIA — Finanzas del emprendimiento
   ═══════════════════════════════════════════════════════ */
export const MACIA_KEY       = 'macia_v1';

export const MACIA_AUDIT_KEY = 'macia_audit_v1';

export const MACIA_AUDIT_MAX = 500;

/* ── HELPERS ──────────────────────────────────────────── */
export function maciaUuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ── STORAGE (caché local) ────────────────────────────── */
export function saveMacia() {
  try {
    localStorage.setItem(MACIA_KEY,       JSON.stringify(state.maciaTx));
    localStorage.setItem(MACIA_AUDIT_KEY, JSON.stringify(state.maciaAudit));
  } catch {}
}

export function loadMaciaStorage() {
  try {
    const tx    = localStorage.getItem(MACIA_KEY);
    const audit = localStorage.getItem(MACIA_AUDIT_KEY);
    state.maciaTx    = tx    ? JSON.parse(tx)    : [];
    state.maciaAudit = audit ? JSON.parse(audit) : [];
  } catch { state.maciaTx = []; state.maciaAudit = []; }
}

/* ── CARGA DESDE GAS ──────────────────────────────────── */
export async function loadMaciaFromGAS() {
  if (!API_URL) return;
  try {
    const [txRes, auditRes] = await Promise.allSettled([
      fetchJSONP(API_URL + '?sheet=macia'),
      fetchJSONP(API_URL + '?sheet=macia_audit'),
    ]);
    if (txRes.status === 'fulfilled' && Array.isArray(txRes.value)) {
      state.maciaTx = txRes.value.filter(r => r['AMOUNT']).map(mapMaciaRow);
    }
    if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value)) {
      state.maciaAudit = auditRes.value.filter(r => r['ACTION']).map(mapMaciaAuditRow);
    }
    saveMacia();
    refreshMacia();
  } catch (err) { console.error('loadMaciaFromGAS:', err); }
}

/* ── AUDIT ────────────────────────────────────────────── */
export function maciaLog(action, detail) {
  const entry = { id: maciaUuid(), action, detail, ts: new Date().toISOString() };
  state.maciaAudit.unshift(entry);
  if (state.maciaAudit.length > MACIA_AUDIT_MAX) state.maciaAudit.length = MACIA_AUDIT_MAX;
  if (API_URL) {
    postData({ action: 'create', sheet: 'macia_audit',
      ID: entry.id, ACTION: action, DETAIL: detail, TIMESTAMP: entry.ts,
    }).catch(() => {});
  }
}

/* ── KPIs ─────────────────────────────────────────────── */
export function updateMaciaKPIs() {
  let ingTotal = 0, egTotal = 0, nuBal = 0, nequiBal = 0;
  state.maciaTx.forEach(t => {
    const v = t.amount, sign = t.type === 'ingreso' ? 1 : -1;
    if (t.type === 'ingreso') ingTotal += v; else egTotal += v;
    if (t.account === 'nu') nuBal += sign * v; else nequiBal += sign * v;
  });
  const total = nuBal + nequiBal;

  document.getElementById('maciaKpiIngresos').textContent = fmtAmount(ingTotal);
  document.getElementById('maciaKpiEgresos').textContent  = fmtAmount(egTotal);
  document.getElementById('maciaKpiNu').textContent       = (nuBal    < 0 ? '-' : '') + fmtAmount(Math.abs(nuBal));
  document.getElementById('maciaKpiNequi').textContent    = (nequiBal < 0 ? '-' : '') + fmtAmount(Math.abs(nequiBal));
  document.getElementById('maciaKpiTotal').textContent    = (total    < 0 ? '-' : '') + fmtAmount(Math.abs(total));

  document.getElementById('maciaKpiNu').closest('.kpi').classList.toggle('negative', nuBal < 0);
  document.getElementById('maciaKpiNequi').closest('.kpi').classList.toggle('negative', nequiBal < 0);

  const card = document.getElementById('maciaKpiTotalCard');
  card.classList.toggle('accent',   total >= 0);
  card.classList.toggle('negative', total <  0);
}

/* ── FILTERS ──────────────────────────────────────────── */
export function applyMaciaFilters() {
  const type    = document.getElementById('maciaFilterType').value;
  const account = document.getElementById('maciaFilterAccount').value;
  const from    = document.getElementById('maciaFilterFrom').value;
  const to      = document.getElementById('maciaFilterTo').value;
  const search  = document.getElementById('maciaFilterSearch').value.toLowerCase().trim();

  state.maciaFiltered = state.maciaTx.filter(t => {
    if (type    && t.type    !== type)    return false;
    if (account && t.account !== account) return false;
    if (from    && t.date    <  from)     return false;
    if (to      && t.date    >  to)       return false;
    if (search  && !t.concept.toLowerCase().includes(search)
        && !(t.observations || '').toLowerCase().includes(search)) return false;
    return true;
  });

  sortMaciaFiltered();
  renderMaciaTable();
}

/* ── SORT ─────────────────────────────────────────────── */
export function sortMaciaBy(col) {
  state.maciaSortDir = (state.maciaSortCol === col && state.maciaSortDir === 'asc') ? 'desc' : 'asc';
  state.maciaSortCol = col;
  ['date','concept','amount'].forEach(c => {
    const el = document.getElementById(`msa-${c}`);
    if (el) {
      el.textContent = c === col ? (state.maciaSortDir === 'asc' ? '↑' : '↓') : '↕';
      el.closest('th').classList.toggle('active', c === col);
    }
  });
  sortMaciaFiltered();
  renderMaciaTable();
}

export function sortMaciaFiltered() {
  state.maciaFiltered.sort((a, b) => {
    let va, vb;
    switch (state.maciaSortCol) {
      case 'amount':  va = a.amount;                 vb = b.amount;                 break;
      case 'concept': va = a.concept.toLowerCase();  vb = b.concept.toLowerCase();  break;
      default:        va = a.date || '';             vb = b.date || '';             break;
    }
    if (va < vb) return state.maciaSortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.maciaSortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

/* ── RENDER TABLE ─────────────────────────────────────── */
export function renderMaciaTable() {
  document.getElementById('maciaVisibleCount').textContent = state.maciaFiltered.length;
  document.getElementById('maciaTotalCount').textContent   = state.maciaTx.length;

  const tbody = document.getElementById('maciaTableBody');
  if (!state.maciaFiltered.length) {
    tbody.innerHTML = state.maciaTx.length
      ? '<tr class="state-row"><td colspan="7">No hay movimientos con esos filtros.</td></tr>'
      : '<tr class="state-row"><td colspan="7">No hay movimientos. Agrega uno con el botón +</td></tr>';
    return;
  }

  tbody.innerHTML = state.maciaFiltered.map((t, i) => {
    const typeBadge    = `<span class="badge badge-${t.type}"><span class="dot dot-${t.type}"></span>${t.type === 'ingreso' ? 'Ingreso' : 'Egreso'}</span>`;
    const accountBadge = `<span class="badge badge-${t.account}"><span class="dot dot-${t.account}"></span>${t.account === 'nu' ? 'Nu' : 'Nequi'}</span>`;
    const amtColor     = t.type === 'ingreso' ? '#4ade80' : '#f87171';
    const amtSign      = t.type === 'ingreso' ? '+' : '−';
    const rawObs       = t.observations || '';
    const obs          = rawObs.length > 45
      ? `<span title="${rawObs}">${rawObs.slice(0,45)}…</span>`
      : (rawObs || '<span style="color:var(--text-muted)">—</span>');

    const pending = !t._row ? ' style="opacity:.65" title="Sincronizando…"' : '';
    return `<tr style="animation-delay:${i*30}ms"${pending}>
      <td style="white-space:nowrap;font-size:12px">${t.date || '—'}</td>
      <td class="td-name" style="font-size:13px">${t.concept || '—'}</td>
      <td class="td-amount" style="color:${amtColor}">${amtSign}${fmtAmount(t.amount)}</td>
      <td>${typeBadge}</td>
      <td>${accountBadge}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:180px">${obs}</td>
      <td class="td-actions">${t._row ? maciaTxMenu(t.id, t._row) : ''}</td>
    </tr>`;
  }).join('');
}

export function maciaTxMenu(id, row) {
  return buildRowMenu([
    { onclick: `openMaciaModal('${id}')`, icon: ROW_MENU_ICONS.pencil, label: 'Editar' },
    { onclick: `deleteMaciaTx('${id}',${row})`, icon: ROW_MENU_ICONS.trash, label: 'Eliminar', danger: true },
  ]);
}

/* ── RENDER AUDIT ─────────────────────────────────────── */
export function renderMaciaAudit() {
  document.getElementById('maciaAuditCount').textContent = state.maciaAudit.length;
  const tbody = document.getElementById('maciaAuditBody');
  if (!state.maciaAudit.length) {
    tbody.innerHTML = '<tr class="state-row"><td colspan="3">No hay eventos registrados.</td></tr>';
    return;
  }
  const ACTION_META = {
    import_csv: { label: 'Importar CSV', cls: 'audit-import' },
    create:     { label: 'Crear',        cls: 'audit-create' },
    edit:       { label: 'Editar',       cls: 'audit-edit'   },
    delete:     { label: 'Eliminar',     cls: 'audit-delete' },
  };
  tbody.innerHTML = state.maciaAudit.map(e => {
    const m  = ACTION_META[e.action] || { label: e.action, cls: '' };
    const dt = new Date(e.ts);
    const fmt = dt.toLocaleDateString('es-CO') + ' ' +
      dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td style="white-space:nowrap;font-size:11px;color:var(--text-muted)">${fmt}</td>
      <td><span class="audit-action ${m.cls}">${m.label}</span></td>
      <td style="font-size:11px;color:var(--text-dim)">${e.detail}</td>
    </tr>`;
  }).join('');
}

/* ── MODAL ────────────────────────────────────────────── */
export function openMaciaModal(id) {
  state.maciaModalId = id || null;
  if (id) {
    const t = state.maciaTx.find(x => x.id === id);
    if (!t) return;
    document.getElementById('maciaModalTitle').textContent = 'Editar movimiento';
    document.getElementById('mfDate').value    = t.date;
    document.getElementById('mfConcept').value = t.concept;
    document.getElementById('mfAmount').value  = t.amount ? t.amount.toLocaleString('es-CO') : '';
    segSetValue('segType',    t.type    || 'ingreso');
    segSetValue('segAccount', t.account || 'nu');
    document.getElementById('mfObs').value     = t.observations || '';
  } else {
    document.getElementById('maciaModalTitle').textContent = 'Nuevo movimiento';
    document.getElementById('mfDate').value    = new Date().toISOString().slice(0, 10);
    document.getElementById('mfConcept').value = '';
    document.getElementById('mfAmount').value  = '';
    segSetValue('segType',    'ingreso');
    segSetValue('segAccount', 'nu');
    document.getElementById('mfObs').value     = '';
  }
  document.getElementById('maciaBtnSave').disabled          = false;
  document.getElementById('maciaBackdrop').style.display    = 'block';
  document.getElementById('maciaModal').style.display       = 'flex';
}

/* Control segmentado (switch de 2 opciones visibles). El valor se refleja
   en un <input hidden> para que submit/edición lo lean igual que un select. */
export function segSet(btn) {
  const seg = btn.closest('.seg');
  seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
  const hidden = document.getElementById(seg.dataset.input);
  if (hidden) hidden.value = btn.dataset.val;
}

export function segSetValue(segId, val) {
  const btn = document.querySelector(`#${segId} .seg-btn[data-val="${val}"]`);
  if (btn) segSet(btn);
}

export function closeMaciaModal() {
  document.getElementById('maciaBackdrop').style.display = 'none';
  document.getElementById('maciaModal').style.display    = 'none';
}

export function submitMaciaModal() {
  const date    = document.getElementById('mfDate').value.trim();
  const concept = document.getElementById('mfConcept').value.trim();
  const amount  = parseFloat(document.getElementById('mfAmount').value.replace(/\./g, '')) || 0;
  const type    = document.getElementById('mfType').value;
  const account = document.getElementById('mfAccount').value;
  const obs     = document.getElementById('mfObs').value.trim();

  if (!concept) { showNotification('Concepto requerido', 'err'); return; }
  if (!amount)  { showNotification('Monto requerido',   'err'); return; }
  if (!date)    { showNotification('Fecha requerida',   'err'); return; }

  // El concepto usado queda registrado como etiqueta reutilizable.
  saveTag('ct_tags_concept', concept);

  if (state.maciaModalId) {
    const idx = state.maciaTx.findIndex(x => x.id === state.maciaModalId);
    if (idx < 0) return;
    const t = state.maciaTx[idx];
    state.maciaTx[idx] = { ...t, date, concept, amount, type, account, observations: obs };
    maciaLog('edit', `${concept} · ${type} · ${fmtAmount(amount)} · ${account}`);
    saveMacia(); refreshMacia(); closeMaciaModal();
    if (API_URL && t._row) {
      postData({ action: 'update', sheet: 'macia', _row: t._row,
        DATE: date, CONCEPT: concept, AMOUNT: amount, TYPE: type, ACCOUNT: account, OBSERVATIONS: obs })
        .then(() => showNotification('Actualizado ✓'))
        .catch(err => { showNotification('Error: ' + err.message, 'err'); loadMaciaFromGAS(); });
    } else { showNotification('Actualizado ✓'); }
  } else {
    const id = maciaUuid(), createdAt = new Date().toISOString();
    state.maciaTx.unshift({ id, _row: null, date, concept, amount, type, account, observations: obs, createdAt });
    maciaLog('create', `${concept} · ${type} · ${fmtAmount(amount)} · ${account}`);
    saveMacia(); refreshMacia(); closeMaciaModal();
    if (API_URL) {
      postData({ action: 'create', sheet: 'macia',
        ID: id, DATE: date, CONCEPT: concept, AMOUNT: amount,
        TYPE: type, ACCOUNT: account, OBSERVATIONS: obs, CREATED_AT: createdAt })
        .then(() => { showNotification('Guardado ✓'); loadMaciaFromGAS(); })
        .catch(err => { showNotification('Error: ' + err.message, 'err'); });
    } else { showNotification('Guardado ✓'); }
  }
}

/* ── DELETE ───────────────────────────────────────────── */
export function deleteMaciaTx(id, row) {
  const t = state.maciaTx.find(x => x.id === id);
  if (!t) return;
  document.getElementById('confirmMsg').innerHTML =
    `¿Eliminar <b style="color:var(--text)">${t.concept}</b>?<br>` +
    `<span style="color:var(--text-muted);font-size:11px">Esta acción no se puede deshacer.</span>`;
  state._pendingMaciaDelete = { id, row };
  document.getElementById('confirmBackdrop').style.display = 'block';
  document.getElementById('confirmModal').style.display    = 'flex';
}

/* ── CSV IMPORT ──────────────────────────────────────── */
export function importMaciaCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const rows = parseCsv(e.target.result);
      if (!rows.length) { showNotification('CSV vacío', 'err'); return; }
      const COL_MAP = {
        date:    ['FECHA','DATE','DIA','DÍA'],
        concept: ['CONCEPTO','CONCEPT','DESCRIPCION','DESCRIPCIÓN','DETALLE','NOMBRE'],
        amount:  ['MONTO','AMOUNT','VALOR','TOTAL','IMPORTE'],
        type:    ['TIPO','TYPE'],
        account: ['CUENTA','ACCOUNT','METODO','MÉTODO','BANCO'],
        obs:     ['OBSERVACIONES','OBSERVATIONS','NOTAS','NOTES','OBS'],
      };
      const headers = Object.keys(rows[0]).filter(k => k !== '_row');
      const findCol = keys => keys.find(k => headers.includes(k)) || null;
      const colDate=findCol(COL_MAP.date), colConcept=findCol(COL_MAP.concept);
      const colAmount=findCol(COL_MAP.amount), colType=findCol(COL_MAP.type);
      const colAccount=findCol(COL_MAP.account), colObs=findCol(COL_MAP.obs);
      if (!colAmount) { showNotification('No se encontró columna de monto', 'err'); return; }

      const newItems = [];
      rows.forEach(r => {
        const amount = parseAmount(r[colAmount]);
        if (!amount) return;
        const rawType=(r[colType]||'').toLowerCase().trim();
        const rawAccount=(r[colAccount]||'').toLowerCase().trim();
        const type=(rawType.includes('egreso')||rawType.includes('gasto')||rawType==='-')?'egreso':'ingreso';
        const account=rawAccount.includes('nequi')?'nequi':'nu';
        let date=colDate?(r[colDate]||'').trim():'';
        if (date && !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const m=date.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
          if (m){const y=m[3].length===2?'20'+m[3]:m[3];date=`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
        }
        const concept=colConcept?(r[colConcept]||'').trim()||'Importado':'Importado';
        const obs=colObs?(r[colObs]||'').trim():'';
        const createdAt=new Date().toISOString();
        newItems.push({id:maciaUuid(),_row:null,date,concept,amount,type,account,observations:obs,createdAt});
      });

      if (!newItems.length){showNotification('Sin filas con monto válido','err');return;}
      state.maciaTx.push(...newItems);
      maciaLog('import_csv',`${newItems.length} movimientos importados desde "${file.name}"`);
      saveMacia(); refreshMacia();
      showNotification(`${newItems.length} importados — sincronizando…`);

      if (API_URL) {
        await Promise.allSettled(newItems.map(t =>
          postData({action:'create',sheet:'macia',
            ID:t.id,DATE:t.date,CONCEPT:t.concept,AMOUNT:t.amount,
            TYPE:t.type,ACCOUNT:t.account,OBSERVATIONS:t.observations,CREATED_AT:t.createdAt})
        ));
        await loadMaciaFromGAS();
        showNotification(`${newItems.length} guardados en Sheets ✓`);
      }
    } catch(err){ showNotification('Error: '+err.message,'err'); }
  };
  reader.readAsText(file,'UTF-8');
}

/* ── REFRESH ──────────────────────────────────────────── */
export function refreshMacia() {
  updateMaciaKPIs();
  applyMaciaFilters();
}

/* ── CARGA INICIAL MACIA (corre una sola vez) ─────────── */
// Historial real de CUENTAS MACIA. Monto negativo = egreso, positivo =
// ingreso. Todo en Nu. Año inferido: mar–dic = 2025, ene–may = 2026.
export async function cargaInicialMacia() {
  if (localStorage.getItem('macia_carga_v3')) return;
  if (!API_URL) return;

  const REGS = [
    ['2025-03-05','adelanto desarrollo jdt',               2000000],
    ['2025-03-01','clickfunnels',                          -402000],
    ['2025-03-01','chatgpt',                                -86000],
    ['2025-03-01','sueldo miguel',                       -1600000],
    ['2025-03-07','transferencia a 3164533392',         -1000000],
    ['2025-05-02','pago desarrollo + mante y plataforma', 3200000],
    ['2025-05-01','chatgpt',                                -86000],
    ['2025-04-01','clickfunnels',                          -420000],
    ['2025-06-01','Suscripcion sitio web JDT',             400000],
    ['2025-06-01','chatgpt',                                -86000],
    ['2025-07-01','certificados jdt',                      600000],
    ['2025-07-01','sueldo miguel',                        -400000],
    ['2025-07-01','chatgpt',                                -86000],
    ['2025-07-01','Suscripcion sitio web JDT',             400000],
    ['2025-07-31','odoo',                                -4409588],
    ['2025-08-01','chatgpt',                                -83000],
    ['2025-08-01','miguel camacho aporte',               1489588],
    ['2025-09-01','Mantenimiento BOLIGLOBOS',              400000],
    ['2025-09-01','chatgpt',                                -80000],
    ['2025-10-01','Mantenimiento BOLIGLOBOS',              400000],
    ['2025-10-01','almacenamiento drive',                  -75500],
    ['2025-10-01','Plataforma JDT',                        400000],
    ['2025-10-01','dominio macia',                         -61000],
    ['2025-10-01','chatgpt',                                -81000],
    ['2025-11-01','chatgpt',                                -81000],
    ['2025-11-01','Plataforma JDT',                        400000],
    ['2025-12-01','Plataforma JDT',                        400000],
    ['2025-12-01','Claude',                                 -80000],
    ['2026-01-01','Claude',                                 -80000],
    ['2026-01-01','Mantenimiento JDT',                     410000],
    ['2026-01-01','Plataforma JDT',                        400000],
    ['2026-01-01','Certificado resina JDT',                100000],
    ['2026-01-01','Mantenimiento BOLIGLOBOS',              410000],
    ['2026-01-01','Sueldo miguel cuellar',              -1750000],
    ['2026-01-01','Montajes JDT',                        4000000],
    ['2026-01-01','20% miguel cuellar',                   -698000],
    ['2026-01-01','80% miguel camacho',                 -2792000],
    ['2026-02-01','Claude',                                 -80000],
    ['2026-02-01','Biaticos',                             -125000],
    ['2026-02-01','Mantenimiento JDT',                     410000],
    ['2026-02-01','Plataforma JDT',                        400000],
    ['2026-02-01','Certificado resina JDT',                100000],
    ['2026-02-01','Mantenimiento BOLIGLOBOS',              410000],
    ['2026-02-01','Montajes JDT',                        3500000],
    ['2026-02-01','Sueldo miguel cuellar',              -1750000],
    ['2026-02-01','20% miguel cuellar',                   -573000],
    ['2026-02-01','80% miguel camacho',                 -2292000],
    ['2026-03-01','Claude',                                 -80000],
    ['2026-03-01','Plataforma JDT',                        910000],
    ['2026-03-01','Mantenimiento BOLIGLOBOS',              410000],
    ['2026-03-01','Montajes JDT',                        1100000],
    ['2026-03-01','Sueldo miguel cuellar',              -1750000],
    ['2026-03-01','20% miguel cuellar',                   -118000],
    ['2026-03-01','80% miguel camacho',                  -472000],
    ['2026-04-01','Mantenimiento BOLIGLOBOS',              410000],
    ['2026-04-01','Claude',                                 -80000],
    ['2026-04-01','Plataforma JDT',                        910000],
    ['2026-04-01','Dominio JDT',                          -180000],
    ['2026-04-01','Montajes JDT',                        1100000],
    ['2026-04-01','Sueldo miguel cuellar',              -1750000],
    ['2026-04-01','20% miguel cuellar',                   -118000],
    ['2026-04-01','80% miguel camacho',                  -472000],
    ['2026-04-01','Dominio JDT',                           180000],
    ['2026-05-01','Mantenimiento BOLIGLOBOS',              410000],
    ['2026-05-01','Claude',                                 -80000],
    ['2026-05-01','Plataforma JDT',                        910000],
    ['2026-05-01','Montajes JDT',                        1250000],
    ['2026-05-01','Sueldo miguel cuellar',              -1750000],
    ['2026-05-01','20% miguel cuellar',                   -148000],
    ['2026-05-01','80% miguel camacho',                  -592000],
  ];

  // Si la hoja ya tiene movimientos, no sembramos de nuevo (evita
  // duplicados). Solo carga el historial cuando está vacía.
  await loadMaciaFromGAS();
  if (state.maciaTx.length > 0) {
    localStorage.setItem('macia_carga_v3', '1');
    return;
  }

  showNotification('Cargando historial MACIA en Sheets…');
  await Promise.allSettled(REGS.map(([date, concept, amt]) => {
    const id = maciaUuid(), createdAt = new Date().toISOString();
    return postData({ action: 'create', sheet: 'macia',
      ID: id, DATE: date, CONCEPT: concept, AMOUNT: Math.abs(amt),
      TYPE: amt < 0 ? 'egreso' : 'ingreso', ACCOUNT: 'nu',
      OBSERVATIONS: '', CREATED_AT: createdAt });
  }));

  maciaLog('import_csv', `${REGS.length} movimientos importados — historial CUENTAS MACIA (todo en Nu)`);
  localStorage.setItem('macia_carga_v3', '1');
  await loadMaciaFromGAS();

  // Solo marcamos la carga como hecha si los datos realmente llegaron a
  // Sheets; si quedó vacío (deployment viejo / sin escritura), reintenta
  // en la próxima recarga.
  if (state.maciaTx.length > 0) {
    localStorage.setItem('macia_carga_v3', '1');
    showNotification(`${state.maciaTx.length} movimientos cargados ✓`);
  } else {
    showNotification('No se pudo guardar en Sheets — revisa el deployment', 'err');
  }
}
