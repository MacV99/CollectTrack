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
     5. Lo que se le quede debiendo del sueldo a Cuellar se le suma al
        mes siguiente (y va antes que el 20/80 de ese mes).

   Módulo PURO (sin DOM): recibe las transacciones y devuelve datos.
   La UI vive aparte.
   ============================================================ */

/* ── PARÁMETROS DEL REPARTO ───────────────────────────── */
// Sueldo fijo mensual Miguel Cuellar. Sube por tramos: cada entrada rige
// desde su mes ('YYYY-MM') en adelante; los meses anteriores conservan el
// sueldo viejo (para no alterar repartos ya calculados/pagados).
export const SUELDOS_CUELLAR = [
  { desde: '0000-00', monto: 1750000 },
  { desde: '2026-10', monto: 2000000 },
];
export function sueldoDelMes(mk) {
  let monto = SUELDOS_CUELLAR[0].monto;
  for (const s of SUELDOS_CUELLAR) if (mk >= s.desde) monto = s.monto;
  return monto;
}
// Desde este mes, lo que falte del sueldo pasa al mes siguiente. Los meses
// anteriores no generan deuda (ya están cerrados).
export const DEUDA_DESDE     = '2026-10';
export const PCT_CUELLAR     = 0.20;      // 20% del sobrante para Cuellar
export const PCT_CAMACHO     = 0.80;      // 80% del sobrante para Camacho
// Colchón: plata que SIEMPRE se queda en la cuenta (Nu+Nequi) para gastos
// repentinos. No se reparte en el 20/80; el sueldo de Cuellar sí puede
// tomar de aquí.
export const COLCHON         = 450000;

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
      mk, ingresos: 0, egresos: 0, saldoMes: 0, pagadoSueldo: 0,
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
    if (isSueldo(t))    { m.doneSueldo  = true; m.pagadoSueldo += t.amount; return; }
    if (isCuellar20(t)) { m.doneCuellar = true; return; }
    if (isCamacho80(t)) { m.doneCamacho = true; return; }

    if (t.type === 'ingreso') m.ingresos += t.amount;
    else                      m.egresos  += t.amount;
  });

  // Del mes más viejo al más nuevo: cada mes recibe lo que el anterior le
  // quedó debiendo a Cuellar.
  let deuda    = 0;   // sueldo que quedó faltando del mes anterior
  let apartado = 0;   // parte de esa deuda que ya se descontó del neto de antes

  return Object.values(meses)
    .sort((a, b) => (a.mk > b.mk ? 1 : -1))
    .map(m => {
      const neto       = m.ingresos - m.egresos;
      const sueldoBase = sueldoDelMes(m.mk);
      const deudaMes   = deuda;
      const objetivo   = sueldoBase + deudaMes;   // sueldo + lo que se le debe
      const suficiente = neto >= objetivo - apartado;
      // A Cuellar se le paga hasta el objetivo, tomando del saldo total
      // disponible (no solo del neto del mes). Nunca negativo. Si ya se pagó,
      // vale lo que realmente se pagó. El mes puede quedar en rojo.
      const disp       = disponibleInsuf == null ? (suficiente ? objetivo : neto) : disponibleInsuf;
      const sueldo     = m.doneSueldo ? m.pagadoSueldo : Math.max(0, Math.min(objetivo, disp));
      const faltante   = m.mk >= DEUDA_DESDE ? Math.max(0, objetivo - sueldo) : 0;
      let sobrante     = suficiente ? neto - (objetivo - apartado) : 0;
      // Lo que pasa al mes siguiente: solo si este sueldo ya se registró (si
      // no, sigue pendiente aquí). Si el mes alcanzó, esa plata ya quedó
      // separada del 20/80 y no se vuelve a descontar.
      deuda    = m.doneSueldo ? faltante : 0;
      apartado = suficiente ? deuda : 0;
      // Colchón: el 20/80 pendiente no puede dejar el saldo total por debajo
      // de COLCHON. El sueldo de Cuellar SÍ puede tomar del colchón.
      // Si ninguna de las 2 se ha pagado, se recorta el sobrante (20/80 parejo);
      // si una ya se pagó, solo se recorta la que falta.
      let recorteColchon = 0;
      const libreTrasSueldo = disponibleInsuf == null ? Infinity
        : disponibleInsuf - COLCHON - (m.doneSueldo ? faltante : sueldo);
      if (suficiente && !m.doneCuellar && !m.doneCamacho) {
        const tope = Math.max(0, Math.min(sobrante, libreTrasSueldo));
        recorteColchon += sobrante - tope;
        sobrante = tope;
      }
      let cuellar20    = suficiente ? Math.round(sobrante * PCT_CUELLAR) : 0;
      let camacho80    = suficiente ? sobrante - cuellar20 : 0;   // el resto: evita fuga por redondeo
      if (suficiente && m.doneCuellar && !m.doneCamacho) {
        const tope = Math.max(0, Math.min(camacho80, libreTrasSueldo));
        recorteColchon += camacho80 - tope;
        camacho80 = tope;
      }
      if (suficiente && m.doneCamacho && !m.doneCuellar) {
        const tope = Math.max(0, Math.min(cuellar20, libreTrasSueldo));
        recorteColchon += cuellar20 - tope;
        cuellar20 = tope;
      }
      const hasReparto = m.doneSueldo || m.doneCuellar || m.doneCamacho;
      // Completo = cada línea está pagada o vale 0 (nada que registrar).
      // Insuficiente: solo cuenta el sueldo (no hay 20/80).
      const completo   = suficiente
        ? ((m.doneSueldo || sueldo === 0) && (m.doneCuellar || cuellar20 === 0) && (m.doneCamacho || camacho80 === 0))
        : (sueldo === 0 || m.doneSueldo);
      return {
        ...m,
        neto,
        suficiente,
        sueldoBase,
        objetivo,
        deudaAnterior: deudaMes,
        faltante,
        sueldo,
        sobrante,
        cuellar20,
        camacho80,
        recorteColchon,
        cuellarTotal: sueldo + cuellar20,
        hasReparto,
        completo,
      };
    })
    .reverse();
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
