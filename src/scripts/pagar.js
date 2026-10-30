/* pagar.js — página /pagar: el cliente de cualquier sistema paga su mensualidad.
   Muestra el QR y las llaves Bre-B (Nu); el cliente paga desde su banco y toca
   "Ya pagué" con la foto del comprobante. Queda "por confirmar" en la central
   hasta que se aprueba (panel COBROS o botón del correo).
   Lectura por JSONP; el reporte va por POST (la foto no cabe en la URL). */
import { API_URL } from './config.js';
import { fetchJSONP } from './lib/api.js';
import { escHtml, fmtAmount } from './lib/format.js';
import { showNotification } from './ui/notify.js';

const PAGO = {
  banco: 'Nu',
  qr: '/img/pago-qr.png',
  llaves: ['3172366425', '@MCV189'],
};

const $card = document.getElementById('pagoCard');
const t = new URLSearchParams(location.search).get('t') || '';

const fechaLarga = f => {
  const [y, m, d] = String(f).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

function error(msg) {
  const txt = msg === 'enlace vencido' || msg === 'enlace inválido'
    ? 'Este enlace ya no sirve. Vuelve a tocar "Pagar mi mensualidad" en tu sistema.'
    : 'No se pudo cargar. ' + msg;
  $card.innerHTML = `<p class="pago-error">${escHtml(txt)}</p>`;
}

// Foto del comprobante → JPEG liviano (máx 1400 px) para que suba rápido.
async function comprimir(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

async function reportar(datos) {
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'reportarPago', t, ...datos }) });
  } catch {
    throw new Error('Sin conexión. Intenta de nuevo.');
  }
  const json = await res.json().catch(() => null);
  if (!json || json.ok === false) throw new Error((json && json.error) || 'No se pudo enviar.');
  return json;
}

function pintar(c) {
  let plan = c.plan;
  let foto = null;
  $card.innerHTML = `
    <p class="pago-tit">${escHtml(c.nombre)}</p>
    ${c.pendiente ? `<p class="pago-aviso">Ya reportaste un pago de ${fmtAmount(c.pendiente.monto)} el ${escHtml(fechaLarga(c.pendiente.fecha))}. Lo estamos revisando.</p>` : ''}
    <p class="pago-sub">${c.pagado_hasta ? `Tu servicio de ${escHtml(c.sistema)} está pagado hasta el <strong>${escHtml(fechaLarga(c.pagado_hasta))}</strong>.` : 'Elige tu plan y paga desde tu banco.'}</p>

    <div class="pago-planes" role="radiogroup" aria-label="Plan">
      ${['mensual', 'anual'].map(p => `
        <button type="button" class="pago-plan" role="radio" data-plan="${p}">
          <span>${p === 'anual' ? 'Anual · 12 meses' : 'Mensual'}</span>
          <strong>${fmtAmount(c.precios[p])}</strong>
        </button>`).join('')}
    </div>

    <div class="pago-paso">
      <span class="pago-num">1</span>
      <div class="pago-paso-body">
        <p class="pago-paso-tit">Paga <strong class="pago-total"></strong> desde la app de tu banco</p>
        <img class="pago-qr" src="${PAGO.qr}" alt="Código QR para pagar" width="220" height="220" />
        <p class="pago-sub">Escanea el QR o envía a una de estas llaves (${escHtml(PAGO.banco)}):</p>
        <div class="pago-llaves">
          ${PAGO.llaves.map(l => `<button type="button" class="pago-llave" data-llave="${escHtml(l)}">${escHtml(l)}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="pago-paso">
      <span class="pago-num">2</span>
      <div class="pago-paso-body">
        <p class="pago-paso-tit">Sube la foto del comprobante</p>
        <label class="pago-foto">
          <input type="file" accept="image/*" />
          <span class="pago-foto-txt">📷 Elegir foto</span>
          <img class="pago-foto-prev" alt="" hidden />
        </label>
        <input type="text" class="form-control pago-nota" maxlength="200" placeholder="Nota (opcional). Ej: pagué desde Bancolombia" />
      </div>
    </div>

    <p class="pago-error" hidden></p>
    <button type="button" class="btn-save pago-enviar">✓ Ya pagué</button>`;

  const $total = $card.querySelector('.pago-total');
  const $err = $card.querySelector('.pago-error');
  const $planes = [...$card.querySelectorAll('.pago-plan')];
  const elegir = p => {
    plan = p;
    $planes.forEach(b => b.setAttribute('aria-checked', String(b.dataset.plan === p)));
    $total.textContent = fmtAmount(c.precios[p]);
  };
  $planes.forEach(b => b.addEventListener('click', () => elegir(b.dataset.plan)));
  elegir(plan);

  $card.querySelectorAll('.pago-llave').forEach(b =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.llave);
        showNotification('Llave copiada ✓');
      } catch {
        showNotification('No se pudo copiar', 'err');
      }
    }));

  const mostrarError = msg => { $err.textContent = msg; $err.hidden = false; };

  const $file = $card.querySelector('.pago-foto input');
  const $prev = $card.querySelector('.pago-foto-prev');
  $file.addEventListener('change', async () => {
    const f = $file.files?.[0];
    if (!f) return;
    $err.hidden = true;
    try {
      foto = await comprimir(f);
      $prev.src = foto;
      $prev.hidden = false;
      $card.querySelector('.pago-foto-txt').textContent = '📷 Cambiar foto';
    } catch {
      foto = null;
      mostrarError('No se pudo leer esa imagen. Prueba con otra foto.');
    }
  });

  const $enviar = $card.querySelector('.pago-enviar');
  $enviar.addEventListener('click', async () => {
    if ($enviar.disabled) return;
    if (!foto) return mostrarError('Falta la foto del comprobante.');
    $err.hidden = true;
    $enviar.disabled = true;
    $enviar.textContent = 'Enviando…';
    try {
      await reportar({ monto: c.precios[plan], plan, comprobante: foto, nota: $card.querySelector('.pago-nota').value });
      $card.classList.add('pago-ok');
      $card.innerHTML = `
        <span class="pago-ok-ico">✓</span>
        <p class="pago-tit">¡Recibido!</p>
        <p class="pago-sub">Revisamos tu pago y en cuanto lo confirmemos tu servicio queda al día. No tienes que hacer nada más.</p>`;
    } catch (e) {
      $enviar.disabled = false;
      $enviar.textContent = '✓ Ya pagué';
      mostrarError(e.message);
    }
  });
}

if (!t) {
  error('enlace inválido');
} else {
  fetchJSONP(API_URL + '?action=miCuenta&t=' + encodeURIComponent(t))
    .then(c => (c && c.ok ? pintar(c) : error((c && c.error) || 'error desconocido')))
    .catch(e => error(e.message));
}
