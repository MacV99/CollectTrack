/* cobros.js — Central de cobros: mensualidades de todos los sistemas (SaaS).
   Vive dentro de MACV → Cobros: los clientes de los sistemas se mezclan con
   tus personas en la misma lista (ver collections.js → cobrosRows; sus plazos
   vencidos / esta semana / 30 días son opciones del filtro de estado) y aquí
   se pintan "Pagos por confirmar" y los modales.
   Habla con la sección "CENTRAL DE COBROS" de GAS_SCRIPT.js por JSONP.
   La clave del panel se pide una vez y queda en localStorage (COB_KEY).
   Las filas llaman a sus handlers por índice (state.cob.clientes[i]) para no
   meter textos del usuario dentro del onclick. */
import { API_URL } from '../config.js';
import { fetchJSONP } from '../lib/api.js';
import { currentPeriod, escHtml, fmtAmount, parseAmount } from '../lib/format.js';
import { showNotification } from '../ui/notify.js';
import { buildRowMenu, ROW_MENU_ICONS } from '../ui/rowMenu.js';
import { state } from '../state.js';
import { refreshAll } from './data.js';

const COB_KEY = 'ct_cob_k';
let cargando = null;

function clave() {
  try { return localStorage.getItem(COB_KEY) || ''; } catch { return ''; }
}

async function cob(action, params = {}) {
  const q = new URLSearchParams({ action, k: clave() });
  for (const k in params) q.set(k, params[k] == null ? '' : String(params[k]));
  const json = await fetchJSONP(API_URL + '?' + q.toString());
  if (!json || json.ok === false) {
    const msg = (json && json.error) || 'error desconocido';
    if (msg === 'clave incorrecta') pedirClave('Clave incorrecta');
    throw new Error(msg);
  }
  return json;
}

// Sin clave: solo se ven tus personas y aparece el aviso para conectar.
function pedirClave(err = '') {
  try { localStorage.removeItem(COB_KEY); } catch {}
  const tenia = !!state.cob;
  state.cob = null;
  document.documentElement.classList.remove('cob-on');
  document.getElementById('cobConectar').hidden = false;
  document.getElementById('cobLoginErr').textContent = err;
  if (tenia) refreshAll(); else pintarCentral();
}

/* Al arrancar la app: carga la central si ya hay clave guardada. */
export function cobInit() {
  if (!clave()) return pedirClave();
  cobCargar();
}

export function cobEntrar() {
  const input = document.getElementById('cobClave');
  const k = input.value.trim();
  if (!k) return;
  try { localStorage.setItem(COB_KEY, k); } catch {}
  input.value = '';
  cobCargar();
}

export function cobCargar() {
  if (cargando) return cargando;
  cargando = cob('cobListar')
    .then(res => {
      state.cob = { hoy: res.hoy, sistemas: res.sistemas, clientes: res.clientes, reportes: res.reportes };
      document.getElementById('cobConectar').hidden = true;
      document.documentElement.classList.add('cob-on');
      refreshAll();
    })
    .catch(e => { if (e.message !== 'clave incorrecta') showNotification('Sistemas: ' + e.message, 'err'); })
    .finally(() => { cargando = null; });
  return cargando;
}

/* ── Filas de los sistemas para la lista de Cobros ──── */
const nombreSistema = id => (state.cob?.sistemas.find(s => s.id === id) || {}).nombre || id;
const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

function fechaCorta(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Cómo va un cliente de sistema (gracia N = se corta N días después de vencer).
function estadoSaas(c) {
  if (!c.activo) return ['overdue', 'Pausado'];
  if (c.dias === null || c.dias === undefined) return ['pending', 'Sin fecha'];
  if (c.bloqueado) return ['overdue', c.dias === 0 ? 'Bloqueado · venció hoy' : `Bloqueado · venció hace ${plural(-c.dias, 'día', 'días')}`];
  if (c.dias < 0) return ['overdue', `En gracia · se corta en ${plural(c.dias + c.gracia, 'día', 'días')}`];
  if (c.dias === 0) return ['pending', 'Vence hoy'];
  if (c.dias <= 7) return ['pending', `Vence en ${plural(c.dias, 'día', 'días')}`];
  return ['paid', 'Al día · hasta ' + fechaCorta(c.vence)];
}

// Clientes de los sistemas con la misma forma que una fila de "cobros":
// name, category (= sistema), amountNum (lo que aporta al mes), date (día).
export function saasRows() {
  if (!state.cob) return [];
  const ocultos = new Set(state.cob.sistemas.filter(s => s.activo === 'no').map(s => s.id));
  return state.cob.clientes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !ocultos.has(c.sistema))
    .map(({ c, i }) => {
      const [status, label] = estadoSaas(c);
      const anual = c.plan === 'anual';
      return {
        _saas: i,
        name: c.nombre,
        category: nombreSistema(c.sistema),
        amountNum: anual ? Math.round((Number(c.valor) || 0) / 12) : Number(c.valor) || 0,
        rawAmount: fmtAmount(Number(c.valor) || 0) + (anual ? ' /año' : ''),
        date: c.vence ? String(Number(c.vence.slice(8))) : '',
        chip: c.vence ? fechaCorta(c.vence).replace(/ de \d{4}$/, '') : '',
        status, label,
      };
    });
}

export function saasRowHtml(r, i) {
  const on = r.status === 'paid';
  return `<tr data-status="${r.status}" style="animation-delay:${i * 35}ms">
      <td class="td-name" data-label="Nombre">${escHtml(r.name)}</td>
      <td data-label="Día">${saasChip(r)}</td>
      <td class="td-amount" data-label="Monto">${escHtml(r.rawAmount)}</td>
      <td data-label="Categoría"><span class="badge cat-sistema"><span class="dot dot-sistema"></span>${escHtml(r.category)}</span></td>
      <td class="td-actions" data-label="Acciones">
        <button class="btn-row check ${on ? 'on' : ''}" title="Registrar pago" onclick="cobAbrirPago(${r._saas})">✓</button>
        ${buildRowMenu([{ onclick: `cobAbrirCliente(${r._saas})`, icon: ROW_MENU_ICONS.pencil, label: 'Editar' }])}
      </td>
    </tr>`;
}

function saasChip(r) {
  if (!r.chip) return `<span class="day-chip ${r.status}" onclick="toggleDayLabel(event)">—<span class="day-tip">${escHtml(r.label)}</span></span>`;
  return `<span class="day-chip ${r.status}" onclick="toggleDayLabel(event)">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
    + `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>`
    + `<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${escHtml(r.chip)}`
    + `<span class="day-tip">${escHtml(r.label)}</span></span>`;
}

/* ── Pagos por confirmar + calendario (encima de la lista) ── */
const filaVacia = (cols, txt) => `<tr class="state-row"><td colspan="${cols}">${escHtml(txt)}</td></tr>`;
const chipCat = (txt, cls = 'cat-sistema', dot = 'dot-sistema') => `<span class="badge ${cls}"><span class="dot ${dot}"></span>${escHtml(txt)}</span>`;
const badge = (st, txt) => {
  const t = { paid: 'pagada', pending: 'pendiente', overdue: 'egreso' }[st];
  return `<span class="badge badge-${t}"><span class="dot dot-${t}"></span>${escHtml(txt)}</span>`;
};

// Días que faltan para que le toque (negativo = vencido). Personas: el día X
// de este mes, o del próximo si ya pagó. Sistemas: su fecha de vencimiento.
// null = sin fecha o pausado (no entra en los plazos).
export function diasDe(r) {
  if (r._saas != null) {
    const c = state.cob.clientes[r._saas];
    return c.activo && c.vence ? c.dias : null;
  }
  const dia = parseInt(r.date, 10);
  if (!dia) return null;
  const d = new Date();
  const hoy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mes = hoy.getMonth() + (r.paid === currentPeriod() ? 1 : 0);
  const ultimo = new Date(hoy.getFullYear(), mes + 1, 0).getDate();
  return Math.round((new Date(hoy.getFullYear(), mes, Math.min(dia, ultimo)) - hoy) / 86400000);
}

// Lo que se cobra en ese vencimiento (un plan anual cobra el año completo).
export function valorCobro(r) {
  return r._saas != null ? Number(state.cob.clientes[r._saas].valor) || 0 : r.amountNum;
}

export function pintarCentral() {
  pintarReportes();
  if (state.cob) pintarSistemas();
}

function pintarReportes() {
  const pend = (state.cob?.reportes || []).map((r, i) => ({ ...r, _i: i })).filter(r => r.estado === 'pendiente');
  document.getElementById('cobReportesPanel').hidden = !pend.length;
  document.getElementById('cobReportesN').textContent = pend.length;
  document.getElementById('cobReportes').innerHTML = pend.map(r => `
      <tr data-status="pending">
        <td class="td-name">${escHtml(r.nombre)}</td>
        <td class="td-actions">
          <button class="btn-add" onclick="cobResolver(${r._i}, true)">✓ Aprobar</button>
          <button class="btn-cancel cob-rechazar" onclick="cobResolver(${r._i}, false)">Rechazar</button>
        </td>
        <td class="td-amount">${fmtAmount(Number(r.monto) || 0)}</td>
        <td>${chipCat(nombreSistema(r.sistema))}</td>
        <td class="cob-muted">${escHtml(r.plan)} · ${escHtml(fechaCorta(r.fecha))}${r.nota ? ' · ' + escHtml(r.nota) : ''}</td>
        <td><a class="cob-link" href="${escHtml(r.comprobante)}" target="_blank" rel="noopener">Ver comprobante</a></td>
      </tr>`).join('');
}

function pintarSistemas() {
  const s = state.cob.sistemas;
  document.getElementById('cobSistemas').innerHTML = s.length
    ? s.map((x, i) => `
      <tr data-status="${x.activo === 'no' ? 'pending' : 'paid'}">
        <td class="td-name">${escHtml(x.nombre)}</td>
        <td class="cob-muted">Gracia ${escHtml(x.gracia_dias)} días</td>
        <td class="cob-muted">${plural(state.cob.clientes.filter(c => c.sistema === x.id).length, 'cliente', 'clientes')}</td>
        <td>${x.activo === 'no' ? badge('pending', 'Oculto') : badge('paid', 'Activo')}</td>
        <td class="td-actions"><button class="btn-cancel" onclick="cobAbrirSistema(${i})">Editar</button></td>
      </tr>`).join('')
    : filaVacia(5, 'Aún no hay sistemas.');
}

/* ── Modales ────────────────────────────────────────── */
function abrir(nombre) {
  document.getElementById(nombre + 'Backdrop').style.display = 'block';
  document.getElementById(nombre + 'Modal').style.display = 'flex';
}
export function cobCerrar(nombre) {
  document.getElementById(nombre + 'Backdrop').style.display = 'none';
  document.getElementById(nombre + 'Modal').style.display = 'none';
}
const val = id => document.getElementById(id).value;
const setVal = (id, v) => { document.getElementById(id).value = v == null ? '' : v; };
const montoTxt = n => (Number(n) ? Number(n).toLocaleString('es-CO') : '');

async function guardar(btnId, accion, params, modal, okMsg) {
  const btn = document.getElementById(btnId);
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    await cob(accion, params);
    if (modal) cobCerrar(modal);
    showNotification(okMsg);
    await cobCargar();
  } catch (e) {
    showNotification(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

export function cobAbrirSistemas() {
  pintarSistemas();
  abrir('cobSistemas');
}

let editCliente = null;
export function cobAbrirCliente(i) {
  if (!state.cob) return showNotification('Conecta tus sistemas primero', 'err');
  if (!state.cob.sistemas.length) return showNotification('Crea primero un sistema', 'err');
  const c = state.cob.clientes[i] || null;
  editCliente = c;
  const sel = document.getElementById('ccSistema');
  sel.innerHTML = state.cob.sistemas.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.nombre)}</option>`).join('');
  sel.value = c ? c.sistema : state.cob.sistemas[0].id;
  sel.disabled = !!c;
  document.getElementById('ccId').disabled = !!c;
  document.getElementById('cobClienteTitulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente de sistema';
  setVal('ccId', c?.id);
  setVal('ccNombre', c?.nombre);
  setVal('ccContacto', c?.contacto);
  setVal('ccTelefono', c?.telefono);
  setVal('ccPlan', c?.plan || 'mensual');
  setVal('ccPrecio', montoTxt(c?.precio));
  setVal('ccHasta', c?.pagado_hasta);
  setVal('ccGracia', c?.gracia_dias);
  setVal('ccEstado', c?.estado === 'pausado' ? 'pausado' : 'activo');
  abrir('cobCliente');
}

export function cobGuardarCliente() {
  return guardar('ccGuardar', 'cobGuardarCliente', {
    nuevo: editCliente ? 'false' : 'true',
    sistema: val('ccSistema'), id: val('ccId').trim(), nombre: val('ccNombre').trim(),
    contacto: val('ccContacto'), telefono: val('ccTelefono'),
    plan: val('ccPlan'), precio: parseAmount(val('ccPrecio')) || '',
    pagado_hasta: val('ccHasta'), gracia_dias: val('ccGracia'), estado: val('ccEstado'),
  }, 'cobCliente', 'Cliente guardado ✓');
}

let editSistema = null;
export function cobAbrirSistema(i) {
  const s = state.cob.sistemas[i] || null;
  editSistema = s;
  document.getElementById('cobSistemaTitulo').textContent = s ? 'Editar sistema' : 'Nuevo sistema';
  setVal('csNombre', s?.nombre);
  setVal('csGracia', s ? s.gracia_dias : '7');
  setVal('csActivo', s?.activo === 'no' ? 'no' : 'si');
  document.getElementById('csClaveGrupo').hidden = !s;
  document.getElementById('csClave').textContent = s?.clave || '';
  document.getElementById('csNuevaClave').checked = false;
  abrir('cobSistema');
}

export function cobGuardarSistema() {
  return guardar('csGuardar', 'cobGuardarSistema', {
    nuevo: editSistema ? 'false' : 'true', id: editSistema?.id || '',
    nombre: val('csNombre').trim(), gracia_dias: val('csGracia'), activo: val('csActivo'),
    nuevaClave: document.getElementById('csNuevaClave').checked ? 'true' : 'false',
  }, 'cobSistema', editSistema ? 'Sistema guardado ✓' : 'Sistema creado ✓ · abre Editar para ver su clave');
}

export async function cobCopiarClave() {
  try {
    await navigator.clipboard.writeText(document.getElementById('csClave').textContent);
    showNotification('Clave copiada ✓');
  } catch {
    showNotification('No se pudo copiar', 'err');
  }
}

let pagoCliente = null;
export function cobAbrirPago(i) {
  const c = state.cob.clientes[i];
  pagoCliente = c;
  document.getElementById('cobPagoTitulo').textContent = 'Pago · ' + c.nombre;
  document.getElementById('cobPagoInfo').textContent =
    nombreSistema(c.sistema) + ' · pagado hasta ' + fechaCorta(c.vence) + '. La fecha se corre sola al registrar.';
  setVal('cpPlan', c.plan);
  setVal('cpMonto', montoTxt(c.valor));
  setVal('cpNota', '');
  abrir('cobPago');
}

export function cobGuardarPago() {
  const monto = parseAmount(val('cpMonto'));
  if (!monto) return showNotification('Falta el valor', 'err');
  return guardar('cpGuardar', 'cobRegistrarPago', {
    sistema: pagoCliente.sistema, cliente: pagoCliente.id,
    plan: val('cpPlan'), monto, nota: val('cpNota'),
  }, 'cobPago', 'Pago registrado ✓');
}

/* Aprobar = corre la fecha (el sistema lo desbloquea solo); rechazar = solo lo marca. */
export async function cobResolver(i, aprobar) {
  const r = state.cob.reportes[i];
  if (!r) return;
  if (!aprobar && !confirm('¿Rechazar el pago de ' + r.nombre + '?')) return;
  try {
    const res = await cob('cobResolver', { id: r.id, aprobar: String(aprobar) });
    showNotification(aprobar ? 'Aprobado ✓ · pagado hasta ' + fechaCorta(res.pago.hasta) : 'Pago rechazado');
    await cobCargar();
  } catch (e) {
    showNotification(e.message, 'err');
  }
}
