// ── CollectTrack + MACIA — Google Apps Script ───────────────────────────────
// Pegar en: Google Sheets → Extensiones → Apps Script → reemplazar TODO
//
// Despliegue (cada cambio al código requiere versión nueva):
//   1. Guardar (Ctrl+S)
//   2. Implementar (Deploy) → Administrar implementaciones (Manage deployments)
//   3. En la implementación activa → Editar (lápiz ✏️)
//   4. Versión → "Versión nueva" (New version)
//   5. Quién tiene acceso → "Cualquier usuario" (Anyone)
//   6. Implementar (Deploy) → Listo
//
//   ⚠ Usa Editar → Versión nueva sobre la implementación EXISTENTE para que la
//   URL (API_URL) NO cambie. Si creas una "Implementación nueva", la URL cambia
//   y habría que actualizarla en index.html.
//
// Hojas y columnas esperadas (fila 1 = encabezados):
//   cobros:      NAME | CATEGORY | AMOUNT | DATE | PAID
//   pagos:       CATEGORY | AMOUNT | DATE | PAID
//   macia:       ID | DATE | CONCEPT | AMOUNT | TYPE | ACCOUNT | OBSERVATIONS | CREATED_AT
//   deudas:      ID | PERSON | DATE | AMOUNT | TYPE | NOTE | STATUS | CREATED_AT
//   macia_audit: ID | ACTION | DETAIL | TIMESTAMP
//
// CENTRAL DE COBROS (pestañas que se crean solas, ver instalarCobros):
//   sistemas · clientes · cobros_pagos · cobros_reportes
// ─────────────────────────────────────────────────────────────────────────────

const SS = SpreadsheetApp.getActiveSpreadsheet();

// Orden de columnas para escritura por hoja.
const SHEET_COLS = {
  cobros:      ['NAME', 'CATEGORY', 'AMOUNT', 'DATE', 'PAID'],
  pagos:       ['CATEGORY', 'AMOUNT', 'DATE', 'PAID'],
  macia:       ['ID', 'DATE', 'CONCEPT', 'AMOUNT', 'TYPE', 'ACCOUNT', 'OBSERVATIONS', 'CREATED_AT'],
  deudas:      ['ID', 'PERSON', 'DATE', 'AMOUNT', 'TYPE', 'NOTE', 'STATUS', 'CREATED_AT'],
  macia_audit: ['ID', 'ACTION', 'DETAIL', 'TIMESTAMP'],
};

// ── GET (JSONP) — lectura Y escritura ────────────────────────────────────────
// Apps Script no envía cabeceras CORS, por lo que un fetch() cross-origin queda
// bloqueado. JSONP (carga vía <script>) no está sujeto a CORS, así que TODA la
// comunicación —incluidas las mutaciones— pasa por aquí con ?action=...
function doGet(e) {
  const cb     = e.parameter.callback;
  const action = e.parameter.action;

  // Aprobar desde el correo: responde una página, no JSON.
  if (action === 'cobAprobar') return cobAprobarCorreo_(e.parameter);

  let result;
  try {
    if (COB_ACCIONES.hasOwnProperty(action)) {
      result = cobRouter_(action, e.parameter);
    } else if (action) {
      // Mutación: serializa con un lock para evitar condiciones de carrera.
      const lock = LockService.getScriptLock();
      lock.tryLock(10000);
      try {
        result = handleMutation(action, e.parameter);
      } finally {
        lock.releaseLock();
      }
    } else {
      result = readSheet(e.parameter.sheet || 'cobros');
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  const json = JSON.stringify(result);
  return ContentService
    .createTextOutput(cb ? `${cb}(${json})` : json)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// Enruta una mutación (create/update/delete/setPaid) recibida por GET o POST.
function handleMutation(action, p) {
  const sheet = p.sheet;
  if      (action === 'create')  return rowCreate(sheet, p);
  else if (action === 'update')  return rowUpdate(sheet, p);
  else if (action === 'delete')  return rowDelete(sheet, p);
  else if (action === 'setPaid') return rowSetPaid(sheet, p);
  return { ok: false, error: 'Acción desconocida: ' + action };
}

// ── POST (CRUD) ──────────────────────────────────────────────────────────────
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResp({ ok: false, error: 'JSON inválido' });
  }

  if (COB_ACCIONES.hasOwnProperty(payload.action)) {
    try {
      return jsonResp(cobRouter_(payload.action, payload));
    } catch (err) {
      return jsonResp({ ok: false, error: err.message });
    }
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    return jsonResp(handleMutation(payload.action, payload));
  } catch (err) {
    return jsonResp({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ── READ ─────────────────────────────────────────────────────────────────────
function readSheet(name) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).toUpperCase().trim());

  return data.slice(1)
    .map((row, i) => {
      const obj = { _row: i + 2 }; // fila real en Sheets (1-based, +1 por header)
      headers.forEach((h, j) => { obj[h] = row[j] !== undefined ? row[j] : ''; });
      return obj;
    })
    .filter(r => headers.some(h => r[h] !== '' && r[h] !== null && r[h] !== undefined));
}

// Mapea encabezado (mayúsculas) → columna 1-based, leyendo la fila 1 real.
// Create/update escriben por este mapa en vez de por la posición asumida en
// SHEET_COLS: si el orden físico de columnas en la hoja no coincide con
// SHEET_COLS, escribir por posición fija mezcla los valores entre columnas
// (p. ej. AMOUNT y CATEGORY intercambiados).
function getHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).toUpperCase().trim());
  const map = {};
  headers.forEach((h, j) => { if (h) map[h] = j + 1; }); // 1-based
  return map;
}

// ── RESOLVER FILA OBJETIVO ───────────────────────────────────────────────────
// El cliente manda _row, pero puede estar desfasado (otra fila se borró antes
// y las de abajo subieron, o la caché es vieja). Antes de tocar la fila se
// verifica que sea el registro correcto:
//   - macia/deudas: por ID.
//   - cobros/pagos: por _mNAME/_mCATEGORY + _mAMOUNT (valores previos).
// Si _row no coincide se busca el registro; si no aparece → error (mejor no
// tocar nada que borrar/editar el equivocado). Sin datos de verificación
// (clientes viejos) se usa _row tal cual.
function resolveTargetRow(sheet, p) {
  const rowNum = Number(p._row);
  const colMap = getHeaderMap(sheet);
  const last   = sheet.getLastRow();
  const norm   = v => String(v == null ? '' : v).trim().toLowerCase();
  const digits = v => String(v == null ? '' : v).replace(/[^\d]/g, '');

  let checks = [];
  if (p.ID && colMap['ID']) {
    checks = [['ID', norm(p.ID), norm]];
  } else if (p._mAMOUNT !== undefined && colMap['AMOUNT']) {
    checks.push(['AMOUNT', digits(p._mAMOUNT), digits]);
    if (p._mNAME     !== undefined && colMap['NAME'])     checks.push(['NAME',     norm(p._mNAME),     norm]);
    if (p._mCATEGORY !== undefined && colMap['CATEGORY']) checks.push(['CATEGORY', norm(p._mCATEGORY), norm]);
  }
  if (!checks.length) return rowNum;
  if (last < 2) throw new Error('Registro no encontrado, actualiza');

  const lastCol = sheet.getLastColumn();
  const data    = sheet.getRange(2, 1, last - 1, lastCol).getValues();
  const matches = r => checks.every(([col, want, f]) => f(data[r - 2][colMap[col] - 1]) === want);

  if (rowNum >= 2 && rowNum <= last && matches(rowNum)) return rowNum;

  // Legacy macia/deudas: fila sin ID en la hoja (el cliente generó uno local).
  if (p.ID && rowNum >= 2 && rowNum <= last && norm(data[rowNum - 2][colMap['ID'] - 1]) === '') return rowNum;

  // Busca la coincidencia más cercana a _row (desfase típico: 1–2 filas).
  let best = null;
  for (let r = 2; r <= last; r++) {
    if (matches(r) && (best === null || Math.abs(r - rowNum) < Math.abs(best - rowNum))) best = r;
  }
  if (best === null) throw new Error('Registro no encontrado, actualiza');
  return best;
}

// ── CREATE ───────────────────────────────────────────────────────────────────
function rowCreate(sheetName, p) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: 'Hoja no encontrada: ' + sheetName };

  const cols = SHEET_COLS[sheetName];
  if (!cols)  return { ok: false, error: 'Hoja no configurada: ' + sheetName };

  const colMap  = getHeaderMap(sheet);
  const rowNum  = sheet.getLastRow() + 1;
  // Los parámetros llegan como texto (JSONP/GET); AMOUNT debe quedar numérico.
  cols.forEach(col => {
    if (!colMap[col]) return;
    let v = p[col] !== undefined ? p[col] : '';
    if (col === 'AMOUNT' && v !== '') v = Number(v) || 0;
    sheet.getRange(rowNum, colMap[col]).setValue(v);
  });
  return { ok: true, _row: rowNum };
}

// ── UPDATE ───────────────────────────────────────────────────────────────────
function rowUpdate(sheetName, p) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet)  return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  if (!p._row) return { ok: false, error: '_row requerido' };

  const cols = SHEET_COLS[sheetName];
  if (!cols)  return { ok: false, error: 'Hoja no configurada: ' + sheetName };

  const colMap = getHeaderMap(sheet);
  const rowNum = resolveTargetRow(sheet, p);
  cols.forEach(col => {
    // ID y CREATED_AT no se sobreescriben en una edición.
    if (col === 'ID' || col === 'CREATED_AT') return;
    if (p[col] === undefined) return;
    if (!colMap[col]) return;
    let v = p[col];
    if (col === 'AMOUNT' && v !== '') v = Number(v) || 0;
    sheet.getRange(rowNum, colMap[col]).setValue(v);
  });

  return { ok: true };
}

// ── DELETE ───────────────────────────────────────────────────────────────────
function rowDelete(sheetName, p) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet)  return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  if (!p._row) return { ok: false, error: '_row requerido' };

  sheet.deleteRow(resolveTargetRow(sheet, p));
  return { ok: true };
}

// ── SET PAID ─────────────────────────────────────────────────────────────────
// Marca el periodo ("YYYY-MM") en que se pagó la fila, o '' para limpiar.
function rowSetPaid(sheetName, p) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet)  return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  if (!p._row) return { ok: false, error: '_row requerido' };

  const col = getOrCreatePaidCol(sheet);
  sheet.getRange(resolveTargetRow(sheet, p), col).setValue(p.PAID || '');
  return { ok: true };
}

// ── Localiza la columna "PAID" por encabezado; la crea al final si falta ──────
function getOrCreatePaidCol(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).toUpperCase().trim());
  const idx = headers.indexOf('PAID');
  if (idx !== -1) return idx + 1;        // 1-based
  const col = lastCol + 1;
  sheet.getRange(1, col).setValue('PAID');
  return col;
}

// ── HELPER ───────────────────────────────────────────────────────────────────
function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── SEED MACIA (ejecutar UNA vez desde el editor: seleccionar seedMacia → ▶) ──
// Limpia la hoja "macia" (deja el encabezado) y carga el historial completo.
// Corre del lado del servidor: sin CORS, sin timeouts, sin duplicados.
// Monto negativo = egreso, positivo = ingreso. Todo en cuenta Nu.
function seedMacia() {
  const sheet = SS.getSheetByName('macia');
  if (!sheet) throw new Error('No existe la hoja "macia"');

  // 1. Borra todas las filas de datos (conserva la fila 1 de encabezados).
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  // 2. Historial [fecha, concepto, monto con signo].
  const REGS = [
    ['2025-03-05','adelanto desarrollo jdt',2000000],['2025-03-01','clickfunnels',-402000],['2025-03-01','chatgpt',-86000],['2025-03-01','sueldo miguel',-1600000],['2025-03-07','transferencia a 3164533392',-1000000],
    ['2025-05-02','pago desarrollo + mante y plataforma',3200000],['2025-05-01','chatgpt',-86000],['2025-04-01','clickfunnels',-420000],['2025-06-01','Suscripcion sitio web JDT',400000],['2025-06-01','chatgpt',-86000],
    ['2025-07-01','certificados jdt',600000],['2025-07-01','sueldo miguel',-400000],['2025-07-01','chatgpt',-86000],['2025-07-01','Suscripcion sitio web JDT',400000],['2025-07-31','odoo',-4409588],
    ['2025-08-01','chatgpt',-83000],['2025-08-01','miguel camacho aporte',1489588],['2025-09-01','Mantenimiento BOLIGLOBOS',400000],['2025-09-01','chatgpt',-80000],
    ['2025-10-01','Mantenimiento BOLIGLOBOS',400000],['2025-10-01','almacenamiento drive',-75500],['2025-10-01','Plataforma JDT',400000],['2025-10-01','dominio macia',-61000],['2025-10-01','chatgpt',-81000],
    ['2025-11-01','chatgpt',-81000],['2025-11-01','Plataforma JDT',400000],['2025-12-01','Plataforma JDT',400000],['2025-12-01','Claude',-80000],
    ['2026-01-01','Claude',-80000],['2026-01-01','Mantenimiento JDT',410000],['2026-01-01','Plataforma JDT',400000],['2026-01-01','Certificado resina JDT',100000],['2026-01-01','Mantenimiento BOLIGLOBOS',410000],['2026-01-01','Sueldo miguel cuellar',-1750000],['2026-01-01','Montajes JDT',4000000],['2026-01-01','20% miguel cuellar',-698000],['2026-01-01','80% miguel camacho',-2792000],
    ['2026-02-01','Claude',-80000],['2026-02-01','Biaticos',-125000],['2026-02-01','Mantenimiento JDT',410000],['2026-02-01','Plataforma JDT',400000],['2026-02-01','Certificado resina JDT',100000],['2026-02-01','Mantenimiento BOLIGLOBOS',410000],['2026-02-01','Montajes JDT',3500000],['2026-02-01','Sueldo miguel cuellar',-1750000],['2026-02-01','20% miguel cuellar',-573000],['2026-02-01','80% miguel camacho',-2292000],
    ['2026-03-01','Claude',-80000],['2026-03-01','Plataforma JDT',910000],['2026-03-01','Mantenimiento BOLIGLOBOS',410000],['2026-03-01','Montajes JDT',1100000],['2026-03-01','Sueldo miguel cuellar',-1750000],['2026-03-01','20% miguel cuellar',-118000],['2026-03-01','80% miguel camacho',-472000],
    ['2026-04-01','Mantenimiento BOLIGLOBOS',410000],['2026-04-01','Claude',-80000],['2026-04-01','Plataforma JDT',910000],['2026-04-01','Dominio JDT',-180000],['2026-04-01','Montajes JDT',1100000],['2026-04-01','Sueldo miguel cuellar',-1750000],['2026-04-01','20% miguel cuellar',-118000],['2026-04-01','80% miguel camacho',-472000],['2026-04-01','Dominio JDT',180000],
    ['2026-05-01','Mantenimiento BOLIGLOBOS',410000],['2026-05-01','Claude',-80000],['2026-05-01','Plataforma JDT',910000],['2026-05-01','Montajes JDT',1250000],['2026-05-01','Sueldo miguel cuellar',-1750000],['2026-05-01','20% miguel cuellar',-148000],['2026-05-01','80% miguel camacho',-592000],
  ];

  // 3. Arma la matriz según el orden de columnas y escribe todo de una vez.
  const now = new Date().toISOString();
  const rows = REGS.map((r, i) => {
    const [date, concept, amt] = r;
    const id = Utilities.getUuid();
    // ID | DATE | CONCEPT | AMOUNT | TYPE | ACCOUNT | OBSERVATIONS | CREATED_AT
    return [id, date, concept, Math.abs(amt), amt < 0 ? 'egreso' : 'ingreso', 'nu', '', now];
  });

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  // 4. Registra el evento en auditoría.
  const audit = SS.getSheetByName('macia_audit');
  if (audit) {
    audit.appendRow([Utilities.getUuid(), 'import_csv',
      rows.length + ' movimientos cargados — historial CUENTAS MACIA (todo en Nu)', now]);
  }

  return rows.length + ' filas cargadas en "macia"';
}

// ══════════════════════════════════════════════════════════════════════════
// CENTRAL DE COBROS · cobra la mensualidad de todos los sistemas (SaaS)
// ══════════════════════════════════════════════════════════════════════════
// Cada SISTEMA (MesaDirecta, …) tiene su clave y su gracia_dias. Cada CLIENTE
// puede tener su propia gracia_dias (vacía = la del sistema).
//   gracia N → se bloquea N días después de vencer (0 = el mismo día).
//
// Sistemas (con su clave):
//   ?action=estado&sistema=S&clave=K&cliente=C      → { activo, vence, dias, gracia, bloqueado }
//   ?action=enlacePago&sistema=S&clave=K&cliente=C  → { url } a /pagar (vale COB_ENLACE_HORAS)
// Cliente (con el enlace):
//   ?action=miCuenta&t=T                            → plan, precios, pagado_hasta, pendiente
//   POST { action:"reportarPago", t, monto, plan, comprobante, nota }
// Panel (con la clave del panel, k):
//   cobListar · cobGuardarSistema · cobGuardarCliente · cobRegistrarPago · cobResolver
// Correo:
//   ?action=cobAprobar&id=ID&f=FIRMA                → aprueba con 1 clic
//
// ⚙️ Primera vez: correr instalarCobros() desde el editor (▷ Ejecutar) y aceptar
// los permisos. En el registro de ejecución quedan la clave del panel y la de
// MesaDirecta. Luego: Implementar → Administrar → Editar → Versión nueva.

// ⚠ Dirección de la página de pago de CollectTrack (tu dominio de Vercel + /pagar).
const COB_PAGAR_URL = 'https://collect-track.vercel.app/pagar';
const MESADIRECTA_DIRECTORIO_ID = '1mq1XWd9NzX88qzv9ph9JG2wGVl9Lln2PQpchrqAm1AI';

const COB_TABS = {
  sistemas:        ['id', 'nombre', 'clave', 'gracia_dias', 'activo'],
  clientes:        ['id', 'sistema', 'nombre', 'contacto', 'telefono', 'plan', 'precio', 'pagado_hasta', 'gracia_dias', 'estado'],
  cobros_pagos:    ['id', 'fecha', 'sistema', 'cliente', 'nombre', 'monto', 'plan', 'hasta', 'nota'],
  cobros_reportes: ['id', 'fecha', 'sistema', 'cliente', 'nombre', 'monto', 'plan', 'comprobante', 'nota', 'estado'],
};
const COB_NUM = ['monto', 'precio'];               // el resto se guarda como texto
const COB_PLANES = { mensual: 1, anual: 12 };      // meses que cubre cada plan
const COB_PRECIOS = { mensual: 70000, anual: 600000 };
const COB_GRACIA = 7;                              // si el sistema no trae la suya
const COB_ENLACE_HORAS = 24;
const COB_COMPROBANTES = 'Central · Comprobantes';
const COB_COMPROBANTE_MAX = 4 * 1024 * 1024;
const COB_TZ = 'America/Bogota';
const COB_MAX_FALLOS = 10;                         // claves erradas → 10 min bloqueado

// true = escribe (va con lock).
const COB_ACCIONES = {
  estado: false, enlacePago: false, miCuenta: false, reportarPago: true,
  cobListar: false, cobGuardarSistema: true, cobGuardarCliente: true,
  cobRegistrarPago: true, cobResolver: true,
};

function cobRouter_(action, p) {
  if (!COB_ACCIONES[action]) return cobAccion_(action, p);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'ocupado, intenta de nuevo' };
  try {
    return cobAccion_(action, p);
  } finally {
    lock.releaseLock();
  }
}

function cobAccion_(action, p) {
  if (action === 'estado')       return cobEstado_(p);
  if (action === 'enlacePago')   return cobEnlacePago_(p);
  if (action === 'miCuenta')     return cobMiCuenta_(cobLeerEnlace_(p.t));
  if (action === 'reportarPago') return cobReportarPago_(cobLeerEnlace_(p.t), p);
  cobSoloPanel_(p.k);
  if (action === 'cobListar')         return cobListar_();
  if (action === 'cobGuardarSistema') return cobGuardarSistema_(p);
  if (action === 'cobGuardarCliente') return cobGuardarCliente_(p);
  if (action === 'cobRegistrarPago')  return cobRegistrarPago_(p);
  if (action === 'cobResolver')       return cobResolver_(p.id, String(p.aprobar) === 'true');
  return { ok: false, error: 'acción desconocida' };
}

// ── Acceso ───────────────────────────────────────────────────────────────────
function cobProps_() { return PropertiesService.getScriptProperties(); }
function cobAleatorio_(n) {
  let s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
function cobSecreto_() {
  let s = cobProps_().getProperty('COBROS_SECRETO');
  if (!s) { s = cobAleatorio_(48); cobProps_().setProperty('COBROS_SECRETO', s); }
  return s;
}
function cobFirma_(txt) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(txt, cobSecreto_())).replace(/=+$/, '');
}
// Cuenta intentos fallidos por llave; demasiados → bloqueado 10 min.
function cobIntento_(llave, ok) {
  const c = CacheService.getScriptCache();
  const kf = 'cobfail:' + llave;
  const n = Number(c.get(kf) || 0);
  if (n >= COB_MAX_FALLOS) throw new Error('demasiados intentos, espera 10 minutos');
  if (ok) { if (n) c.remove(kf); return; }
  c.put(kf, String(n + 1), 600);
  throw new Error('clave incorrecta');
}
function cobSoloPanel_(k) {
  const clave = cobProps_().getProperty('COBROS_ADMIN');
  cobIntento_('panel', !!clave && String(k || '') === clave);
}
function cobSistemaAuth_(id, clave) {
  const s = cobFila_('sistemas', function (r) { return r.id === String(id || '').trim(); });
  cobIntento_('sis:' + id, !!s && !!s.clave && String(clave || '') === s.clave);
  return s;
}

// Enlace de pago: sistema|cliente|vence firmado. Nadie puede armar uno a mano.
function cobEnlacePago_(p) {
  const s = cobSistemaAuth_(p.sistema, p.clave);
  const c = cobCliente_(s.id, p.cliente);
  if (!c) return { ok: false, error: 'cliente no existe' };
  const base = Utilities.base64EncodeWebSafe(s.id + '|' + c.id + '|' + (Date.now() + COB_ENLACE_HORAS * 3600000));
  return { ok: true, url: COB_PAGAR_URL + '?t=' + encodeURIComponent(base + '.' + cobFirma_(base)) };
}
function cobLeerEnlace_(t) {
  const partes = String(t || '').split('.');
  if (partes.length !== 2 || cobFirma_(partes[0]) !== partes[1]) throw new Error('enlace inválido');
  const d = Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString().split('|');
  if (Number(d[2]) < Date.now()) throw new Error('enlace vencido');
  const s = cobFila_('sistemas', function (r) { return r.id === d[0]; });
  const c = s && cobCliente_(s.id, d[1]);
  if (!c) throw new Error('enlace inválido');
  return { s: s, c: c };
}

// ── Hojas ────────────────────────────────────────────────────────────────────
function cobSheet_(name) {
  let sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  const cols = COB_TABS[name];
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const faltan = cols.filter(function (c) { return h.indexOf(c) === -1; });
  if (faltan.length) {
    const desde = h.filter(String).length + 1;
    sh.getRange(1, desde, 1, faltan.length).setValues([faltan]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function cobTexto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, COB_TZ, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
function cobFilas_(name) {
  const values = cobSheet_(name).getDataRange().getValues();
  const h = values[0].map(String);
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const o = { _r: i + 1 };
    h.forEach(function (k, c) { if (k) o[k] = COB_NUM.indexOf(k) !== -1 ? Number(values[i][c]) || 0 : cobTexto_(values[i][c]); });
    if (o.id) out.push(o);
  }
  return out;
}
function cobFila_(name, fn) { return cobFilas_(name).filter(fn)[0] || null; }
function cobCliente_(sistema, id) {
  return cobFila_('clientes', function (r) { return r.sistema === sistema && r.id === String(id || '').trim(); });
}
// Escribe los campos de `o` en la fila r (o al final si r falta).
function cobEscribir_(name, o, r) {
  const sh = cobSheet_(name);
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const fila = r || sh.getLastRow() + 1;
  const rango = sh.getRange(fila, 1, 1, h.length);
  const actual = r ? rango.getValues()[0] : h.map(function () { return ''; });
  rango.setNumberFormats([h.map(function (k) { return COB_NUM.indexOf(k) !== -1 ? 'General' : '@'; })]);
  rango.setValues([h.map(function (k, c) { return o[k] !== undefined ? o[k] : actual[c]; })]);
  return fila;
}

// ── Fechas ───────────────────────────────────────────────────────────────────
function cobHoy_() { return Utilities.formatDate(new Date(), COB_TZ, 'yyyy-MM-dd'); }
function cobFechaOk_(f) { return /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')); }
function cobDias_(f) {
  const a = cobHoy_().split('-').map(Number);
  const b = String(f).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
// Suma meses a "yyyy-MM-dd" (31 ene + 1 mes = 28/29 feb).
function cobSumarMeses_(f, n) {
  const a = String(f).split('-').map(Number);
  const ultimo = new Date(Date.UTC(a[0], a[1] - 1 + n + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(a[0], a[1] - 1 + n, Math.min(a[2], ultimo)));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

// ── Reglas ───────────────────────────────────────────────────────────────────
function cobGracia_(c, s) {
  if (c.gracia_dias !== '') return Math.max(0, Number(c.gracia_dias) || 0);
  if (s && s.gracia_dias !== '') return Math.max(0, Number(s.gracia_dias) || 0);
  return COB_GRACIA;
}
function cobPlan_(c) { return COB_PLANES[c.plan] ? c.plan : 'mensual'; }
function cobPrecio_(c) { return Number(c.precio) || COB_PRECIOS[cobPlan_(c)]; }

// Estado de un cliente según su regla. Sin fecha de pago → no se bloquea.
function cobCalc_(c, s) {
  const gracia = cobGracia_(c, s);
  const vence = cobFechaOk_(c.pagado_hasta) ? c.pagado_hasta : '';
  const dias = vence ? cobDias_(vence) : null;
  const activo = c.estado !== 'pausado';
  const vencido = vence !== '' && dias <= -gracia;
  return { activo: activo, vence: vence, dias: dias, gracia: gracia, bloqueado: !activo || vencido };
}

function cobEstado_(p) {
  const s = cobSistemaAuth_(p.sistema, p.clave);
  const c = cobCliente_(s.id, p.cliente);
  if (!c) return { ok: false, error: 'cliente no existe' };
  return Object.assign({ ok: true }, cobCalc_(c, s));
}

// Registra un pago y corre la fecha 1 o 12 meses. Si aún no estaba bloqueado se
// cuenta desde su vencimiento; si ya estaba bloqueado o sin fecha, desde hoy.
function cobRegistrarPago_(p) {
  const s = cobFila_('sistemas', function (r) { return r.id === String(p.sistema || ''); });
  const c = s && cobCliente_(s.id, p.cliente);
  if (!c) return { ok: false, error: 'cliente no existe' };
  const plan = COB_PLANES[p.plan] ? p.plan : cobPlan_(c);
  const monto = Math.max(0, Number(p.monto) || 0);
  if (!monto) return { ok: false, error: 'falta el valor del pago' };
  const e = cobCalc_(c, s);
  const desde = e.vence && e.dias > -e.gracia ? e.vence : cobHoy_();
  const hasta = cobSumarMeses_(desde, COB_PLANES[plan]);

  const fila = { id: Utilities.getUuid(), fecha: cobHoy_(), sistema: s.id, cliente: c.id, nombre: c.nombre, monto: monto, plan: plan, hasta: hasta, nota: String(p.nota || '').trim().slice(0, 200) };
  cobEscribir_('cobros_pagos', fila);
  cobEscribir_('clientes', { pagado_hasta: hasta, plan: plan }, c._r);
  return { ok: true, pago: fila };
}

// ── Pago que reporta el cliente ──────────────────────────────────────────────
function cobPendiente_(sistema, cliente) {
  return cobFila_('cobros_reportes', function (r) { return r.sistema === sistema && r.cliente === cliente && r.estado === 'pendiente'; });
}

function cobMiCuenta_(x) {
  const c = x.c;
  const plan = cobPlan_(c);
  const pend = cobPendiente_(x.s.id, c.id);
  return {
    ok: true,
    nombre: c.nombre,
    sistema: x.s.nombre,
    plan: plan,
    precios: { mensual: plan === 'anual' ? COB_PRECIOS.mensual : cobPrecio_(c), anual: plan === 'anual' ? cobPrecio_(c) : COB_PRECIOS.anual },
    pagado_hasta: cobFechaOk_(c.pagado_hasta) ? c.pagado_hasta : '',
    pendiente: pend ? { fecha: pend.fecha, monto: pend.monto } : null,
  };
}

function cobReportarPago_(x, p) {
  const plan = COB_PLANES[p.plan] ? p.plan : 'mensual';
  const monto = Math.max(0, Number(p.monto) || 0);
  if (!monto) return { ok: false, error: 'falta el valor del pago' };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(p.comprobante || ''));
  if (!m) return { ok: false, error: 'falta la foto del comprobante' };
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > COB_COMPROBANTE_MAX) return { ok: false, error: 'la foto es muy pesada' };

  const fecha = cobHoy_();
  const it = DriveApp.getFoldersByName(COB_COMPROBANTES);
  const carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(COB_COMPROBANTES);
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, m[1], '[' + x.s.id + ' · ' + x.c.id + '] ' + fecha + '.' + ext));

  const fila = { id: Utilities.getUuid(), fecha: fecha, sistema: x.s.id, cliente: x.c.id, nombre: x.c.nombre, monto: monto, plan: plan, comprobante: archivo.getUrl(), nota: String(p.nota || '').trim().slice(0, 200), estado: 'pendiente' };
  cobEscribir_('cobros_reportes', fila);
  cobAvisar_(fila, x.s);
  return { ok: true, reporte: { fecha: fecha, monto: monto } };
}

function cobEsc_(t) {
  return String(t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
}

// Correo al dueño del script con el botón de aprobar.
function cobAvisar_(f, s) {
  try {
    const plata = '$' + Number(f.monto).toLocaleString('es-CO');
    const link = ScriptApp.getService().getUrl() + '?action=cobAprobar&id=' + encodeURIComponent(f.id) + '&f=' + cobFirma_('aprobar|' + f.id);
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: '💰 Pago reportado · ' + f.nombre + ' (' + s.nombre + ') · ' + plata,
      body: f.nombre + ' (' + s.nombre + ') reportó un pago de ' + plata + ' · plan ' + f.plan + '.\n\n' +
        'Comprobante: ' + f.comprobante + '\n' + (f.nota ? 'Nota: ' + f.nota + '\n' : '') +
        '\nRevisa que llegó a tu Nu y aprueba aquí: ' + link,
      htmlBody: '<p><b>' + cobEsc_(f.nombre) + '</b> (' + cobEsc_(s.nombre) + ') reportó un pago de <b>' + plata + '</b> · plan ' + cobEsc_(f.plan) + '.</p>' +
        '<p><a href="' + cobEsc_(f.comprobante) + '">Ver comprobante</a></p>' + (f.nota ? '<p>Nota: ' + cobEsc_(f.nota) + '</p>' : '') +
        '<p>Revisa que llegó a tu Nu y luego:</p>' +
        '<p><a href="' + link + '" style="background:#13e7c3;color:#080808;padding:12px 22px;border-radius:8px;font-weight:700;text-decoration:none;display:inline-block">✓ Aprobar pago</a></p>' +
        '<p style="color:#888;font-size:12px">Para rechazarlo, entra al panel de cobros de CollectTrack.</p>',
    });
  } catch (e) {
    console.error('no se pudo enviar el correo: ' + e); // el reporte igual queda guardado
  }
}

function cobAprobarCorreo_(p) {
  let msg;
  try {
    if (!p.id || cobFirma_('aprobar|' + p.id) !== String(p.f || '')) throw new Error('enlace inválido');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('ocupado, vuelve a abrir el enlace');
    let res;
    try { res = cobResolver_(p.id, true); } finally { lock.releaseLock(); }
    msg = res.ok ? '✓ Pago aprobado. Pagado hasta el ' + res.pago.hasta + '.' : res.error;
  } catch (e) {
    msg = e.message;
  }
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:sans-serif;max-width:420px;margin:60px auto;padding:0 16px;text-align:center;font-size:18px">' + cobEsc_(msg) + '</div>'
  ).setTitle('Central de cobros');
}

// Aprobar = registra el pago (corre la fecha); rechazar = solo lo marca.
function cobResolver_(id, aprobar) {
  const rep = cobFila_('cobros_reportes', function (r) { return r.id === String(id); });
  if (!rep) return { ok: false, error: 'pago no encontrado' };
  if (rep.estado !== 'pendiente') return { ok: false, error: 'ese pago ya fue revisado (' + rep.estado + ')' };
  let res = { ok: true };
  if (aprobar) {
    res = cobRegistrarPago_({ sistema: rep.sistema, cliente: rep.cliente, monto: rep.monto, plan: rep.plan, nota: 'Bre-B · reportado por el cliente' });
    if (!res.ok) return res;
  }
  cobEscribir_('cobros_reportes', { estado: aprobar ? 'aprobado' : 'rechazado' }, rep._r);
  return Object.assign(res, { estado: aprobar ? 'aprobado' : 'rechazado' });
}

// ── Panel ────────────────────────────────────────────────────────────────────
function cobLimpia_(o) { const c = Object.assign({}, o); delete c._r; return c; }

function cobListar_() {
  const sistemas = cobFilas_('sistemas');
  const porId = {};
  sistemas.forEach(function (s) { porId[s.id] = s; });
  const clientes = cobFilas_('clientes').map(function (c) {
    return Object.assign(cobLimpia_(c), cobCalc_(c, porId[c.sistema]), { valor: cobPrecio_(c), plan: cobPlan_(c) });
  });
  return {
    ok: true,
    hoy: cobHoy_(),
    sistemas: sistemas.map(cobLimpia_),
    clientes: clientes,
    reportes: cobFilas_('cobros_reportes').map(cobLimpia_).reverse().slice(0, 100),
  };
}

function cobSlug_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function cobGraciaTxt_(v) {
  const t = String(v == null ? '' : v).trim();
  return t === '' ? '' : String(Math.max(0, Math.round(Number(t) || 0)));
}

function cobGuardarSistema_(p) {
  const nombre = String(p.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'falta el nombre' };
  const id = String(p.id || '').trim() || cobSlug_(nombre);
  if (!id) return { ok: false, error: 'nombre inválido' };
  const s = cobFila_('sistemas', function (r) { return r.id === id; });
  if (p.nuevo === 'true' && s) return { ok: false, error: 'ya existe un sistema con ese nombre' };
  const o = { id: id, nombre: nombre, gracia_dias: cobGraciaTxt_(p.gracia_dias) || String(COB_GRACIA), activo: p.activo === 'no' ? 'no' : 'si' };
  if (!s || p.nuevaClave === 'true') o.clave = cobAleatorio_(32);
  cobEscribir_('sistemas', o, s ? s._r : null);
  return { ok: true };
}

function cobGuardarCliente_(p) {
  const sistema = String(p.sistema || '').trim();
  if (!cobFila_('sistemas', function (r) { return r.id === sistema; })) return { ok: false, error: 'sistema no existe' };
  const id = String(p.id || '').trim();
  const nombre = String(p.nombre || '').trim();
  if (!id || !nombre) return { ok: false, error: 'faltan el código o el nombre' };
  const c = cobCliente_(sistema, id);
  if (p.nuevo === 'true' && c) return { ok: false, error: 'ese cliente ya existe en el sistema' };
  if (p.pagado_hasta && !cobFechaOk_(p.pagado_hasta)) return { ok: false, error: 'fecha inválida' };
  const o = {
    id: id, sistema: sistema, nombre: nombre,
    contacto: String(p.contacto || '').trim(), telefono: String(p.telefono || '').trim(),
    plan: COB_PLANES[p.plan] ? p.plan : 'mensual',
    precio: Math.max(0, Number(p.precio) || 0) || '',
    pagado_hasta: String(p.pagado_hasta || ''),
    gracia_dias: cobGraciaTxt_(p.gracia_dias),
    estado: p.estado === 'pausado' ? 'pausado' : 'activo',
  };
  cobEscribir_('clientes', o, c ? c._r : null);
  return { ok: true };
}

// ── Instalación (correr 1 vez desde el editor) ───────────────────────────────
// Crea las pestañas, la clave del panel, el sistema MesaDirecta y copia sus
// restaurantes, pagos y reportes. Se puede volver a correr: no duplica nada.
function instalarCobros() {
  Object.keys(COB_TABS).forEach(cobSheet_);
  cobSecreto_();
  let admin = cobProps_().getProperty('COBROS_ADMIN');
  if (!admin) { admin = cobAleatorio_(12); cobProps_().setProperty('COBROS_ADMIN', admin); }

  let md = cobFila_('sistemas', function (r) { return r.id === 'mesadirecta'; });
  if (!md) {
    cobEscribir_('sistemas', { id: 'mesadirecta', nombre: 'MesaDirecta', clave: cobAleatorio_(32), gracia_dias: '7', activo: 'si' });
    md = cobFila_('sistemas', function (r) { return r.id === 'mesadirecta'; });
  }

  const dir = SpreadsheetApp.openById(MESADIRECTA_DIRECTORIO_ID);
  const leer = function (tab) {
    const sh = dir.getSheetByName(tab);
    if (!sh) return [];
    const v = sh.getDataRange().getValues();
    const h = v[0].map(String);
    return v.slice(1).map(function (r) {
      const o = {};
      h.forEach(function (k, c) { o[k] = r[c] instanceof Date ? cobTexto_(r[c]) : r[c]; });
      return o;
    });
  };
  const si = function (v) { return v === true || String(v).toUpperCase() === 'TRUE'; };

  const yaCli = {};
  cobFilas_('clientes').forEach(function (c) { yaCli[c.sistema + '|' + c.id] = 1; });
  let nCli = 0;
  leer('directorio').forEach(function (t) {
    const id = String(t.codigo || '').trim();
    if (!id || si(t.admin) || yaCli['mesadirecta|' + id]) return;
    cobEscribir_('clientes', {
      id: id, sistema: 'mesadirecta', nombre: String(t.nombre || ''),
      contacto: String(t.contacto || ''), telefono: String(t.telefono || ''),
      plan: COB_PLANES[t.plan] ? t.plan : 'mensual', precio: Number(t.precio) || '',
      pagado_hasta: cobFechaOk_(t.pagado_hasta) ? String(t.pagado_hasta) : '',
      gracia_dias: '', estado: si(t.activo) ? 'activo' : 'pausado',
    });
    nCli++;
  });

  const copiar = function (origen, destino) {
    const ya = {};
    cobFilas_(destino).forEach(function (r) { ya[r.id] = 1; });
    let n = 0;
    leer(origen).forEach(function (r) {
      if (!r.id || ya[r.id]) return;
      const o = { sistema: 'mesadirecta', cliente: String(r.codigo || '') };
      COB_TABS[destino].forEach(function (k) {
        if (k === 'sistema' || k === 'cliente' || r[k] === undefined) return;
        o[k] = COB_NUM.indexOf(k) !== -1 ? Number(r[k]) || 0 : String(r[k]);
      });
      cobEscribir_(destino, o);
      n++;
    });
    return n;
  };
  const nPag = copiar('pagos', 'cobros_pagos');
  const nRep = copiar('reportes', 'cobros_reportes');

  // Pide permisos de correo y Drive desde ya (no al primer pago).
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();

  const txt = 'Clave del panel de cobros: ' + admin + '\n' +
    'Clave de MesaDirecta: ' + md.clave + '\n' +
    'Copiados de MesaDirecta → clientes: ' + nCli + ' · pagos: ' + nPag + ' · reportes: ' + nRep;
  console.log(txt);
  return txt;
}
