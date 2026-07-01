/* notify.js — generado por refactor modular */
/* ── NOTIFICATION ───────────────────────────────────── */
export function showNotification(msg, type = 'ok') {
  const pill = document.getElementById('notif-pill');
  pill.textContent = msg;
  pill.style.opacity = '1';
  pill.style.background = type === 'ok' ? '#22c55e' : '#ef4444';
  pill.style.color = '#fff';
  clearTimeout(pill._t);
  pill._t = setTimeout(() => { pill.style.opacity = '0'; }, 2500);
}

export function setStatus(text, color) {
  const el = document.getElementById('lastUpdated');
  el.textContent = text;
  el.style.color = color || '';
}
