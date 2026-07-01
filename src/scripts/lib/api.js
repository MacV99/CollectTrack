/* api.js — generado por refactor modular */
import { API_URL } from '../config.js';

/* ── NETWORK ────────────────────────────────────────── */
export function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const cb = '_cb_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 12000);
    function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('load failed')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(script);
  });
}

// Las escrituras también van por JSONP (GET vía <script>): Apps Script no
// envía cabeceras CORS, así que un fetch() cross-origin queda bloqueado.
// El payload se serializa en la query y doGet lo enruta por ?action=...
export async function postData(payload) {
  if (!API_URL) throw new Error('API_URL no configurada');
  const params = new URLSearchParams();
  for (const k in payload) {
    const v = payload[k];
    params.set(k, v == null ? '' : String(v));
  }
  const json = await fetchJSONP(API_URL + '?' + params.toString());
  if (!json || json.ok === false) throw new Error((json && json.error) || 'error desconocido');
  return json;
}
