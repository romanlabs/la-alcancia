/*
 * Lógica pura (sin pantalla) de "La Alcancía".
 * Fechas siempre como texto 'AAAA-MM-DD' en hora local.
 * Funciona en el navegador (window.Logica) y en Node (require) para las pruebas.
 */
(function (raiz) {
  const DIA_MS = 86400000;

  function aFecha(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function iso(fecha) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function sumarDias(fechaIso, n) {
    const d = aFecha(fechaIso);
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  /** Días de a hasta b (b - a). */
  function diasEntre(a, b) {
    return Math.round((aFecha(b) - aFecha(a)) / DIA_MS);
  }

  /** Fecha del mes `mes` (0-11, puede desbordar) con el día `dia`, recortado al último día del mes. */
  function fechaMensual(anio, mes, dia) {
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    return iso(new Date(anio, mes, Math.min(dia, ultimo)));
  }

  /** Primera fecha >= desde que cae en el día `dia` del mes. */
  function proximaMensual(desde, dia) {
    const d = aFecha(desde);
    let f = fechaMensual(d.getFullYear(), d.getMonth(), dia);
    if (f < desde) f = fechaMensual(d.getFullYear(), d.getMonth() + 1, dia);
    return f;
  }

  /** El mismo día `dia` del mes siguiente a `fechaIso`. */
  function siguienteMensual(fechaIso, dia) {
    const d = aFecha(fechaIso);
    return fechaMensual(d.getFullYear(), d.getMonth() + 1, dia);
  }

  /** Primera fecha >= desde que cae en el día de la semana `diaSemana` (0 = domingo). */
  function proximaSemanal(desde, diaSemana) {
    const d = aFecha(desde);
    return sumarDias(desde, (diaSemana - d.getDay() + 7) % 7);
  }

  /**
   * Cuántos días se van a trabajar, más o menos, entre hoy (incluido) y `hasta` (sin incluir),
   * si se trabajan `diasSemana` días por semana. Redondea hacia abajo: mejor quedar con plata de más.
   * Hoy siempre cuenta (si está registrando, trabajó).
   */
  function diasProbables(hoy, hasta, diasSemana) {
    const calendario = diasEntre(hoy, hasta);
    if (calendario <= 1) return 1;
    return Math.max(1, Math.floor((calendario * diasSemana) / 7));
  }

  /** Normaliza la configuración: días que trabaja por semana (1-7) y días de margen antes del pago (0-7). */
  /** Cuántas veces por semana entra plata según la frecuencia (diario usa los días que trabaja). */
  const VECES_POR_SEMANA = { semanal: 1, quincenal: 7 / 15, mensual: 7 / 30 };

  function ajustes(cfg = {}) {
    const fija = VECES_POR_SEMANA[cfg.frecuencia];
    // "diasSemana" = veces por semana que entra plata (puede ser fracción: quincenal ≈ 0,47; mensual ≈ 0,23)
    const diasSemana = fija || Math.min(7, Math.max(1, Math.round(Number(cfg.diasSemana) || 7)));
    const margen = Math.min(7, Math.max(0, Math.round(Number(cfg.margen) || 0)));
    return { diasSemana, margen };
  }

  function redondearMil(x) {
    return Math.ceil(x / 1000) * 1000;
  }

  /** Primera fecha de pago de un compromiso nuevo. */
  /** El mismo día y mes, `n` años después (29 de febrero → 28 si el año no es bisiesto). */
  function sumarAnios(fechaIso, n = 1) {
    const d = aFecha(fechaIso);
    return fechaMensual(d.getFullYear() + n, d.getMonth(), d.getDate());
  }

  /** Para un pago anual: la primera fecha >= hoy con el mismo día y mes de `fecha`. */
  function proximaAnual(hoy, fecha) {
    let f = fecha;
    while (f < hoy) f = sumarAnios(f, 1);
    return f;
  }

  function primeraFecha(o, hoy) {
    if (o.tipo === 'mensual') return proximaMensual(hoy, o.dia);
    if (o.tipo === 'semanal') return proximaSemanal(hoy, o.dia);
    if (o.tipo === 'anual') return proximaAnual(hoy, o.fecha);
    return o.fecha; // única
  }

  /**
   * Cuánto hay que apartar HOY para este compromiso.
   * Meta: tener la plata `margen` días ANTES del pago (colchón por imprevistos).
   * Lo que falta se divide entre los días que probablemente se trabajen hasta esa meta.
   * Si un día no se trabaja o no se aparta, lo que falta se reparte solo en los días siguientes.
   */
  function cuotaDelDia(o, hoy, cfg) {
    const { diasSemana, margen } = ajustes(cfg);
    const falta = Math.max(0, (o.monto || 0) - (o.apartado || 0));
    if (falta === 0) return 0;
    const meta = sumarDias(o.proximo, -margen);
    if (meta <= hoy) return falta; // ya llegó la meta (o el pago): toca todo lo que falta
    const dias = diasProbables(hoy, meta, diasSemana);
    return Math.min(falta, redondearMil(falta / dias));
  }

  /** ¿Va bien? Compara lo apartado con lo que debería llevar si apartara parejo. */
  function estado(o, hoy) {
    if (o.activa === false) return 'terminada';
    if ((o.apartado || 0) >= (o.monto || 0)) return 'cubierta';
    if (o.proximo < hoy) return 'vencida';
    if (o.proximo === hoy) return 'vence-hoy';
    const total = Math.max(1, diasEntre(o.inicio, o.proximo));
    const corridos = Math.min(total, Math.max(0, diasEntre(o.inicio, hoy)));
    const esperado = (o.monto * corridos) / total;
    return (o.apartado || 0) >= esperado * 0.85 ? 'al-dia' : 'atrasada';
  }

  /**
   * Reparte `monto` entre los compromisos.
   * items: [{ id, cuota, falta, proximo, prioridad }]
   * 1) primero cubre la cuota de hoy, del pago más cercano al más lejano;
   * 2) si sobra (ella decidió apartar más), adelanta lo que falta en el mismo orden.
   */
  function repartir(items, monto) {
    const orden = [...items].sort(
      (a, b) => (a.proximo < b.proximo ? -1 : a.proximo > b.proximo ? 1 : (a.prioridad || 2) - (b.prioridad || 2))
    );
    const reparto = {};
    let resto = Math.max(0, monto);
    let cuotas = 0;
    for (const it of orden) {
      cuotas += it.cuota;
      const dar = Math.min(it.cuota, resto);
      if (dar > 0) reparto[it.id] = dar;
      resto -= dar;
    }
    const cubierto = Math.max(0, monto) - resto;
    for (const it of orden) {
      if (resto <= 0) break;
      const ya = reparto[it.id] || 0;
      const dar = Math.min(Math.max(0, it.falta - ya), resto);
      if (dar > 0) reparto[it.id] = ya + dar;
      resto -= dar;
    }
    return { reparto, sinCubrir: Math.max(0, cuotas - cubierto), sobrante: resto };
  }

  function siguienteFecha(o, fecha) {
    if (o.tipo === 'semanal') return sumarDias(fecha, 7);
    if (o.tipo === 'anual') return sumarAnios(fecha, 1);
    return siguienteMensual(fecha, o.dia);
  }

  /**
   * Todos los pagos que vienen en los próximos `horizonte` días (incluye los que se repiten
   * y los ya vencidos), con lo que falta para cada uno. Lo apartado de más pasa al siguiente.
   */
  function instancias(obligaciones, hoy, horizonte = 31) {
    const fin = sumarDias(hoy, horizonte);
    const out = [];
    for (const o of obligaciones) {
      if (o.activa === false || !o.proximo) continue;
      let fecha = o.proximo;
      let apartado = o.apartado || 0;
      let saldo = o.saldoTotal != null ? o.saldoTotal : Infinity;
      for (let n = 0; (n === 0 || fecha <= fin) && n < 12; n++) { // el próximo pago siempre cuenta
        const cuota = Math.min(o.monto || 0, saldo);
        const falta = Math.max(0, cuota - apartado);
        apartado = Math.max(0, apartado - cuota);
        if (falta > 0) out.push({ id: o.id, nombre: o.nombre, fecha, falta, prioridad: o.prioridad || 2, primera: n === 0 });
        saldo -= cuota;
        if (saldo <= 0 || o.tipo === 'unica') break;
        fecha = siguienteFecha(o, fecha);
      }
    }
    return out;
  }

  /**
   * Cuánto le toca por día a una cuenta: lo que le falta ÷ los días de trabajo que quedan hasta su meta
   * (la meta es `margen` días antes del pago). Si ya llegó la meta, le toca todo lo que falta.
   */
  function necesidadDiaria(falta, hoy, fechaPago, cfg) {
    const { diasSemana, margen } = ajustes(cfg);
    if (falta <= 0) return { necesidad: 0, dias: 0 };
    const meta = sumarDias(fechaPago, -margen);
    if (meta <= hoy) return { necesidad: falta, dias: 1 };
    const dias = diasProbables(hoy, meta, diasSemana);
    return { necesidad: Math.min(falta, redondearMil(falta / dias)), dias };
  }

  /**
   * Reparte `monto` entre las cuentas.
   * items: [{ id, necesidad, falta, prioridad, fecha }]
   * 1) Por prioridad (1, luego 2, luego 3): si alcanza, cada cuenta recibe lo que necesita hoy;
   *    si no alcanza, el dinero se reparte en proporción a lo que necesita cada una (en miles).
   * 2) Si sobra, adelanta lo que falta, empezando por lo que vence antes.
   * 3) Lo que quede (todo cubierto) es ahorro extra.
   */
  function asignar(items, monto) {
    const reparto = {};
    let resto = Math.max(0, monto);
    const dar = (id, m) => { if (m > 0) { reparto[id] = (reparto[id] || 0) + m; resto -= m; } };
    const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
    for (const p of [1, 2, 3]) {
      const grupo = items.filter((x) => (x.prioridad || 2) === p && x.necesidad > 0).sort(porFecha);
      const total = grupo.reduce((s, x) => s + x.necesidad, 0);
      if (!total || resto <= 0) continue;
      if (resto >= total) { grupo.forEach((x) => dar(x.id, x.necesidad)); continue; }
      const base = resto;
      const partes = grupo.map((x) => ({ x, m: Math.floor((base * x.necesidad) / total / 1000) * 1000 }));
      let sobra = base - partes.reduce((s, q) => s + q.m, 0);
      for (let vuelta = 0; sobra > 0.5 && vuelta < 1000; vuelta++) {
        let dioAlgo = false;
        for (const q of partes) {
          if (sobra <= 0.5) break;
          const d = Math.min(1000, sobra, q.x.necesidad - q.m);
          if (d > 0) { q.m += d; sobra -= d; dioAlgo = true; }
        }
        if (!dioAlgo) break;
      }
      partes.forEach((q) => dar(q.x.id, q.m));
    }
    for (const x of [...items].sort(porFecha)) {
      if (resto <= 0) break;
      dar(x.id, Math.min(resto, Math.max(0, x.falta - (reparto[x.id] || 0))));
    }
    return { reparto, extra: Math.max(0, resto) };
  }

  /**
   * Reparte la plata de hoy entre las cuentas activas y explica por qué:
   * detalle[id] = { falta, necesidad, dias, fecha } (lo que faltaba, lo que necesitaba hoy, días que quedaban).
   */
  function repartirDia(obligaciones, monto, hoy, cfg = {}) {
    const items = [];
    const detalle = {};
    for (const o of obligaciones) {
      if (o.activa === false) continue;
      const falta = Math.max(0, (o.monto || 0) - (o.apartado || 0));
      if (!falta) continue;
      const n = hoy ? necesidadDiaria(falta, hoy, o.proximo, cfg) : { necesidad: falta, dias: 1 };
      items.push({ id: o.id, necesidad: n.necesidad, falta, prioridad: o.prioridad || 2, fecha: o.proximo });
      detalle[o.id] = { falta, necesidad: n.necesidad, dias: n.dias, fecha: o.proximo };
    }
    const r = asignar(items, monto);
    return { reparto: r.reparto, extra: r.extra, detalle };
  }

  /** Cuántos días mirar hacia adelante: con sueldo mensual, dos meses; si no, un mes. */
  function horizontePara(cfg = {}) {
    if (cfg.horizonte) return cfg.horizonte;
    return { mensual: 62, quincenal: 45 }[cfg.frecuencia] || 31;
  }

  /** Simula los próximos días repartiendo `cuota` con la misma regla de cada día. */
  function simular(obligaciones, hoy, cfg, cuota, apartadoHoy) {
    const { diasSemana } = ajustes(cfg);
    const xs = instancias(obligaciones, hoy, horizontePara(cfg)).map((x, i) => ({ ...x, clave: String(i), restante: x.falta }));
    const ultima = xs.reduce((m, x) => (x.fecha > m ? x.fecha : m), hoy);
    const porDia = (cuota * diasSemana) / 7; // en promedio, contando los días que no se trabaja
    for (let f = hoy, i = 0; f <= ultima && i < 400; f = sumarDias(f, 1), i++) {
      const presupuesto = i === 0 ? Math.max(0, cuota - apartadoHoy) : porDia;
      // compite solo el próximo pago pendiente de cada cuenta
      const vistos = new Set();
      const vivos = xs
        .filter((x) => x.restante > 0.5 && x.fecha >= f)
        .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
        .filter((x) => (vistos.has(x.id) ? false : vistos.add(x.id)));
      const items = vivos.map((x) => ({
        id: x.clave, falta: x.restante, prioridad: x.prioridad, fecha: x.fecha,
        necesidad: necesidadDiaria(x.restante, f, x.fecha, cfg).necesidad,
      }));
      const r = asignar(items, presupuesto);
      for (const x of vivos) x.restante -= r.reparto[x.clave] || 0;
    }
    for (const x of xs) {
      x.faltante = Math.max(0, redondearMil(x.restante - 0.5));
      x.cubierto = x.falta - x.faltante;
      delete x.restante;
    }
    return xs;
  }

  /**
   * Proyección: dando `cuotaDiaria` cada día que se trabaja y repartiéndola igual que hoy,
   * ¿llega cada pago completo? Devuelve lo que faltaría en cada uno y la cuota que cubriría todo.
   * `apartadoHoy`: lo que ya se apartó hoy (ya está sumado en lo apartado de cada cuenta).
   */
  function plan(obligaciones, hoy, cfg = {}, apartadoHoy = 0) {
    const cuota = Math.max(0, Number(cfg.cuotaDiaria) || 0);
    const items = simular(obligaciones, hoy, cfg, cuota, apartadoHoy);
    const alcanzaCon = (c) => simular(obligaciones, hoy, cfg, c, apartadoHoy).every((x) => x.faltante === 0);
    let necesaria = 0;
    if (items.length) {
      let bajo = 0;
      let alto = Math.max(1000, redondearMil(items.reduce((s, x) => s + x.falta, 0) + apartadoHoy));
      if (!alcanzaCon(alto)) alto *= 4;
      while (alto - bajo > 1000) {
        const medio = redondearMil((bajo + alto) / 2);
        if (medio >= alto) break;
        if (alcanzaCon(medio)) alto = medio; else bajo = medio;
      }
      necesaria = alto;
    }
    return {
      items,
      cuota,
      necesaria,
      alcanza: items.every((x) => x.faltante === 0),
      faltanteTotal: items.reduce((s, x) => s + x.faltante, 0),
    };
  }

  /**
   * Reparte `monto` entre las metas de ahorro según su porcentaje (peso).
   * Las metas que ya llegaron a su objetivo no reciben; lo que no tenga a dónde ir queda en `sobra`.
   */
  function repartirMetas(metas, monto) {
    const reparto = {};
    let resto = Math.max(0, monto);
    const abiertas = (metas || []).filter((m) => m.activa !== false && (m.porcentaje || 0) > 0);
    // Varias vueltas: si una meta se llena, lo suyo pasa a las demás.
    for (let vuelta = 0; vuelta < 5 && resto > 0; vuelta++) {
      const vivas = abiertas.filter((m) => !(m.objetivo > 0) || (m.ahorrado || 0) + (reparto[m.id] || 0) < m.objetivo);
      const peso = vivas.reduce((s, m) => s + m.porcentaje, 0);
      if (!peso) break;
      const base = resto;
      let dado = 0;
      vivas.forEach((m, i) => {
        let parte = i === vivas.length - 1 ? base - dado : Math.floor((base * m.porcentaje) / peso / 1000) * 1000;
        if (m.objetivo > 0) parte = Math.min(parte, m.objetivo - (m.ahorrado || 0) - (reparto[m.id] || 0));
        parte = Math.max(0, parte);
        if (parte) reparto[m.id] = (reparto[m.id] || 0) + parte;
        dado += parte;
      });
      resto = base - dado;
      if (!dado) break;
    }
    return { reparto, sobra: Math.max(0, resto) };
  }

  /**
   * Reparto completo del día:
   * 1) `ahorroPct` % va primero a ahorro ("páguese primero");
   * 2) el resto, a las cuentas (repartirDia);
   * 3) lo que sobre de las cuentas también va a ahorro;
   * 4) el ahorro se divide entre las metas según su porcentaje. Si no hay metas, queda como ahorro extra.
   */
  function repartirTodo(obligaciones, metas, monto, hoy, cfg = {}) {
    const pct = Math.min(100, Math.max(0, Number(cfg.ahorroPct) || 0));
    const primeroAhorro = Math.min(monto, Math.round((monto * pct) / 100 / 1000) * 1000);
    const cuentas = repartirDia(obligaciones, monto - primeroAhorro, hoy, cfg);
    const totalAhorro = primeroAhorro + cuentas.extra;
    const m = repartirMetas(metas, totalAhorro);
    return {
      reparto: cuentas.reparto,
      detalle: cuentas.detalle,
      ahorro: m.reparto,
      extra: m.sobra,
      primeroAhorro,
      sobroDeCuentas: cuentas.extra,
    };
  }

  /** Si el recibo de este mes ya se pagó: el próximo es el del mes siguiente. */
  function proximaSiYaPagoEsteMes(hoy, dia) {
    const d = aFecha(hoy);
    return fechaMensual(d.getFullYear(), d.getMonth() + 1, dia);
  }

  /** Registra un pago. Devuelve el compromiso actualizado (no modifica el original). */
  function pagar(o, pagado) {
    const n = { ...o };
    n.apartado = Math.max(0, (o.apartado || 0) - pagado);
    if (o.saldoTotal != null) {
      n.saldoTotal = Math.max(0, o.saldoTotal - pagado);
      if (n.saldoTotal === 0) {
        n.activa = false;
        return n;
      }
      if (n.monto > n.saldoTotal) n.monto = n.saldoTotal; // última cuota más pequeña
    }
    if (o.tipo === 'unica') {
      n.activa = false;
      return n;
    }
    n.inicio = o.proximo;
    n.proximo = siguienteFecha(o, o.proximo);
    return n;
  }

  const Logica = {
    aFecha, iso, sumarDias, diasEntre, fechaMensual, proximaMensual, siguienteMensual,
    proximaSemanal, diasProbables, ajustes, redondearMil, primeraFecha, cuotaDelDia, estado, repartir, pagar,
    siguienteFecha, sumarAnios, proximaAnual, instancias, plan, repartirDia, asignar, necesidadDiaria, simular, proximaSiYaPagoEsteMes,
    repartirMetas, repartirTodo,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logica;
  else raiz.Logica = Logica;
})(typeof window !== 'undefined' ? window : globalThis);
