/* rowMenu.js — iconos + armado del menú ⋮ (kebab), compartido por MACV y MACIA. */

export const ROW_MENU_ICONS = {
  dots:   `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="12" cy="19" r="2.1"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  trash:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
};

export function buildRowMenu(actions) {
  return `<div class="row-menu">
    <button class="btn-row menu" title="Más opciones" aria-label="Más opciones" onclick="toggleRowMenu(event)">${ROW_MENU_ICONS.dots}</button>
    <div class="row-menu-pop">
      ${actions.map(a => `<button type="button" class="${a.danger ? 'danger' : ''}" onclick="${a.onclick}">${a.icon}<span>${a.label}</span></button>`).join('')}
    </div>
  </div>`;
}
