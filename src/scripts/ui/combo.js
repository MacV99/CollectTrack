/* combo.js — generado por refactor modular */
import { escAttr, normTag } from '../lib/format.js';
import { saveTag } from '../lib/storage.js';

// Convierte un <input> dentro de .combo en un select creable: lista opciones
// existentes, filtra al escribir, permite crear una nueva y la guarda.
// getOptions() se evalúa en cada apertura; storeKey puede ser función.
export function setupCombo(inputId, getOptions, storeKey) {
  const input = document.getElementById(inputId);
  if (!input) return null;
  const wrap = input.closest('.combo');
  const pop  = wrap.querySelector('.combo-pop');
  let items = [];

  const keyOf = () => (typeof storeKey === 'function' ? storeKey() : storeKey);

  function build() {
    const q    = normTag(input.value);
    const opts = getOptions();
    const filtered = q ? opts.filter(o => normTag(o).includes(q)) : opts;
    items = filtered.slice();
    let html = filtered.map((o, i) =>
      `<div class="combo-option" data-i="${i}" data-val="${escAttr(o)}">${escAttr(o)}</div>`).join('');

    const cur = input.value.trim();
    if (cur && !opts.some(o => normTag(o) === q)) {
      items.push(cur);
      html += `<div class="combo-create" data-i="${items.length - 1}" data-val="${escAttr(cur)}">+ Crear "<b>${escAttr(cur)}</b>"</div>`;
    }
    if (!html) html = '<div class="combo-empty">Sin coincidencias</div>';
    pop.innerHTML = html;
  }

  function open()  { build(); pop.classList.add('open'); }
  function close() { pop.classList.remove('open'); }

  function choose(i) {
    if (i < 0 || i >= items.length) return;
    const el = pop.querySelector(`[data-i="${i}"]`);
    input.value = items[i];
    if (el && el.classList.contains('combo-create')) saveTag(keyOf(), items[i]);
    close();
    input.focus();
  }

  function activeIndex() {
    const els = [...pop.querySelectorAll('.combo-option,.combo-create')];
    return els.findIndex(e => e.classList.contains('active'));
  }
  function setActive(n) {
    const els = [...pop.querySelectorAll('.combo-option,.combo-create')];
    if (!els.length) return;
    const cur = els.findIndex(e => e.classList.contains('active'));
    const next = ((cur < 0 ? -1 : cur) + n + els.length) % els.length;
    els.forEach((e, i) => e.classList.toggle('active', i === next));
    els[next].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('keydown', e => {
    const isOpen = pop.classList.contains('open');
    if (e.key === 'ArrowDown')      { e.preventDefault(); isOpen ? setActive(1) : open(); }
    else if (e.key === 'ArrowUp')   { if (isOpen) { e.preventDefault(); setActive(-1); } }
    else if (e.key === 'Enter') {
      const ai = activeIndex();
      if (isOpen && ai >= 0) { e.preventDefault(); choose(ai); }
      else { const cur = input.value.trim(); if (cur) { saveTag(keyOf(), cur); close(); } }
    } else if (e.key === 'Escape') { if (isOpen) { e.stopPropagation(); close(); } }
  });
  // mousedown (no click) para seleccionar antes de que el blur cierre el pop.
  pop.addEventListener('mousedown', e => {
    const opt = e.target.closest('.combo-option,.combo-create');
    if (!opt) return;
    e.preventDefault();
    choose(parseInt(opt.dataset.i, 10));
  });
  input.addEventListener('blur', () => setTimeout(close, 120));

  return { open, close, refresh: build };
}
