/* config.js — constantes y endpoints */
/* ── CONFIG ─────────────────────────────────────────── */
// ⚠ Pegar aquí la URL del deployment de Apps Script (GAS_SCRIPT.js)
export const API_URL = 'https://script.google.com/macros/s/AKfycbxH36OleH171DkSW6Za4T-VkmnZYp2VUXBXSSgTzH37izIq5JFrS7rRckjQUZBGVFgV/exec';

/* ── CSV FALLBACK (solo lectura, sin API_URL) ───────── */
export const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vQ3ft5Mfo9oXwRGVD974mP6myIhR4KU-EA0mnKFNu6bjKBdIubZES8zKsUovNKoa6eJYAUrpURgm5uF' +
  '/pub?gid=0&single=true&output=csv';

export const EXPENSES_URL =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vQ3ft5Mfo9oXwRGVD974mP6myIhR4KU-EA0mnKFNu6bjKBdIubZES8zKsUovNKoa6eJYAUrpURgm5uF' +
  '/pub?gid=1889966816&single=true&output=csv';

/* ── USUARIOS (control de acceso básico, sin seguridad real) ──
   Dos roles por PIN. admin = ve y edita todo (comportamiento actual).
   socio = solo VER MACIA (sin editar, sin MACV).
   ⚠ CAMBIA estos PIN por los tuyos. */
export const ADMIN_PIN = '9908';   // tú (acceso total)
export const SOCIO_PIN = '0000';   // socio (solo ver MACIA)
