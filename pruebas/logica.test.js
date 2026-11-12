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

test('asignar: si alcanza, cada cuenta recibe lo que necesita; lo demás adelanta y luego es extra', () => {
  const items = [
    { id: 'a', necesidad: 10000, falta: 30000, prioridad: 1, fecha: '2026-11-20' },
    { id: 'b', necesidad: 5000, falta: 5000, prioridad: 1, fecha: '2026-11-25' },
  ];
  assert.deepEqual(L.asignar(items, 15000), { reparto: { a: 10000, b: 5000 }, extra: 0 });
  assert.deepEqual(L.asignar(items, 40000), { reparto: { a: 30000, b: 5000 }, extra: 5000 });
});

test('asignar: si no alcanza, reparte en proporción a lo que necesita cada una', () => {
  const items = [
    { id: 'a', necesidad: 60000, falta: 300000, prioridad: 1, fecha: '2026-11-20' },
    { id: 'b', necesidad: 20000, falta: 100000, prioridad: 1, fecha: '2026-11-25' },
  ];
  assert.deepEqual(L.asignar(items, 40000).reparto, { a: 30000, b: 10000 });
});

test('asignar: la prioridad alta va primero', () => {
  const items = [
    { id: 'internet', necesidad: 10000, falta: 90000, prioridad: 2, fecha: '2026-11-15' },
    { id: 'luz', necesidad: 30000, falta: 120000, prioridad: 1, fecha: '2026-11-20' },
  ];
  assert.deepEqual(L.asignar(items, 35000).reparto, { luz: 30000, internet: 5000 });
});

test('repartirDia: explica cuánto faltaba, cuánto necesitaba y cuántos días quedaban', () => {
  const obs = [
    ob({ id: 'luz', monto: 120000, proximo: '2026-11-15' }),
    ob({ id: 'colegio', monto: 450000, proximo: '2026-12-05' }),
  ];
  const r = L.repartirDia(obs, 40000, '2026-11-12', { diasSemana: 7, margen: 0 });
  assert.equal(r.reparto.luz + r.reparto.colegio, 40000);
  assert.ok(r.reparto.luz > 0 && r.reparto.colegio > 0, 'las dos reciben algo');
  assert.deepEqual(r.detalle.luz, { falta: 120000, necesidad: 40000, dias: 3, fecha: '2026-11-15' });
  const cubiertas = [ob({ id: 'luz', monto: 120000, proximo: '2026-11-15', apartado: 120000 })];
  assert.deepEqual(L.repartirDia(cubiertas, 40000, '2026-11-12', {}).extra, 40000);
});

test('plan: avisa lo que no alcanza y la cuota necesaria sí alcanza', () => {
  const cfg = { diasSemana: 7, margen: 0, cuotaDiaria: 40000, horizonte: 31 };
  const obs = [
    ob({ id: 'luz', dia: 15, monto: 120000, proximo: '2026-11-15' }),
    ob({ id: 'tarjeta', dia: 20, monto: 300000, proximo: '2026-11-20' }),
  ];
  const p = L.plan(obs, '2026-11-12', cfg);
  assert.equal(p.alcanza, false);
  assert.ok(p.faltanteTotal >= 60000); // 9 días × 40.000 = 360.000 para 420.000
  assert.equal(L.plan(obs, '2026-11-12', { ...cfg, cuotaDiaria: p.necesaria }).alcanza, true);
  assert.equal(L.plan(obs, '2026-11-12', { ...cfg, cuotaDiaria: p.necesaria - 1000 }).alcanza, false);
});

test('plan: si alcanza, todo queda cubierto', () => {
  const cfg = { diasSemana: 7, margen: 0, cuotaDiaria: 40000, horizonte: 20 };
  const p = L.plan([ob({ id: 'luz', dia: 22, monto: 120000, proximo: '2026-11-22' })], '2026-11-12', cfg);
  assert.equal(p.alcanza, true);
  assert.ok(p.necesaria <= 13000);
});

test('ya pagó el recibo de este mes: el próximo es el del mes siguiente', () => {
  assert.equal(L.proximaSiYaPagoEsteMes('2026-11-12', 18), '2026-12-18'); // aún no vencía
  assert.equal(L.proximaSiYaPagoEsteMes('2026-11-12', 5), '2026-12-05');  // ya había vencido
  assert.equal(L.proximaSiYaPagoEsteMes('2026-12-20', 31), '2027-01-31');
  assert.equal(L.proximaSiYaPagoEsteMes('2027-01-10', 31), '2027-02-28');
});

/* ---------- ahorro ---------- */
test('repartirMetas: según el porcentaje de cada meta', () => {
  const metas = [
    { id: 'emergencia', porcentaje: 50, ahorrado: 0 },
    { id: 'invertir', porcentaje: 50, ahorrado: 0 },
  ];
  assert.deepEqual(L.repartirMetas(metas, 10000), { reparto: { emergencia: 5000, invertir: 5000 }, sobra: 0 });
  const r = L.repartirMetas([{ id: 'a', porcentaje: 70 }, { id: 'b', porcentaje: 30 }], 10000);
  assert.deepEqual(r.reparto, { a: 7000, b: 3000 });
});

test('repartirMetas: una meta llena pasa lo suyo a las demás; sin metas, sobra', () => {
  const metas = [
    { id: 'emergencia', porcentaje: 50, ahorrado: 98000, objetivo: 100000 },
    { id: 'invertir', porcentaje: 50, ahorrado: 0 },
  ];
  assert.deepEqual(L.repartirMetas(metas, 10000).reparto, { emergencia: 2000, invertir: 8000 });
  assert.deepEqual(L.repartirMetas([], 10000), { reparto: {}, sobra: 10000 });
});

test('repartirTodo: primero el % de ahorro, luego cuentas, y lo que sobra de las cuentas también es ahorro', () => {
  const obs = [ob({ id: 'luz', monto: 120000, proximo: '2026-11-15', apartado: 110000 })];
  const metas = [{ id: 'invertir', porcentaje: 100, ahorrado: 0 }];
  const r = L.repartirTodo(obs, metas, 40000, '2026-11-12', { diasSemana: 7, margen: 0, ahorroPct: 10 });
  assert.equal(r.primeroAhorro, 4000);
  assert.deepEqual(r.reparto, { luz: 10000 });          // a la luz solo le faltaban 10.000
  assert.deepEqual(r.ahorro, { invertir: 30000 });      // 4.000 + 26.000 que sobraron
  assert.equal(r.extra, 0);
  const sinPct = L.repartirTodo(obs, metas, 40000, '2026-11-12', { diasSemana: 7, margen: 0 });
  assert.equal(sinPct.primeroAhorro, 0);
});

/* ---------- frecuencia de ingresos (perfiles con sueldo) ---------- */
test('ajustes: la frecuencia define cuántas veces por semana entra plata', () => {
  assert.equal(L.ajustes({ frecuencia: 'semanal' }).diasSemana, 1);
  assert.ok(Math.abs(L.ajustes({ frecuencia: 'mensual' }).diasSemana - 7 / 30) < 1e-9);
  assert.equal(L.ajustes({ frecuencia: 'diario', diasSemana: 5 }).diasSemana, 5);
});

test('sueldo mensual: si el pago vence antes del próximo sueldo, se aparta todo de una vez', () => {
  const cfg = { frecuencia: 'mensual', margen: 0 };
  // arriendo 600.000 el 5 del otro mes; hoy llega el sueldo (30 nov) → no hay otro sueldo antes → todo hoy
  const n = L.necesidadDiaria(600000, '2026-11-30', '2026-12-05', cfg);
  assert.equal(n.necesidad, 600000);
  // dentro de 2 meses: se reparte en 2 sueldos
  const n2 = L.necesidadDiaria(600000, '2026-11-30', '2027-01-29', cfg);
  assert.equal(n2.necesidad, 300000);
});

test('sueldo quincenal: plan con cuota por quincena', () => {
  const cfg = { frecuencia: 'quincenal', margen: 0, cuotaDiaria: 400000, horizonte: 31 };
  const p = L.plan([ob({ id: 'arriendo', dia: 5, monto: 600000, proximo: '2026-12-05' })], '2026-11-15', cfg);
  assert.equal(p.alcanza, true); // 2 quincenas antes del 5 dic: 800.000
});

/* ---------- pagos anuales ---------- */
test('anual: próxima fecha, siguiente año y 29 de febrero', () => {
  assert.equal(L.proximaAnual('2026-11-12', '2026-10-18'), '2027-10-18');
  assert.equal(L.proximaAnual('2026-11-12', '2026-12-01'), '2026-12-01');
  assert.equal(L.sumarAnios('2028-02-29', 1), '2029-02-28');
  const o = ob({ id: 'cf', tipo: 'anual', fecha: '2027-10-18', monto: 100000, proximo: '2027-10-18', apartado: 100000 });
  const n = L.pagar(o, 96000);
  assert.equal(n.proximo, '2028-10-18');
  assert.equal(n.activa, undefined); // sigue activo, no se termina como "una sola vez"
});

test('anual: se va juntando poco a poco en los meses que faltan', () => {
  const o = ob({ id: 'cf', tipo: 'anual', fecha: '2027-10-18', monto: 120000, proximo: '2027-10-18' });
  const r = L.repartirDia([o], 40000, '2026-11-12', { frecuencia: 'mensual' });
  assert.ok(r.detalle.cf.necesidad > 0 && r.detalle.cf.necesidad <= 12000, 'necesita ~1/11 por mes');
});

test('plan: pagos a más de 31 días también cuentan (sueldo mensual)', () => {
  const obs = [ob({ id: 'd', dia: 18, monto: 150000, proximo: '2026-12-18' }), ob({ id: 'c', dia: 18, monto: 70000, proximo: '2026-12-18' })];
  const p = L.plan(obs, '2026-11-12', { frecuencia: 'mensual', cuotaDiaria: 0 });
  assert.equal(p.items.length >= 2, true);
  assert.ok(p.necesaria > 0);
});
