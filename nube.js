/*
 * Sincronización con Supabase (PostgreSQL en la nube).
 * - El celular sigue guardando todo en localStorage (funciona sin internet).
 * - Con sesión iniciada, cada cambio se sube a la nube (unos segundos después).
 * - Al abrir la app o volver a ella, se baja lo de la nube (así se ven los cambios hechos en pgAdmin).
 * La llave "publishable" es pública a propósito: la seguridad la dan las reglas RLS de la base
 * (cada usuario solo ve y cambia sus propias filas). Ver supabase/esquema.sql.
 */
const Nube = (() => {
  const URL_PROYECTO = 'https://sapmnkhvtcfwlnecstpn.supabase.co';
  const LLAVE_PUBLICA = 'sb_publishable_qKvww3X1UpXWX5NeRn61wg_mkdjKFka';
  const PENDIENTE = 'la-alcancia-nube-pendiente';
  const ULTIMO_USUARIO = 'la-alcancia-nube-usuario';

  const disponible = typeof window !== 'undefined' && window.supabase && window.supabase.createClient;
  const sb = disponible ? window.supabase.createClient(URL_PROYECTO, LLAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;

  let sesion = null;
  let estado = disponible ? 'sin-sesion' : 'no-disponible'; // sin-sesion | al-dia | subiendo | bajando | error
  let temporizador = null;
  let alCambiar = () => {};
  let alSubir = () => {};

  const marcar = (v) => { try { v ? localStorage.setItem(PENDIENTE, '1') : localStorage.removeItem(PENDIENTE); } catch (e) { /* nada */ } };
  const hayPendiente = () => { try { return localStorage.getItem(PENDIENTE) === '1'; } catch (e) { return false; } };
  const poner = (e) => { estado = e; alCambiar(); };
  const num = (x) => (x == null ? 0 : Number(x));

  /* ---------- conversión app ⇄ tablas ---------- */
  const aFilaObligacion = (o, uid) => ({
    id: o.id, user_id: uid, nombre: o.nombre, tipo: o.tipo,
    dia: o.tipo === 'unica' ? null : (o.dia ?? null), fecha: o.fecha || null,
    monto: o.monto || 0, apartado: o.apartado || 0, prioridad: o.prioridad || 2,
    saldo_total: o.saldoTotal ?? null, inicio: o.inicio || null, proximo: o.proximo || null,
    activa: o.activa !== false, nota: o.nota || '', bolsillo: o.bolsillo || '',
  });
  const deFilaObligacion = (f) => ({
    id: f.id, nombre: f.nombre, tipo: f.tipo, dia: f.dia ?? undefined, fecha: f.fecha || undefined,
    monto: num(f.monto), apartado: num(f.apartado), prioridad: f.prioridad,
    saldoTotal: f.saldo_total == null ? null : num(f.saldo_total),
    inicio: f.inicio, proximo: f.proximo, activa: f.activa, nota: f.nota || '', bolsillo: f.bolsillo || '',
  });
  const aFilaRegistro = (r, uid) => ({
    id: r.id, user_id: uid, fecha: r.fecha, ingresos: r.ingresos || {}, ingreso: r.ingreso || 0,
    gasolina: r.gasolina || 0, otros: r.otros || 0, carro: r.carro || 0, apartado: r.apartado || 0,
    reparto: r.reparto || {}, extra: r.extra || 0, nota: r.nota || '', ahorro: r.ahorro || {},
  });
  const deFilaRegistro = (f) => ({
    id: f.id, fecha: f.fecha, ingresos: f.ingresos || {}, ingreso: num(f.ingreso), gasolina: num(f.gasolina),
    otros: num(f.otros), carro: num(f.carro), apartado: num(f.apartado), reparto: f.reparto || {},
    extra: num(f.extra), nota: f.nota || '', ahorro: f.ahorro || {},
  });
  const aFilaPago = (p, uid) => ({
    id: p.id, user_id: uid, fecha: p.fecha, obligacion_id: p.obligacionId || null,
    nombre: p.nombre || '', monto: p.monto || 0, antes: p.antes || null, tipo: p.tipo || 'pago',
  });
  const deFilaPago = (f) => ({
    id: f.id, fecha: f.fecha, obligacionId: f.obligacion_id, nombre: f.nombre, monto: num(f.monto), antes: f.antes || undefined,
    tipo: f.tipo || 'pago',
  });
  const aFilaMeta = (m, uid) => ({
    id: m.id, user_id: uid, nombre: m.nombre, objetivo: m.objetivo || null, ahorrado: m.ahorrado || 0,
    porcentaje: m.porcentaje ?? 50, nota: m.nota || '', activa: m.activa !== false, bolsillo: m.bolsillo || '',
  });
  const deFilaMeta = (f) => ({
    id: f.id, nombre: f.nombre, objetivo: f.objetivo == null ? null : num(f.objetivo), ahorrado: num(f.ahorrado),
    porcentaje: f.porcentaje, nota: f.nota || '', activa: f.activa, bolsillo: f.bolsillo || '',
  });

  async function chequear(promesa) {
    const { data, error } = await promesa;
    if (error) throw error;
    return data;
  }

  /** Sube todo el estado local: inserta/actualiza filas y borra las que ya no existen en el celular. */
  async function subir(datos) {
    if (!sb || !sesion) return;
    const uid = sesion.user.id;
    poner('subiendo');
    try {
      await chequear(sb.from('configuracion').upsert({
        user_id: uid, configurado: !!datos.configurado, dias_semana: datos.diasSemana, margen: datos.margen,
        cuota_diaria: datos.cuotaDiaria || 0, fuentes: datos.fuentes, extra: datos.extra || 0,
        ahorro_pct: datos.ahorroPct || 0, banco: datos.banco || 'Nu',
        actualizado: new Date().toISOString(),
      }));
      const tablas = [
        ['obligaciones', datos.obligaciones.map((o) => aFilaObligacion(o, uid))],
        ['registros', datos.registros.map((r) => aFilaRegistro(r, uid))],
        ['pagos', datos.pagos.map((p) => aFilaPago(p, uid))],
        ['metas', (datos.metas || []).map((m) => aFilaMeta(m, uid))],
      ];
      for (const [tabla, filas] of tablas) {
        if (filas.length) await chequear(sb.from(tabla).upsert(filas));
        // Solo se borra en la nube lo que se borró a propósito en el celular.
        // (Antes se borraba todo lo que el celular no tuviera, y un celular desactualizado podía borrar cuentas.)
        const borrar = [...((datos.borrados && datos.borrados[tabla]) || [])];
        if (borrar.length) {
          await chequear(sb.from(tabla).delete().eq('user_id', uid).in('id', borrar));
          datos.borrados[tabla] = datos.borrados[tabla].filter((id) => !borrar.includes(id));
        }
      }
      marcar(false);
      alSubir();
      poner('al-dia');
    } catch (e) {
      console.warn('[nube] no se pudo subir', e);
      marcar(true);
      poner('error');
    }
  }

  /** Baja todo de la nube. Devuelve null si el usuario todavía no tiene nada guardado. */
  async function bajar() {
    if (!sb || !sesion) return null;
    poner('bajando');
    try {
      const [conf] = await chequear(sb.from('configuracion').select('*').limit(1));
      if (!conf) { poner('al-dia'); return null; }
      const [obs, regs, pags, mets] = await Promise.all([
        chequear(sb.from('obligaciones').select('*')),
        chequear(sb.from('registros').select('*').order('fecha')),
        chequear(sb.from('pagos').select('*').order('fecha')),
        chequear(sb.from('metas').select('*').order('actualizado')),
      ]);
      poner('al-dia');
      return {
        configurado: conf.configurado, diasSemana: conf.dias_semana, margen: conf.margen,
        cuotaDiaria: num(conf.cuota_diaria), fuentes: conf.fuentes, extra: num(conf.extra),
        ahorroPct: conf.ahorro_pct || 0, metas: mets.map(deFilaMeta), banco: conf.banco || 'Nu',
        obligaciones: obs.map(deFilaObligacion), registros: regs.map(deFilaRegistro), pagos: pags.map(deFilaPago),
      };
    } catch (e) {
      console.warn('[nube] no se pudo bajar', e);
      poner('error');
      return undefined; // error: no tocar lo local
    }
  }

  return {
    get disponible() { return !!sb; },
    get sesion() { return sesion; },
    get estado() { return estado; },
    get correo() { return sesion?.user?.email || ''; },
    onCambio(fn) { alCambiar = fn; },
    onSubido(fn) { alSubir = fn; },

    async iniciar() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      sesion = data.session;
      sb.auth.onAuthStateChange((_evento, s) => { sesion = s; if (!s) poner('sin-sesion'); });
      if (!sesion) poner('sin-sesion');
      return sesion;
    },

    async entrar(correo, clave) {
      const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
      if (error) throw error;
      sesion = data.session;
      return sesion;
    },

    async crearCuenta(correo, clave) {
      const { data, error } = await sb.auth.signUp({
        email: correo, password: clave,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      sesion = data.session; // null si hay que confirmar el correo
      return data;
    },

    async salir() {
      if (sb) await sb.auth.signOut();
      sesion = null;
      try { localStorage.removeItem(ULTIMO_USUARIO); } catch (e) { /* nada */ }
      poner('sin-sesion');
    },

    /** Al abrir o volver a la app. Devuelve los datos de la nube si hay que reemplazar los locales. */
    async sincronizar(datosLocales, preguntarCual) {
      if (!sb || !sesion) return null;
      const uid = sesion.user.id;
      let anterior = null;
      try { anterior = localStorage.getItem(ULTIMO_USUARIO); } catch (e) { /* nada */ }
      if (anterior === uid && hayPendiente()) await subir(datosLocales);
      const remotos = await bajar();
      if (remotos === undefined) return null; // sin conexión
      const localConDatos = datosLocales.configurado && datosLocales.obligaciones.length;
      let usar = null;
      if (!remotos) {
        if (localConDatos) await subir(datosLocales); // primera vez: sube lo del celular
      } else if (anterior !== uid && localConDatos) {
        // Primera vez en este celular con datos en ambos lados: que el usuario elija.
        const cual = await preguntarCual();
        if (cual === 'celular') {
          await subir(datosLocales); // junta: sube lo del celular sin borrar lo de la nube
          usar = await bajar();
          if (usar === undefined) usar = null;
        } else {
          usar = remotos;
        }
      } else {
        usar = remotos;
      }
      try { localStorage.setItem(ULTIMO_USUARIO, uid); } catch (e) { /* nada */ }
      return usar;
    },

    /** Después de cada cambio: espera un momento (por si hay más cambios) y sube. */
    programarSubida(obtenerDatos) {
      if (!sb) return;
      marcar(true);
      if (!sesion) return;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => subir(obtenerDatos()), 1500);
    },

    get pendiente() { return hayPendiente(); },

    subirAhora: subir,
  };
})();
