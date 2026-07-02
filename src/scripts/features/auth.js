/* auth.js — control de acceso básico por PIN (sin seguridad real).
   Dos roles: 'admin' (todo) y 'socio' (solo ver MACIA).
   El rol se guarda en localStorage y se refleja como clase en <html>
   (role-admin | role-socio | role-none). El CSS usa esa clase para
   ocultar MACV y los controles de edición cuando el rol es 'socio'.
   Un script inline en Layout.astro fija la clase ANTES de pintar para
   evitar que el socio vea MACV por un instante. */
import { ADMIN_PIN, SOCIO_PIN } from '../config.js';
import { state } from '../state.js';
import { switchTab } from '../ui/tabs.js';

export const ROLE_KEY = 'ct_role';

/* Aplica el rol: clase en <html>, estado y, si es socio, fuerza MACIA. */
export function applyRole(role) {
  state.role = role;
  const h = document.documentElement;
  h.classList.remove('role-none', 'role-admin', 'role-socio');
  h.classList.add('role-' + role);

  const chip = document.getElementById('userChip');
  if (chip) chip.textContent = role === 'admin' ? 'Admin' : 'Socio';

  if (role === 'socio') switchTab('macia');   // socio: solo MACIA
}

/* Lee el rol guardado. Si no hay, deja el overlay de login visible
   (la clase role-none ya la puso el script inline de Layout). */
export function initAuth() {
  const stored = localStorage.getItem(ROLE_KEY);
  if (stored === 'admin' || stored === 'socio') {
    applyRole(stored);
  } else {
    const pin = document.getElementById('authPin');
    if (pin) pin.focus();
  }
}

/* Valida el PIN escrito y entra. Se llama desde el botón / Enter. */
export function authLogin() {
  const input = document.getElementById('authPin');
  const err   = document.getElementById('authErr');
  const pin   = (input?.value || '').trim();

  const role = pin === ADMIN_PIN ? 'admin'
             : pin === SOCIO_PIN ? 'socio'
             : null;

  if (!role) {
    if (err) err.textContent = 'PIN incorrecto';
    if (input) { input.value = ''; input.focus(); }
    return;
  }

  try { localStorage.setItem(ROLE_KEY, role); } catch {}
  if (err) err.textContent = '';
  if (input) input.value = '';
  applyRole(role);
}

/* Cierra sesión: olvida el rol y recarga (vuelve al login). */
export function logout() {
  try { localStorage.removeItem(ROLE_KEY); } catch {}
  location.reload();
}

/* true solo para admin — guard usado por las funciones que editan. */
export function canEdit() {
  return state.role === 'admin';
}
