/* format.js — generado por refactor modular */
/* ── CATEGORY STYLE MAP ─────────────────────────────── */
export const CAT_STYLE = {
  youtube:       { badge: 'cat-youtube',       dot: 'dot-youtube' },
  chatgpt:       { badge: 'cat-chatgpt',        dot: 'dot-chatgpt' },
  servidor_n8n:  { badge: 'cat-servidor_n8n',   dot: 'dot-servidor_n8n' },
  chatbot_ia:    { badge: 'cat-chatbot_ia',      dot: 'dot-chatbot_ia' },
  youtube_music: { badge: 'cat-youtube_music',   dot: 'dot-youtube_music' },
  internet:      { badge: 'cat-internet',        dot: 'dot-internet' },
  mobile_data:   { badge: 'cat-mobile_data',     dot: 'dot-mobile_data' },
  salud:         { badge: 'cat-salud',           dot: 'dot-salud' },
  gym:           { badge: 'cat-gym',             dot: 'dot-gym' },
  credito_nu:    { badge: 'cat-credito_nu',      dot: 'dot-credito_nu' },
  haircut:       { badge: 'cat-haircut',         dot: 'dot-haircut' },
  bike_wash:     { badge: 'cat-bike_wash',       dot: 'dot-bike_wash' },
  sitio_web:     { badge: 'cat-sitio_web',       dot: 'dot-sitio_web' },
};

export function catStyle(raw) {
  const key = (raw || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e')
    .replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u');
  return CAT_STYLE[key] || { badge: 'cat-default', dot: 'dot-default' };
}

/* ── HELPERS ────────────────────────────────────────── */
export function parseAmount(val) {
  if (!val && val !== 0) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/\$/g,'').replace(/\./g,'').replace(',','.').trim()) || 0;
}

export function fmtAmount(n) {
  return '$' + n.toLocaleString('es-CO');
}

export function fmtAmountInput(el) {
  const pos = el.selectionStart;
  const raw = el.value.replace(/\D/g, '');
  const formatted = raw ? parseInt(raw, 10).toLocaleString('es-CO') : '';
  const diff = formatted.length - el.value.length;
  el.value = formatted;
  el.setSelectionRange(pos + diff, pos + diff);
}

/* ── CREATABLE COMBO (etiquetas reutilizables) ──────── */
// Normaliza para comparar: minúsculas, sin acentos, espacios colapsados.
// Así "YouTube", "youtube" y "you tube" cuentan como la misma etiqueta y no
// se crean conceptos/categorías duplicados por diferencias de escritura.
export function normTag(s) {
  return (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

export function escAttr(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── PAY STATUS ─────────────────────────────────────── */
// Periodo actual "YYYY-MM". Un registro está "al día" si su PAID == periodo
// actual. Al cambiar de mes el PAID guardado deja de coincidir → vuelve a
// pendiente solo (reinicio automático), conservando el último mes pagado.
export function currentPeriod() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Sheets a veces autoconvierte texto tipo fecha en fecha ISO con hora
// ("2026-06-01T05:00:00.000Z"). Recortamos al prefijo de longitud `len`
// para que filtros/orden por fecha sigan funcionando.
function normDatePrefix(v, len) {
  if (v == null) return '';
  const s = String(v).trim();
  return /^\d{4}-\d{2}(-\d{2})?/.test(s) ? s.slice(0, len) : s;
}

// "YYYY-MM" (periodo de pago).
export function normPeriod(v) {
  return normDatePrefix(v, 7);
}

// "YYYY-MM-DD" (fecha MACIA).
export function normMaciaDate(v) {
  return normDatePrefix(v, 10);
}

export function formatAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return 'hace un momento';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
