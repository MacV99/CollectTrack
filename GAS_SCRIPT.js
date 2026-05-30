// ── CollectTrack — Google Apps Script ───────────────────────────────────────
// Pegar en: Google Sheets → Extensiones → Apps Script → reemplazar todo
//
// Despliegue:
//   1. Guardar (Ctrl+S)
//   2. Implementar → Nueva implementación → Aplicación web
//   3. Ejecutar como: Yo
//   4. Quién tiene acceso: Cualquier usuario
//   5. Copiar URL → pegar en API_URL de index.html
//
// Cada cambio al código requiere NUEVA implementación (no actualiza la URL anterior).
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  const sheetName = e.parameter.sheet || 'cobros';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    const json = JSON.stringify({ error: 'Hoja no encontrada: ' + sheetName });
    const cb = e.parameter.callback;
    return ContentService
      .createTextOutput(cb ? `${cb}(${json})` : json)
      .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    const json = '[]';
    const cb = e.parameter.callback;
    return ContentService
      .createTextOutput(cb ? `${cb}(${json})` : json)
      .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  const headers = values[0].map(h => String(h).toUpperCase().trim());
  const rows = values.slice(1);

  const data = rows
    .map((row, i) => {
      const obj = { _row: i + 2 }; // fila real en Sheets (1-based, +1 por header)
      headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter(r => headers.some(h => r[h] !== '' && r[h] !== null && r[h] !== undefined));

  const json = JSON.stringify(data);
  const cb = e.parameter.callback;
  return ContentService
    .createTextOutput(cb ? `${cb}(${json})` : json)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, sheet: sheetName, _row } = payload;

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName || 'cobros');
    if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (sheetName === 'pagos') {
        // pagos: CATEGORY | AMOUNT | DATE
        sheet.appendRow([
          payload.CATEGORY || '',
          payload.AMOUNT   || '',
          payload.DATE     || '',
        ]);
      } else {
        // cobros: NAME | AMOUNT | CATEGORY | DATE
        sheet.appendRow([
          payload.NAME     || '',
          payload.AMOUNT   || '',
          payload.CATEGORY || '',
          payload.DATE     || '',
        ]);
      }
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (action === 'update') {
      if (!_row) throw new Error('Falta _row para update');
      if (sheetName === 'pagos') {
        sheet.getRange(_row, 1).setValue(payload.CATEGORY || '');
        sheet.getRange(_row, 2).setValue(payload.AMOUNT   || '');
        sheet.getRange(_row, 3).setValue(payload.DATE     || '');
      } else {
        sheet.getRange(_row, 1).setValue(payload.NAME     || '');
        sheet.getRange(_row, 2).setValue(payload.AMOUNT   || '');
        sheet.getRange(_row, 3).setValue(payload.CATEGORY || '');
        sheet.getRange(_row, 4).setValue(payload.DATE     || '');
      }
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!_row) throw new Error('Falta _row para delete');
      sheet.deleteRow(_row);
    }

    // ── SET PAID ─────────────────────────────────────────────────────────────
    // Marca el periodo ("YYYY-MM") en que se pagó la fila, o '' para limpiar.
    // La columna PAID se localiza por encabezado; si no existe, se crea.
    if (action === 'setPaid') {
      if (!_row) throw new Error('Falta _row para setPaid');
      const col = getOrCreatePaidCol(sheet);
      sheet.getRange(_row, col).setValue(payload.PAID || '');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
