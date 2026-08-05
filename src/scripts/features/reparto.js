/* ============================================================
   reparto.js — Motor de cálculo del reparto mensual MACIA.

   Regla de negocio:
     1. Por cada mes:  neto = ingresos − egresos
        (SIN contar las líneas de reparto: sueldo Cuellar, 20%, 80%,
        porque esas SON el resultado del reparto; contarlas sería
        una cuenta circular).
     2. A Miguel Cuellar se le paga un SUELDO fijo mensual.
     3. Lo que sobra (neto − sueldo) se reparte:
          Miguel Cuellar  → 20%
          Miguel Camacho  → 80%
        Total Cuellar = sueldo + 20% del sobrante.
     4. Si el neto NO alcanza para el sueldo → mes "insuficiente":
        se le paga a Cuellar hasta el sueldo tomando del SALDO TOTAL
        del negocio (no solo del neto del mes): sueldo = min(sueldo,
        saldo total disponible). Ese mes puede quedar en negativo (usa
        ahorro de meses anteriores); el saldo total baja. Sin 20/80.
        Si no hay saldo disponible (≤ 0) no se paga nada.

   Módulo PURO (sin DOM): recibe las transacciones y devuelve datos.
   La UI vive aparte.
   ============================================================ */

/* ── PARÁMETROS DEL REPARTO ───────────────────────────── */
export const SUELDO_CUELLAR = 1750000;   // sueldo fijo mensual Miguel Cuellar
export const PCT_CUELLAR     = 0.20;      // 20% del sobrante para Cuellar
export const PCT_CAMACHO     = 0.80;      // 80% del sobrante para Camacho

/* Conceptos canónicos que genera el botón "Registrar reparto".
   Al crearlos SIEMPRE con este texto, la detección deja de ser frágil. */
export const CONCEPTO_SUELDO  = 'Sueldo Miguel Cuellar';
export const CONCEPTO_CUELLAR = 'Reparto 20% Miguel Cuellar';
export const CONCEPTO_CAMACHO = 'Reparto 80% Miguel Camacho';

/* Traslado interno entre cuentas (Nu ↔ Nequi). No es ingreso ni egreso
   real del negocio: solo mueve plata de un lado a otro. Se registra como
   2 movimientos (uno sale, otro entra) con este concepto. */
export const CONCEPTO_TRASLADO = 'Traslado interno';
export function isTraslado(t) {
  return /traslado interno/.test((t.concept || '').toLowerCase());
}

/* ── DETECCIÓN DE LÍNEAS DE REPARTO ───────────────────── */
// Reconoce cada línea del esquema por separado (histórico manual +
// canónico nuevo). Ojo: el "sueldo miguel" viejo de 2025 (sin 'cuellar')
// NO cae aquí a propósito — pertenece a meses sin esquema de reparto.
export function isSueldo(t)    { return /sueldo\s+miguel\s+cuellar/.test((t.concept || '').toLowerCase()); }
export function isCuellar20(t) { return /20\s*%.*cuellar/.test((t.concept || '').toLowerCase()); }
export function isCamacho80(t) { return /80\s*%.*camacho/.test((t.concept || '').toLowerCase()); }

// Cualquiera de las 3 (para excluirlas del neto).
export function isReparto(t) {
  return isSueldo(t) || isCuellar20(t) || isCamacho80(t);
}

/* ── CÁLCULO POR MES ──────────────────────────────────── */
// Agrupa las transacciones por mes ('YYYY-MM') y calcula el reparto.
// Devuelve un arreglo ordenado del mes más reciente al más viejo.
// `disponibleInsuf`: saldo total del negocio (Nu+Nequi) para pagar el sueldo
// en meses insuficientes. Si es null, cae al neto del mes (comportamiento
// viejo, backward-safe).
export function calcRepartoMensual(maciaTx, disponibleInsuf = null) {
  const meses = {};   // 'YYYY-MM' -> acumulador

  maciaTx.forEach(t => {
    const mk = (t.date || '').slice(0, 7);
    if (!mk) return;
    if (!meses[mk]) meses[mk] = {
      mk, ingresos: 0, egresos: 0, saldoMes: 0,
      doneSueldo: false, doneCuellar: false, doneCamacho: false,
    };
    const m = meses[mk];

    // Traslado interno: neteo cero entre cuentas, no afecta el mes en nada.
    if (isTraslado(t)) return;

    // Saldo real del mes: incluye los repartos (esos sí salen del banco).
    // Es la plata neta que dejó el mes en la cuenta.
    m.saldoMes += (t.type === 'ingreso' ? 1 : -1) * t.amount;

    // Las 3 líneas de reparto no entran al neto de cálculo; solo marcan
    // qué ya se pagó (para no dañar el reparto del mes).
    if (isSueldo(t))    { m.doneSueldo  = true; return; }
    if (isCuellar20(t)) { m.doneCuellar = true; return; }
    if (isCamacho80(t)) { m.doneCamacho = true; return; }

    if (t.type === 'ingreso') m.ingresos += t.amount;
    else                      m.egresos  += t.amount;
  });

  return Object.values(meses)
    .map(m => {
      const neto       = m.ingresos - m.egresos;
      const suficiente = neto >= SUELDO_CUELLAR;
      // Mes insuficiente: a Cuellar se le paga hasta el sueldo, tomando del
      // saldo total disponible (no solo del neto del mes). Nunca negativo,
      // nunca más que el sueldo. El mes puede quedar en rojo; el total baja.
      const disp       = disponibleInsuf == null ? neto : disponibleInsuf;
      const sueldo     = suficiente ? SUELDO_CUELLAR : Math.max(0, Math.min(SUELDO_CUELLAR, disp));
      const sobrante   = suficiente ? neto - SUELDO_CUELLAR : 0;
      const cuellar20  = suficiente ? Math.round(sobrante * PCT_CUELLAR) : 0;
      const camacho80  = suficiente ? sobrante - cuellar20 : 0;   // el resto: evita fuga por redondeo
      const hasReparto = m.doneSueldo || m.doneCuellar || m.doneCamacho;
      // Insuficiente completo = con solo el sueldo (no hay 20/80 por registrar).
      // Si sueldo es 0 (mes en pérdida) no hay nada que registrar.
      const completo   = suficiente
        ? (m.doneSueldo && m.doneCuellar && m.doneCamacho)
        : (sueldo === 0 || m.doneSueldo);
      return {
        ...m,
        neto,
        suficiente,
        sueldo,
        sobrante,
        cuellar20,
        camacho80,
        cuellarTotal: sueldo + cuellar20,
        hasReparto,
        completo,
      };
    })
    .sort((a, b) => (a.mk < b.mk ? 1 : -1));
}

/* ── LÍNEAS DE REPARTO (fuente única) ─────────────────── */
// Las 3 líneas de un mes calculado, en un solo lugar: las consume tanto el
// modal (para pintarlas) como el registro (para crear el egreso por 'kind').
export function repartoLines(m) {
  return [
    { kind: 'sueldo',  concept: CONCEPTO_SUELDO,  amount: m.sueldo,    done: m.doneSueldo  },
    { kind: 'cuellar', concept: CONCEPTO_CUELLAR, amount: m.cuellar20, done: m.doneCuellar },
    { kind: 'camacho', concept: CONCEPTO_CAMACHO, amount: m.camacho80, done: m.doneCamacho },
  ];
}

/* ── SALDO POR MES (ligero) ───────────────────────────── */
// 'YYYY-MM' → saldo real del mes (ingresos − egresos, repartos incluidos,
// traslados internos NO). Versión liviana para el separador del historial:
// no arma el reparto ni ordena, solo suma. Está en el camino caliente
// (se recalcula en cada tecla del buscador), por eso evita el trabajo extra.
export function saldoPorMes(maciaTx) {
  const map = {};
  maciaTx.forEach(t => {
    if (isTraslado(t)) return;
    const mk = (t.date || '').slice(0, 7);
    if (!mk) return;
    map[mk] = (map[mk] || 0) + (t.type === 'ingreso' ? 1 : -1) * t.amount;
  });
  return map;
}
