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

  /** Cuenta los días de trabajo en [desde, hasta), saltando los días de descanso. */
  function diasDeTrabajo(desde, hasta, descanso) {
    let n = 0;
    for (let f = desde; f < hasta; f = sumarDias(f, 1)) {
      if (!descanso.includes(aFecha(f).getDay())) n++;
    }
    return n;
  }

  function redondearMil(x) {
    return Math.ceil(x / 1000) * 1000;
  }

  /** Primera fecha de pago de un compromiso nuevo. */
  function primeraFecha(o, hoy) {
    if (o.tipo === 'mensual') return proximaMensual(hoy, o.dia);
    if (o.tipo === 'semanal') return proximaSemanal(hoy, o.dia);
    return o.fecha; // única
  }

  /**
   * Cuánto hay que apartar HOY para este compromiso.
   * Lo que falta se divide entre los días de trabajo que quedan antes del pago,
   * contando hoy (hoy siempre cuenta: si está registrando, está trabajando).
   * Si un día no se aparta, lo que falta se reparte solo en los días siguientes.
   */
  function cuotaDelDia(o, hoy, descanso) {
    const falta = Math.max(0, (o.monto || 0) - (o.apartado || 0));
    if (falta === 0) return 0;
    if (o.proximo <= hoy) return falta; // vence hoy o ya se venció
    const dias = 1 + diasDeTrabajo(sumarDias(hoy, 1), o.proximo, descanso);
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
    n.proximo = o.tipo === 'semanal' ? sumarDias(o.proximo, 7) : siguienteMensual(o.proximo, o.dia);
    return n;
  }

  const Logica = {
    aFecha, iso, sumarDias, diasEntre, fechaMensual, proximaMensual, siguienteMensual,
    proximaSemanal, diasDeTrabajo, redondearMil, primeraFecha, cuotaDelDia, estado, repartir, pagar,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logica;
  else raiz.Logica = Logica;
})(typeof window !== 'undefined' ? window : globalThis);
