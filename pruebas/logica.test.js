// Ejecutar con:  node --test pruebas/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logica.js');

const TODOS = { diasSemana: 7, margen: 0 };

test('fechas mensuales: recorta al último día y pasa de año', () => {
  assert.equal(L.proximaMensual('2026-11-12', 15), '2026-11-15');
  assert.equal(L.proximaMensual('2026-11-16', 15), '2026-12-15');
  assert.equal(L.proximaMensual('2026-11-12', 12), '2026-11-12'); // hoy mismo
  assert.equal(L.siguienteMensual('2026-12-15', 15), '2027-01-15');
  assert.equal(L.siguienteMensual('2027-01-31', 31), '2027-02-28');
  assert.equal(L.siguienteMensual('2027-02-28', 31), '2027-03-31'); // vuelve al 31
});

test('fechas semanales', () => {
  // 2026-11-12 es jueves (4)
  assert.equal(L.proximaSemanal('2026-11-12', 4), '2026-11-12');
  assert.equal(L.proximaSemanal('2026-11-12', 6), '2026-11-14');
  assert.equal(L.proximaSemanal('2026-11-12', 1), '2026-11-16');
});

test('días probables: según cuántos días trabaja a la semana', () => {
  assert.equal(L.diasProbables('2026-11-12', '2026-11-22', 7), 10);
  assert.equal(L.diasProbables('2026-11-12', '2026-11-22', 5), 7); // 10 × 5/7 = 7,1 → 7
  assert.equal(L.diasProbables('2026-11-12', '2026-11-13', 3), 1); // solo hoy
  assert.equal(L.diasProbables('2026-11-12', '2026-11-14', 1), 1); // nunca menos de 1
});

test('ajustes: valores raros se corrigen', () => {
  assert.deepEqual(L.ajustes({}), { diasSemana: 7, margen: 0 });
  assert.deepEqual(L.ajustes({ diasSemana: 12, margen: -3 }), { diasSemana: 7, margen: 0 });
  assert.deepEqual(L.ajustes({ diasSemana: '5', margen: '2' }), { diasSemana: 5, margen: 2 });
});

const base = (x) => ({ id: 'a', tipo: 'mensual', dia: 22, monto: 100000, apartado: 0, inicio: '2026-11-12', proximo: '2026-11-22', ...x });

test('cuota: reparte lo que falta entre los días que quedan (contando hoy)', () => {
  assert.equal(L.cuotaDelDia(base(), '2026-11-12', TODOS), 10000); // 10 días
  assert.equal(L.cuotaDelDia(base(), '2026-11-12', { diasSemana: 5 }), 15000); // 7 días probables → 14.286 → 15.000
});

test('cuota: con margen, la meta es tener la plata antes del pago', () => {
  // paga el 22, margen 2 → meta el 20 → 8 días (12..19)
  assert.equal(L.cuotaDelDia(base(), '2026-11-12', { diasSemana: 7, margen: 2 }), 13000); // 12.500 → 13.000
  // ya pasó la meta pero no el pago → toca todo
  assert.equal(L.cuotaDelDia(base(), '2026-11-21', { diasSemana: 7, margen: 2 }), 100000);
});

test('cuota: vence hoy o ya vencida = todo lo que falta', () => {
  assert.equal(L.cuotaDelDia(base({ proximo: '2026-11-12' }), '2026-11-12', TODOS), 100000);
  assert.equal(L.cuotaDelDia(base({ proximo: '2026-11-10', apartado: 30000 }), '2026-11-12', TODOS), 70000);
});

test('cuota: cubierta = 0, y nunca pasa de lo que falta', () => {
  assert.equal(L.cuotaDelDia(base({ apartado: 100000 }), '2026-11-12', TODOS), 0);
  assert.equal(L.cuotaDelDia(base({ apartado: 99500 }), '2026-11-12', TODOS), 500);
});

test('cuota: si un día no se trabaja, sube la de los días siguientes', () => {
  const cfg = { diasSemana: 6, margen: 1 };
  const dia1 = L.cuotaDelDia(base(), '2026-11-12', cfg);
  const dia2SinTrabajar = L.cuotaDelDia(base(), '2026-11-13', cfg);
  const dia3SinTrabajar = L.cuotaDelDia(base(), '2026-11-14', cfg);
  assert.ok(dia1 < dia2SinTrabajar && dia2SinTrabajar <= dia3SinTrabajar && dia1 < dia3SinTrabajar);
});

test('cuota: trabajando menos días a la semana, cada día toca más', () => {
  const seis = L.cuotaDelDia(base(), '2026-11-12', { diasSemana: 6 });
  const cuatro = L.cuotaDelDia(base(), '2026-11-12', { diasSemana: 4 });
  assert.ok(cuatro > seis);
});

test('repartir: si no alcanza, primero lo que vence antes y se ve el faltante', () => {
  const items = [
    { id: 'colegio', cuota: 20000, falta: 200000, proximo: '2026-11-30', prioridad: 1 },
    { id: 'luz', cuota: 15000, falta: 60000, proximo: '2026-11-15', prioridad: 1 },
  ];
  const r = L.repartir(items, 25000);
  assert.deepEqual(r.reparto, { luz: 15000, colegio: 10000 });
  assert.equal(r.sinCubrir, 10000);
  assert.equal(r.sobrante, 0);
});

test('repartir: día sin plata', () => {
  const r = L.repartir([{ id: 'luz', cuota: 15000, falta: 60000, proximo: '2026-11-15' }], 0);
  assert.deepEqual(r.reparto, {});
  assert.equal(r.sinCubrir, 15000);
});

test('repartir: si aparta de más, adelanta y no se pasa de lo que falta', () => {
  const items = [
    { id: 'luz', cuota: 15000, falta: 20000, proximo: '2026-11-15' },
    { id: 'colegio', cuota: 20000, falta: 200000, proximo: '2026-11-30' },
  ];
  const r = L.repartir(items, 50000);
  assert.deepEqual(r.reparto, { luz: 20000, colegio: 30000 });
  assert.equal(r.sinCubrir, 0);
  const r2 = L.repartir([{ id: 'luz', cuota: 5000, falta: 5000, proximo: '2026-11-15' }], 9000);
  assert.equal(r2.sobrante, 4000);
});

test('pagar mensual: pasa al mes siguiente y guarda lo que sobró', () => {
  const n = L.pagar(base({ apartado: 120000 }), 100000);
  assert.equal(n.proximo, '2026-12-22');
  assert.equal(n.inicio, '2026-11-22');
  assert.equal(n.apartado, 20000);
  assert.equal(n.activa, undefined);
});

test('pagar: deuda total baja, última cuota se ajusta y termina en cero', () => {
  let o = base({ saldoTotal: 250000, apartado: 100000 });
  o = L.pagar(o, 100000);
  assert.equal(o.saldoTotal, 150000);
  o = L.pagar({ ...o, apartado: 100000 }, 100000);
  assert.equal(o.saldoTotal, 50000);
  assert.equal(o.monto, 50000);
  o = L.pagar({ ...o, apartado: 50000 }, 50000);
  assert.equal(o.activa, false);
});

test('pagar única: queda terminada', () => {
  assert.equal(L.pagar(base({ tipo: 'unica' }), 100000).activa, false);
});

test('estado', () => {
  assert.equal(L.estado(base({ apartado: 0 }), '2026-11-12'), 'al-dia'); // recién empieza
  assert.equal(L.estado(base({ apartado: 10000 }), '2026-11-17'), 'atrasada'); // debería llevar 50.000
  assert.equal(L.estado(base({ apartado: 50000 }), '2026-11-17'), 'al-dia');
  assert.equal(L.estado(base({ apartado: 100000 }), '2026-11-17'), 'cubierta');
  assert.equal(L.estado(base({ apartado: 90000 }), '2026-11-22'), 'vence-hoy');
  assert.equal(L.estado(base({ apartado: 90000 }), '2026-11-23'), 'vencida');
});

/* ---------- cuota diaria fija ---------- */
const ob = (x) => ({ id: x.id, nombre: x.id, tipo: 'mensual', prioridad: 1, apartado: 0, saldoTotal: null, inicio: '2026-11-12', ...x });

test('instancias: incluye las que se repiten en el mes y pasa lo apartado de más', () => {
  const mercado = ob({ id: 'mercado', tipo: 'semanal', dia: 6, monto: 100000, proximo: '2026-11-14', apartado: 130000 });
  const xs = L.instancias([mercado], '2026-11-12', 31);
  assert.deepEqual(xs.map((x) => [x.fecha, x.falta]), [
    ['2026-11-21', 70000], // la del 14 está cubierta y sobran 30.000 para la del 21
    ['2026-11-28', 100000], ['2026-12-05', 100000], ['2026-12-12', 100000],
  ]);
});

test('instancias: la deuda total limita las cuotas', () => {
  const t = ob({ id: 't', dia: 20, monto: 300000, proximo: '2026-11-20', saldoTotal: 400000 });
  const xs = L.instancias([t], '2026-11-12', 40);
  assert.deepEqual(xs.map((x) => x.falta), [300000, 100000]);
});

test('plan: con 40.000 diarios avisa qué no alcanza y cuánto se necesitaría', () => {
  const cfg = { diasSemana: 7, margen: 0, cuotaDiaria: 40000, horizonte: 31 };
  const obs = [
    ob({ id: 'luz', dia: 15, monto: 120000, proximo: '2026-11-15' }),      // 3 días → 120.000 ✔
    ob({ id: 'tarjeta', dia: 20, monto: 300000, proximo: '2026-11-20' }),  // 8 días → 320.000 − 120.000 = 200.000 ✗ faltan 100.000
  ];
  const p = L.plan(obs, '2026-11-12', cfg);
  const luz = p.items.find((x) => x.id === 'luz' && x.primera);
  const tarjeta = p.items.find((x) => x.id === 'tarjeta' && x.primera);
  assert.equal(luz.faltante, 0);
  assert.equal(tarjeta.faltante, 100000);
  assert.equal(p.alcanza, false);
  assert.equal(p.necesaria, 53000); // 420.000 / 8 = 52.500 → 53.000
});

test('plan: si alcanza, todo queda cubierto', () => {
  const cfg = { diasSemana: 7, margen: 0, cuotaDiaria: 40000, horizonte: 20 };
  const p = L.plan([ob({ id: 'luz', dia: 22, monto: 120000, proximo: '2026-11-22' })], '2026-11-12', cfg);
  assert.equal(p.alcanza, true);
  assert.equal(p.necesaria, 12000);
});

test('plan: lo que ya se apartó hoy no cuenta dos veces', () => {
  const cfg = { diasSemana: 7, margen: 0, cuotaDiaria: 40000, horizonte: 31 };
  // paga mañana 80.000; hoy ya apartó 40.000 (ya sumado en apartado) → falta 40.000 y no queda capacidad hoy
  const p = L.plan([ob({ id: 'x', dia: 13, monto: 80000, proximo: '2026-11-13', apartado: 40000 })], '2026-11-12', cfg, 40000);
  assert.equal(p.items[0].faltante, 40000);
});

test('repartirDia: primero lo que vence antes; lo que sobra es ahorro extra', () => {
  const obs = [
    ob({ id: 'colegio', monto: 450000, proximo: '2026-12-05' }),
    ob({ id: 'luz', monto: 120000, proximo: '2026-11-15', apartado: 100000 }),
  ];
  assert.deepEqual(L.repartirDia(obs, 40000), { reparto: { luz: 20000, colegio: 20000 }, extra: 0 });
  const cubiertas = [ob({ id: 'luz', monto: 120000, proximo: '2026-11-15', apartado: 120000 })];
  assert.deepEqual(L.repartirDia(cubiertas, 40000), { reparto: {}, extra: 40000 });
});
