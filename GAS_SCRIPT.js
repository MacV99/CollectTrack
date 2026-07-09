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

  let result;
  try {
    if (action) {
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
  const rowNum = Number(p._row);
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

  sheet.deleteRow(Number(p._row));
  return { ok: true };
}

// ── SET PAID ─────────────────────────────────────────────────────────────────
// Marca el periodo ("YYYY-MM") en que se pagó la fila, o '' para limpiar.
function rowSetPaid(sheetName, p) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet)  return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  if (!p._row) return { ok: false, error: '_row requerido' };

  const col = getOrCreatePaidCol(sheet);
  sheet.getRange(Number(p._row), col).setValue(p.PAID || '');
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
