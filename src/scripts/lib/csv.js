/* csv.js — generado por refactor modular */
/* ── CSV PARSERS (fallback) ─────────────────────────── */
export function parseCsv(raw) {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.toUpperCase().trim());
  return lines.slice(1)
    .map((line, i) => {
      const cols = splitCsvLine(line);
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => { obj[h] = (cols[j] || '').trim(); });
      return obj;
    })
    .filter(r => Object.entries(r).some(([k, v]) => k !== '_row' && v));
}

export function splitCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}
