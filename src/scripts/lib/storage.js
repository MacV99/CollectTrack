/* storage.js — generado por refactor modular */
import { normTag } from './format.js';

// Almacén de etiquetas en localStorage (por campo). Las opciones nuevas se
// guardan aquí para quedar disponibles en futuros registros aunque aún no
// se haya sincronizado/guardado el movimiento.
export function loadTags(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export function saveTag(key, value) {
  const v = (value || '').trim(); if (!v) return;
  const list = loadTags(key), nk = normTag(v);
  if (!list.some(x => normTag(x) === nk)) {
    list.push(v);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
  }
}

// Une varias fuentes de opciones, deduplicando por clave normalizada y
// conservando la primera escritura vista. Devuelve ordenado alfabéticamente.
export function mergeTags() {
  const map = new Map();
  [...arguments].flat().forEach(v => {
    if (v == null) return;
    const s = String(v).trim(); if (!s) return;
    const nk = normTag(s);
    if (!map.has(nk)) map.set(nk, s);
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

/* ── CACHE ──────────────────────────────────────────── */
export const CACHE_KEY = 'collecttrack_v3';

export function saveCache(income, expenses) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ income, expenses, ts: Date.now() })); } catch {}
}

export function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
