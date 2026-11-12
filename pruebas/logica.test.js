// Ejecutar con:  node --test pruebas/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logica.js');

const SIN_DESCANSO = [];
const DOMINGO = [0];

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

test('días de trabajo saltan el domingo', () => {
  // jue 12 → dom 22 (sin contar el 22): 12..21 = 10 días, 1 domingo (16 no; 15 es domingo)
  assert.equal(L.diasDeTrabajo('2026-11-12', '2026-11-22', DOMINGO), 9);
  assert.equal(L.diasDeTrabajo('2026-11-12', '2026-11-22', SIN_DESCANSO), 10);
  assert.equal(L.diasDeTrabajo('2026-11-12', '2026-11-12', SIN_DESCANSO), 0);
});

const base = (x) => ({ id: 'a', tipo: 'mensual', dia: 22, monto: 100000, apartado: 0, inicio: '2026-11-12', proximo: '2026-11-22', ...x });

test('cuota: reparte lo que falta entre los días que quedan (contando hoy)', () => {
  assert.equal(L.cuotaDelDia(base(), '2026-11-12', SIN_DESCANSO), 10000); // 10 días
  assert.equal(L.cuotaDelDia(base(), '2026-11-12', DOMINGO), 12000); // 9 días → 11.111 → 12.000
});

test('cuota: vence hoy o ya vencida = todo lo que falta', () => {
  assert.equal(L.cuotaDelDia(base({ proximo: '2026-11-12' }), '2026-11-12', SIN_DESCANSO), 100000);
  assert.equal(L.cuotaDelDia(base({ proximo: '2026-11-10', apartado: 30000 }), '2026-11-12', SIN_DESCANSO), 70000);
});

test('cuota: cubierta = 0, y nunca pasa de lo que falta', () => {
  assert.equal(L.cuotaDelDia(base({ apartado: 100000 }), '2026-11-12', SIN_DESCANSO), 0);
  assert.equal(L.cuotaDelDia(base({ apartado: 99500 }), '2026-11-12', SIN_DESCANSO), 500);
});

test('cuota: si un día no aparta, sube la de los días siguientes', () => {
  const dia1 = L.cuotaDelDia(base(), '2026-11-12', SIN_DESCANSO);
  const dia2SinApartar = L.cuotaDelDia(base(), '2026-11-13', SIN_DESCANSO);
  assert.ok(dia2SinApartar > dia1);
  assert.equal(dia2SinApartar, 12000); // 100.000 / 9
});

test('cuota: si solo quedan días de descanso, hoy toca todo', () => {
  // hoy sábado 14, paga lunes 16, domingo descansa → solo cuenta hoy
  assert.equal(L.cuotaDelDia(base({ proximo: '2026-11-16' }), '2026-11-14', DOMINGO), 100000 / 1);
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
