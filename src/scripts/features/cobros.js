/* cobros.js — Central de cobros: mensualidades de todos los sistemas (SaaS).
   Habla con la sección "CENTRAL DE COBROS" de GAS_SCRIPT.js por JSONP.
   La clave del panel se pide una vez y queda en localStorage (COB_KEY).
   Las filas se pintan con innerHTML y llaman a sus handlers por índice
   (state.cob.clientes[i]) para no meter textos del usuario dentro del onclick. */
import { API_URL } from '../config.js';
import { fetchJSONP } from '../lib/api.js';
import { escHtml, fmtAmount, parseAmount } from '../lib/format.js';
import { showNotification } from '../ui/notify.js';
import { state } from '../state.js';

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

function pedirClave(err = '') {
  try { localStorage.removeItem(COB_KEY); } catch {}
  document.getElementById('cobLogin').hidden = false;
  document.getElementById('cobContenido').hidden = true;
  document.getElementById('cobLoginErr').textContent = err;
  document.getElementById('cobClave').focus();
}

/* Se llama al abrir la pestaña COBROS: carga una vez (Actualizar recarga). */
export function cobAbrir() {
  if (!clave()) return pedirClave();
  if (!state.cob) cobCargar();
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
  document.getElementById('cobReportes').innerHTML = filaVacia(1, 'Cargando…');
  cargando = cob('cobListar')
    .then(res => {
      state.cob = { hoy: res.hoy, sistemas: res.sistemas, clientes: res.clientes, reportes: res.reportes };
      document.getElementById('cobLogin').hidden = true;
      document.getElementById('cobContenido').hidden = false;
      pintarFiltro();
      cobFiltrar();
    })
    .catch(e => { if (e.message !== 'clave incorrecta') showNotification('Cobros: ' + e.message, 'err'); })
    .finally(() => { cargando = null; });
  return cargando;
}

/* ── Helpers de pintado ─────────────────────────────── */
const filaVacia = (cols, txt) => `<tr class="state-row"><td colspan="${cols}">${escHtml(txt)}</td></tr>`;
const nombreSistema = id => (state.cob.sistemas.find(s => s.id === id) || {}).nombre || id;
const chipSistema = id => `<span class="badge cat-default"><span class="dot dot-default"></span>${escHtml(nombreSistema(id))}</span>`;
const badge = (tipo, txt) => `<span class="badge badge-${tipo}"><span class="dot dot-${tipo}"></span>${escHtml(txt)}</span>`;
const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

function fechaCorta(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Texto y color del estado de un cliente (gracia N = se corta N días después de vencer).
function estadoDe(c) {
  if (!c.activo) return badge('egreso', 'Pausado');
  if (c.dias === null || c.dias === undefined) return badge('pendiente', 'Sin fecha');
  if (c.bloqueado) return badge('egreso', c.dias === 0 ? 'Bloqueado · venció hoy' : `Bloqueado · venció hace ${plural(-c.dias, 'día', 'días')}`);
  if (c.dias < 0) return badge('pendiente', `En gracia · se corta en ${plural(c.dias + c.gracia, 'día', 'días')}`);
  if (c.dias === 0) return badge('pendiente', c.gracia ? 'Vence hoy' : 'Se corta hoy');
  if (c.dias <= 7) return badge('pendiente', `Vence en ${plural(c.dias, 'día', 'días')}`);
  return badge('pagada', 'Al día');
}

function pintarFiltro() {
  const sel = document.getElementById('cobFiltro');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todos los sistemas</option>' +
    state.cob.sistemas.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.nombre)}</option>`).join('');
  sel.value = state.cob.sistemas.some(s => s.id === actual) ? actual : '';
}

/* ── Render principal (respeta el filtro por sistema) ─ */
export function cobFiltrar() {
  if (!state.cob) return;
  const filtro = document.getElementById('cobFiltro').value;
  const delFiltro = x => !filtro || x.sistema === filtro;
  const ocultos = new Set(state.cob.sistemas.filter(s => s.activo === 'no').map(s => s.id));
  const clientes = state.cob.clientes
    .map((c, i) => ({ ...c, _i: i }))
    .filter(c => delFiltro(c) && (filtro || !ocultos.has(c.sistema)));

  pintarKpis(clientes);
  pintarReportes(state.cob.reportes.map((r, i) => ({ ...r, _i: i })).filter(r => r.estado === 'pendiente' && delFiltro(r)));
  pintarCalendario(clientes);
  pintarClientes(clientes);
  pintarSistemas();
}

function pintarKpis(clientes) {
  const activos = clientes.filter(c => c.activo && c.vence);
  const suma = arr => arr.reduce((t, c) => t + (Number(c.valor) || 0), 0);
  const vencidos = activos.filter(c => c.dias < 0);
  const semana = activos.filter(c => c.dias >= 0 && c.dias <= 7);
  const mes = activos.filter(c => c.dias > 7 && c.dias <= 30);
  const alDia = clientes.filter(c => c.activo && !c.bloqueado && (c.dias === null || c.dias >= 0));
  const set = (id, v) => { document.getElementById(id).textContent = v; };
  set('cobKpiVencido', fmtAmount(suma(vencidos)));
  set('cobKpiVencidoN', plural(vencidos.length, 'cliente', 'clientes'));
  set('cobKpiSemana', fmtAmount(suma(semana)));
  set('cobKpiSemanaN', plural(semana.length, 'cliente', 'clientes'));
  set('cobKpi30', fmtAmount(suma(mes)));
  set('cobKpi30N', plural(mes.length, 'cliente', 'clientes'));
  set('cobKpiAlDia', String(alDia.length));
  set('cobKpiAlDiaN', 'de ' + plural(clientes.length, 'cliente', 'clientes'));
}

function pintarReportes(pend) {
  document.getElementById('cobReportesN').textContent = pend.length;
  document.getElementById('cobReportes').innerHTML = pend.length
    ? pend.map(r => `
      <tr data-status="pending">
        <td class="td-name">${escHtml(r.nombre)}</td>
        <td class="td-actions">
          <button class="btn-add" onclick="cobResolver(${r._i}, true)">✓ Aprobar</button>
          <button class="btn-cancel cob-rechazar" onclick="cobResolver(${r._i}, false)">Rechazar</button>
        </td>
        <td class="td-amount">${fmtAmount(Number(r.monto) || 0)}</td>
        <td>${chipSistema(r.sistema)}</td>
        <td class="cob-muted">${escHtml(r.plan)} · ${escHtml(fechaCorta(r.fecha))}${r.nota ? ' · ' + escHtml(r.nota) : ''}</td>
        <td><a class="cob-link" href="${escHtml(r.comprobante)}" target="_blank" rel="noopener">Ver comprobante</a></td>
      </tr>`).join('')
    : filaVacia(6, 'No hay pagos por confirmar.');
}

function pintarCalendario(clientes) {
  const activos = clientes.filter(c => c.activo && c.vence).sort((a, b) => a.dias - b.dias);
  const grupos = [
    ['Vencidos', activos.filter(c => c.dias < 0)],
    ['Esta semana', activos.filter(c => c.dias >= 0 && c.dias <= 7)],
    ['Próximos 30 días', activos.filter(c => c.dias > 7 && c.dias <= 30)],
  ];
  const html = grupos.filter(([, arr]) => arr.length).map(([titulo, arr]) => `
    <tr class="cob-grupo"><td colspan="6"><span>${titulo}</span><span>${fmtAmount(arr.reduce((t, c) => t + (Number(c.valor) || 0), 0))}</span></td></tr>
    ${arr.map(c => `
      <tr data-status="${c.bloqueado ? 'overdue' : 'pending'}">
        <td class="td-name">${escHtml(c.nombre)}</td>
        <td>${chipSistema(c.sistema)}</td>
        <td class="td-amount">${fmtAmount(Number(c.valor) || 0)}</td>
        <td class="cob-muted">${escHtml(fechaCorta(c.vence))}</td>
        <td>${estadoDe(c)}</td>
        <td class="td-actions"><button class="btn-add" onclick="cobAbrirPago(${c._i})">Registrar pago</button></td>
      </tr>`).join('')}`).join('');
  document.getElementById('cobCalendario').innerHTML = html || filaVacia(6, 'Nadie vence en los próximos 30 días.');
}

function pintarClientes(clientes) {
  const q = document.getElementById('cobBuscar').value.trim().toLowerCase();
  const lista = clientes
    .filter(c => !q || (c.nombre + ' ' + c.id + ' ' + c.contacto + ' ' + c.telefono).toLowerCase().includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  document.getElementById('cobClientes').innerHTML = lista.length
    ? lista.map(c => `
      <tr data-status="${c.bloqueado ? 'overdue' : c.dias !== null && c.dias <= 7 ? 'pending' : 'paid'}">
        <td class="td-name">${escHtml(c.nombre)} <span class="cob-muted">${escHtml(c.id)}</span></td>
        <td>${chipSistema(c.sistema)}</td>
        <td class="td-amount">${fmtAmount(Number(c.valor) || 0)} <span class="cob-muted">${c.plan === 'anual' ? '/ año' : '/ mes'}</span></td>
        <td class="cob-muted">Hasta ${escHtml(fechaCorta(c.vence))}</td>
        <td class="cob-muted">Gracia ${plural(c.gracia, 'día', 'días')}${c.gracia_dias === '' ? '' : ' (propia)'}</td>
        <td>${estadoDe(c)}</td>
        <td class="td-actions">
          <button class="btn-add" onclick="cobAbrirPago(${c._i})">Pago</button>
          <button class="btn-cancel" onclick="cobAbrirCliente(${c._i})">Editar</button>
        </td>
      </tr>`).join('')
    : filaVacia(7, q ? 'Ningún cliente coincide.' : 'Aún no hay clientes.');
}

function pintarSistemas() {
  const s = state.cob.sistemas;
  document.getElementById('cobSistemas').innerHTML = s.length
    ? s.map((x, i) => `
      <tr data-status="${x.activo === 'no' ? 'pending' : 'paid'}">
        <td class="td-name">${escHtml(x.nombre)}</td>
        <td class="cob-muted">${escHtml(x.id)}</td>
        <td class="cob-muted">Gracia ${escHtml(x.gracia_dias)} días</td>
        <td class="cob-muted">${plural(state.cob.clientes.filter(c => c.sistema === x.id).length, 'cliente', 'clientes')}</td>
        <td>${x.activo === 'no' ? badge('pendiente', 'Oculto') : badge('pagada', 'Activo')}</td>
        <td class="td-actions"><button class="btn-cancel" onclick="cobAbrirSistema(${i})">Editar</button></td>
      </tr>`).join('')
    : filaVacia(6, 'Aún no hay sistemas.');
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

let editCliente = null;
export function cobAbrirCliente(i) {
  const c = state.cob.clientes[i] || null;
  editCliente = c;
  const sel = document.getElementById('ccSistema');
  sel.innerHTML = state.cob.sistemas.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.nombre)}</option>`).join('');
  sel.value = c ? c.sistema : (val('cobFiltro') || (state.cob.sistemas[0] || {}).id || '');
  sel.disabled = !!c;
  document.getElementById('ccId').disabled = !!c;
  document.getElementById('cobClienteTitulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
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
