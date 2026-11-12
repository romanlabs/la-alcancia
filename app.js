/* Pantallas de "La Alcancía". Todo se guarda en este teléfono (localStorage). */
const L = window.Logica;
const CLAVE = 'la-alcancia-v1';
const CLAVE_PIN = 'la-alcancia-clave';
const MINUTOS_BLOQUEO = 5;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const PLANTILLA = [
  { nombre: 'Tarjeta (préstamo a mamá)', tipo: 'mensual', prioridad: 1, deuda: true,
    ayuda: 'La cuota que acordaron cada mes. Abajo, cuánto se debe en total.' },
  { nombre: 'Recibo de luz', tipo: 'mensual', prioridad: 1 },
  { nombre: 'Recibo de agua', tipo: 'mensual', prioridad: 1 },
  { nombre: 'Recibo de gas', tipo: 'mensual', prioridad: 1 },
  { nombre: 'Internet / celular', tipo: 'mensual', prioridad: 2 },
  { nombre: 'Colegio', tipo: 'mensual', prioridad: 1, deuda: true,
    ayuda: 'La cuota del mes. Si hay una deuda atrasada, ponga el total abajo.' },
  { nombre: 'Mercado', tipo: 'semanal', prioridad: 1, ayuda: 'Lo de la semana y el día en que hace mercado.' },
  { nombre: 'Fondo del carro', tipo: 'mensual', prioridad: 2,
    ayuda: 'Aceite, llantas, arreglos: una platica fija cada mes para que el próximo daño no sea otra deuda.' },
];


/* Plantilla para un perfil propio (no el de mamá) */
const PLANTILLA_PERSONAL = [
  { nombre: 'Arriendo / aporte a la casa', tipo: 'mensual', prioridad: 1 },
  { nombre: 'Celular / internet', tipo: 'mensual', prioridad: 1 },
  { nombre: 'Transporte', tipo: 'mensual', prioridad: 2 },
  { nombre: 'Tarjeta de crédito', tipo: 'mensual', prioridad: 1, deuda: true,
    ayuda: 'La cuota del mes de su tarjeta. Si sabe la deuda total, póngala abajo.' },
  { nombre: 'Suscripciones (música, series…)', tipo: 'mensual', prioridad: 3 },
];

/* ---------- utilidades ---------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const fmtPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos = (n) => fmtPesos.format(Math.round(n || 0));
const num = (s) => Number(String(s ?? '').replace(/\D/g, '')) || 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => L.iso(new Date());
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fechaLarga = (f) => L.aFecha(f).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = (f) => L.aFecha(f).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const sumar = (obj) => Object.values(obj || {}).reduce((s, n) => s + (Number(n) || 0), 0);

function cuandoVence(f) {
  const d = L.diasEntre(hoy(), f);
  if (d === 0) return 'vence HOY';
  if (d === 1) return 'vence mañana';
  if (d < 0) return `se venció hace ${-d} día${d === -1 ? '' : 's'}`;
  return `en ${d} días`;
}

const ETIQUETA = { cubierta: 'Lista ✔', 'al-dia': 'Va bien', atrasada: 'No alcanza', 'vence-hoy': 'Vence hoy', vencida: 'Vencida', terminada: 'Terminada' };

/* Campos de plata: muestran puntos de miles mientras se escribe */
function campoPesos(nombre, valor = '', extra = '') {
  const v = valor ? Number(valor).toLocaleString('es-CO') : '';
  return `<input name="${esc(nombre)}" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${v ? '$ ' + v : ''}" data-pesos ${extra}>`;
}
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-pesos]')) return;
  const n = num(e.target.value);
  e.target.value = n ? '$ ' + n.toLocaleString('es-CO') : '';
});

function avisar(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.add('visible');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => a.classList.remove('visible'), 2600);
}

/* ---------- datos ---------- */
function estadoNuevo() {
  return {
    version: 3, configurado: false,
    diasSemana: 6, margen: 2, cuotaDiaria: 40000,
    fuentes: ['InDrive'], extra: 0,
    ahorroPct: 0, metas: [], banco: 'Nu', frecuencia: 'diario',
    obligaciones: [], registros: [], pagos: [],
    borrados: { obligaciones: [], registros: [], pagos: [], metas: [] }, // para borrarlos también en la nube
  };
}
/** Anota que algo se borró aquí, para borrarlo también en la nube (y solo eso). */
function marcarBorrado(tabla, id) {
  if (!datos.borrados) datos.borrados = { obligaciones: [], registros: [], pagos: [], metas: [] };
  if (!datos.borrados[tabla]) datos.borrados[tabla] = [];
  if (!datos.borrados[tabla].includes(id)) datos.borrados[tabla].push(id);
}
const FRECUENCIAS_VALIDAS = ['diario', 'semanal', 'quincenal', 'mensual'];
/** Pone al día datos guardados con versiones anteriores de la app. */
function migrar(d) {
  const n = { ...estadoNuevo(), ...d };
  if (d.diasSemana == null && Array.isArray(d.descanso)) n.diasSemana = Math.max(1, 7 - d.descanso.length);
  delete n.descanso;
  if (!Array.isArray(n.fuentes) || !n.fuentes.length) n.fuentes = ['InDrive'];
  const b = n.borrados || {};
  n.borrados = { obligaciones: b.obligaciones || [], registros: b.registros || [], pagos: b.pagos || [], metas: b.metas || [] };
  n.metas = Array.isArray(n.metas) ? n.metas : [];
  if (!FRECUENCIAS_VALIDAS.includes(n.frecuencia)) n.frecuencia = 'diario';
  n.ahorroPct = Math.min(100, Math.max(0, Number(n.ahorroPct) || 0));
  n.registros = (n.registros || []).map((r) => ({
    ingresos: r.ingresos || { Total: r.ingreso || 0 },
    gasolina: r.gasolina ?? (r.carro || 0),
    otros: r.otros || 0,
    extra: r.extra || 0,
    nota: r.nota || '',
    ahorro: r.ahorro || {},
    ...r,
  }));
  n.version = 3;
  return n;
}
/* ---------- perfiles ("Mamá", "Yo"...) ---------- */
const CLAVE_PERFILES = 'la-alcancia-perfiles';
const claveDatos = (perfil) => (perfil === 'mama' ? CLAVE : `${CLAVE}:${perfil}`); // mamá conserva la clave de siempre
function leerPerfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_PERFILES) || 'null');
    if (p && Array.isArray(p.lista) && p.lista.length) return p;
  } catch (e) { /* nada */ }
  return { lista: [{ id: 'mama', nombre: 'Mamá' }], activo: 'mama' };
}
function guardarPerfiles() {
  try { localStorage.setItem(CLAVE_PERFILES, JSON.stringify(perfiles)); } catch (e) { /* nada */ }
}
let perfiles = leerPerfiles();
const nombrePerfil = (id) => (perfiles.lista.find((p) => p.id === id) || {}).nombre || 'Mamá';

function cargar(perfil = perfiles.activo) {
  let d = estadoNuevo();
  try {
    const t = localStorage.getItem(claveDatos(perfil));
    if (t) d = migrar(JSON.parse(t));
  } catch (e) { /* sin almacenamiento: empieza vacío */ }
  d.perfil = perfil;
  d.perfilNombre = nombrePerfil(perfil);
  return d;
}
function guardarLocal() {
  try {
    localStorage.setItem(claveDatos(datos.perfil || 'mama'), JSON.stringify(datos));
  } catch (e) {
    avisar('No se pudo guardar en este teléfono');
  }
}

async function cambiarPerfil(id) {
  if (id === datos.perfil) { render(); return; }
  if (typeof Nube !== 'undefined') await Nube.subirSiPendiente(datos);
  guardarLocal();
  perfiles.activo = id;
  guardarPerfiles();
  datos = cargar(id);
  vista = 'hoy';
  render();
  window.scrollTo(0, 0);
  traerDeLaNube(true);
}

function nuevoPerfil() {
  abrirModal(`
    <h2>Nuevo perfil</h2>
    <p class="suave">Cada perfil tiene sus propias cuentas, metas, cajitas y cuota. Por ejemplo: "Yo".</p>
    <label>Nombre</label><input name="nombre" required maxlength="20" placeholder="Ej: Yo">
    ${botonesModal(false, 'Crear')}
  `, (fd) => {
    const nombre = String(fd.get('nombre')).trim();
    if (!nombre) { avisar('Falta el nombre'); return false; }
    const base = nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'perfil';
    const id = perfiles.lista.some((p) => p.id === base) ? `${base}${Date.now().toString(36).slice(-4)}` : base;
    perfiles.lista.push({ id, nombre });
    guardarPerfiles();
    cambiarPerfil(id);
  });
}

function pintarPerfiles() {
  const caja = $('#perfiles');
  if (!caja) return;
  caja.hidden = bloqueada || !nubeLista || !Nube.sesion || eligiendoPerfil;
  caja.innerHTML = perfiles.lista.map((p) =>
    `<button type="button" class="perfil ${p.id === datos.perfil ? 'activo' : ''}" data-perfil="${esc(p.id)}">${esc(p.nombre)}</button>`).join('') +
    '<button type="button" class="perfil mas" id="btn-nuevo-perfil" aria-label="Nuevo perfil">+</button>';
  $$('[data-perfil]', caja).forEach((b) => (b.onclick = () => cambiarPerfil(b.dataset.perfil)));
  $('#btn-nuevo-perfil').onclick = nuevoPerfil;
}

/** Frecuencia de ingresos del perfil: textos según si le pagan a diario, por semana, quincena o mes. */
const FRECUENCIAS = {
  diario: { nombre: 'Varía / casi a diario', por: 'al día', cada: 'cada día que trabaja', pago: 'día de trabajo', pagos: 'días de trabajo', periodo: 1 },
  semanal: { nombre: 'Cada semana', por: 'por semana', cada: 'cada semana', pago: 'pago semanal', pagos: 'pagos semanales', periodo: 7 },
  quincenal: { nombre: 'Cada quincena', por: 'por quincena', cada: 'cada quincena', pago: 'quincena', pagos: 'quincenas', periodo: 15 },
  mensual: { nombre: 'Cada mes', por: 'por mes', cada: 'cada mes', pago: 'sueldo', pagos: 'sueldos', periodo: 30 },
};
const frec = () => FRECUENCIAS[datos.frecuencia] || FRECUENCIAS.diario;
function guardar() {
  guardarLocal();
  if (typeof Nube !== 'undefined') Nube.programarSubida(() => datos);
}

let datos = cargar(perfiles.activo);
let vista = 'hoy';

const activas = () => datos.obligaciones.filter((o) => o.activa !== false);
const buscar = (id) => datos.obligaciones.find((o) => o.id === id);

function crearObligacion(campos) {
  const f = hoy();
  const o = { id: nuevoId(), activa: true, apartado: 0, prioridad: 2, saldoTotal: null, inicio: f, ...campos };
  o.proximo = campos.proximo || L.primeraFecha(o, f);
  return o;
}

const apartadoDelDia = (fecha) => datos.registros.filter((r) => r.fecha === fecha).reduce((s, r) => s + r.apartado, 0);

/** Proyección con la cuota diaria (o la necesaria, si la cuota está en automático). */
function proyeccion() {
  const f = hoy();
  const desde = L.sumarDias(f, -(frec().periodo - 1));
  const delPeriodo = datos.registros.filter((r) => r.fecha >= desde && r.fecha <= f);
  const ya = delPeriodo.reduce((s, r) => s + r.apartado, 0);
  const yaCuentas = delPeriodo.reduce((s, r) => s + sumar(r.reparto), 0);
  const fraccion = 1 - Math.min(90, datos.ahorroPct || 0) / 100; // parte que va a cuentas
  const cuotaCuentas = Math.round((datos.cuotaDiaria || 0) * fraccion);
  let p = L.plan(activas(), f, { ...datos, cuotaDiaria: cuotaCuentas }, yaCuentas);
  const automatica = !datos.cuotaDiaria;
  if (automatica) p = L.plan(activas(), f, { ...datos, cuotaDiaria: p.necesaria }, yaCuentas);
  const objetivo = automatica ? L.redondearMil(p.necesaria / fraccion) : datos.cuotaDiaria;
  p.necesariaTotal = L.redondearMil(p.necesaria / fraccion);
  p.fraccion = fraccion;
  const faltantes = {};
  for (const x of p.items) if (x.primera) faltantes[x.id] = x.faltante;
  return { ...p, automatica, objetivo, ya, pendienteHoy: Math.max(0, objetivo - ya), faltantes };
}

/** Estado de un pago según la proyección: va bien / no alcanza / lista / vence / vencida. */
function estadoDe(o, f, faltantes) {
  const e = L.estado(o, f);
  if (e === 'al-dia' || e === 'atrasada') return faltantes[o.id] > 0 ? 'atrasada' : 'al-dia';
  return e;
}

/* ---------- registros del día (aplicar / revertir) ---------- */
function aplicarReparto(r) {
  for (const [id, m] of Object.entries(r.reparto || {})) {
    const o = buscar(id);
    if (o) o.apartado += m;
    else datos.extra += m; // el pago ya no existe: la plata queda como ahorro extra
  }
  for (const [id, m] of Object.entries(r.ahorro || {})) {
    const meta = buscarMeta(id);
    if (meta) meta.ahorrado = (meta.ahorrado || 0) + m;
    else datos.extra += m;
  }
  datos.extra += r.extra || 0;
}
function revertirReparto(r) {
  for (const [id, m] of Object.entries(r.ahorro || {})) {
    const meta = buscarMeta(id);
    if (meta) meta.ahorrado = Math.max(0, (meta.ahorrado || 0) - m);
  }
  for (const [id, m] of Object.entries(r.reparto || {})) {
    const o = buscar(id);
    if (o) o.apartado = Math.max(0, o.apartado - m);
  }
  datos.extra = Math.max(0, datos.extra - (r.extra || 0));
}

/* ---------- navegación ---------- */
function ir(v) {
  vista = v;
  render();
  window.scrollTo(0, 0);
}
$('#pestanas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-vista]');
  if (b) ir(b.dataset.vista);
});


/* ---------- INICIO DE SESIÓN y ELEGIR PERFIL ---------- */
let nubeLista = false;       // ya se sabe si hay sesión
let eligiendoPerfil = false; // recién entró: mostrar los perfiles

function pantallaCargando(c) {
  c.innerHTML = '<div class="tarjeta" style="margin-top:40px;text-align:center"><p class="suave">Cargando…</p></div>';
}

function pantallaLogin(c) {
  if (!Nube.disponible) {
    c.innerHTML = `<div class="tarjeta" style="margin-top:40px">
      <p class="cifra-m">Sin conexión</p>
      <p class="suave">No se pudo conectar con la nube. Revise el internet y vuelva a intentar.</p>
      <button class="principal" id="btn-reintentar">Reintentar</button></div>`;
    $('#btn-reintentar').onclick = () => location.reload();
    return;
  }
  c.innerHTML = `
    <form class="tarjeta" id="form-login" style="margin-top:24px">
      <p class="cifra-m">Entrar</p>
      <p class="suave">Las cuentas están guardadas en la nube. Entre con su correo y contraseña.</p>
      <label for="login-correo">Correo</label><input id="login-correo" name="correo" type="email" autocomplete="email" required>
      <label for="login-clave">Contraseña</label><input id="login-clave" name="clave" type="password" autocomplete="current-password" required>
      <button class="principal">Entrar</button>
      <button type="button" id="btn-olvide-clave" style="width:100%;margin-top:10px">Olvidé la contraseña</button>
    </form>`;
  const form = $('#form-login');
  const botones = () => $$('button', form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    botones().forEach((b) => (b.disabled = true));
    try {
      await Nube.entrar(String(fd.get('correo')).trim(), String(fd.get('clave')));
      await traerPerfilesDeLaNube();
      eligiendoPerfil = true;
      avisar('Sesión iniciada');
      render();
    } catch (err) {
      botones().forEach((b) => (b.disabled = false));
      avisar(traducirError(err));
    }
  };
  $('#btn-olvide-clave').onclick = async () => {
    const correo = String(form.correo.value).trim();
    if (!/^\S+@\S+\.\S+$/.test(correo)) { avisar('Escriba primero su correo arriba'); form.correo.focus(); return; }
    botones().forEach((b) => (b.disabled = true));
    try {
      await Nube.recuperar(correo);
      avisar('Listo. Revise su correo (también en "spam") y toque el enlace para crear la contraseña nueva.');
    } catch (err) {
      avisar(traducirError(err));
    }
    botones().forEach((b) => (b.disabled = false));
  };
}

function pantallaPerfiles(c) {
  c.innerHTML = `
    <h2>¿Qué perfil quiere ver?</h2>
    <div class="elegir-perfil">${perfiles.lista.map((p) =>
      `<button type="button" class="tarjeta" data-elegir="${esc(p.id)}"><span class="cifra-m">${esc(p.nombre)}</span></button>`).join('')}</div>
    <button type="button" class="principal" id="btn-perfil-nuevo">+ Nuevo perfil</button>`;
  $$('[data-elegir]', c).forEach((b) => (b.onclick = async () => {
    eligiendoPerfil = false;
    if (b.dataset.elegir === datos.perfil) { render(); await traerDeLaNube(true); }
    else await cambiarPerfil(b.dataset.elegir);
  }));
  $('#btn-perfil-nuevo').onclick = () => { eligiendoPerfil = false; nuevoPerfil(); };
}

/** Borra de este celular los datos de todos los perfiles (siguen en la nube). */
function borrarDatosLocales() {
  try {
    for (const p of perfiles.lista) { localStorage.removeItem(claveDatos(p.id)); Nube.olvidarPendiente(p.id); }
    localStorage.removeItem(CLAVE_PERFILES);
  } catch (e) { /* nada */ }
  perfiles = leerPerfiles();
  datos = cargar('mama');
  vista = 'hoy';
}

/** Cerrar sesión: sube lo pendiente, sale y borra los datos de este celular. */
async function cerrarSesion() {
  for (const p of perfiles.lista) {
    const d = p.id === datos.perfil ? datos : cargar(p.id);
    await Nube.subirSiPendiente(d);
  }
  const quedan = perfiles.lista.filter((p) => Nube.hayPendiente(p.id));
  if (quedan.length && !(await preguntar('Hay cambios que no se han podido subir a la nube (¿sin internet?). Si cierra sesión ahora, esos cambios se pierden. ¿Cerrar igual?', 'Cerrar igual'))) return;
  await Nube.salir();
  borrarDatosLocales();
  render();
}

function render() {
  $('#fecha-hoy').textContent = fechaLarga(hoy());
  const nav = $('#pestanas');
  nav.hidden = !datos.configurado;
  $$('button', nav).forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  const c = $('#contenido');
  pintarPerfiles();
  if (!nubeLista) { nav.hidden = true; return pantallaCargando(c); }
  if (!Nube.sesion) { nav.hidden = true; return pantallaLogin(c); }
  if (bloqueada) { nav.hidden = true; return pantallaBloqueo(c); }
  if (eligiendoPerfil) { nav.hidden = true; return pantallaPerfiles(c); }
  if (!datos.configurado) return pantallaInicio(c);
  ({ hoy: pantallaHoy, sobres: pantallaPagos, ahorro: pantallaAhorro, historial: pantallaHistorial, ajustes: pantallaAjustes }[vista] || pantallaHoy)(c);
}

function abrirModal(html, alEnviar, alAbrir) {
  const modal = $('#modal');
  const form = $('#modal-form');
  form.innerHTML = html;
  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === 'cancelar') return;
    e.preventDefault();
    if (alEnviar(new FormData(form), e.submitter) !== false) modal.close();
  };
  if (alAbrir) alAbrir(form);
  modal.showModal();
}
/** Confirmación con el estilo de la app (en vez de la ventana del navegador). */
function preguntar(mensaje, si = 'Sí') {
  const d = $('#confirmar');
  $('#confirmar-texto').textContent = mensaje;
  $('#confirmar-si').textContent = si;
  d.returnValue = '';
  d.showModal();
  return new Promise((resolver) => {
    d.onclose = () => resolver(d.returnValue === 'si');
  });
}
const botonesModal = (borrar = false, guardarTxt = 'Guardar') => `
  <div class="botones acciones">
    <button value="cancelar" formnovalidate>Cancelar</button>
    ${borrar ? '<button value="borrar" class="peligro" formnovalidate>Borrar</button>' : ''}
    <button value="guardar" class="principal">${guardarTxt}</button>
  </div>`;

/* ---------- configuración (inicio y ajustes) ---------- */
function botonesNumero(nombre, desde, hasta, actual) {
  const opciones = [];
  for (let n = desde; n <= hasta; n++) opciones.push(n);
  return `<div class="dias" style="grid-template-columns:repeat(${opciones.length},minmax(0,1fr))">${opciones.map((n) =>
    `<label><input type="radio" name="${nombre}" value="${n}" ${n === actual ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>`;
}

function preguntasTrabajo() {
  const f = datos.frecuencia || 'diario';
  return `
    <label>¿Cada cuánto le entra plata?</label>
    <div class="dias frecuencias">${Object.entries(FRECUENCIAS).map(([k, v]) =>
      `<label><input type="radio" name="frecuencia" value="${k}" ${k === f ? 'checked' : ''}><span>${v.nombre}</span></label>`).join('')}</div>
    <label>¿Cuánto quiere apartar ${(FRECUENCIAS[f] || FRECUENCIAS.diario).cada}?</label>
    ${campoPesos('cuotaDiaria', datos.cuotaDiaria)}
    <p class="suave">La app reparte esa plata entre los pagos, primero lo que vence antes, y le avisa si no alcanza. Deje en $0 para que la app calcule cuánto hace falta.</p>
    <div ${f === 'diario' ? '' : 'hidden'} data-solo-diario>
    <label>¿Cuántos días trabaja a la semana, más o menos?</label>
    ${botonesNumero('diasSemana', 1, 7, datos.diasSemana)}
    <p class="suave">Si a veces falla por un imprevisto, ponga un número más bajo. Mejor que sobre a que falte.</p>
    </div>
    <label>¿Cuántos días antes del pago quiere tener la plata lista?</label>
    ${botonesNumero('margen', 0, 4, datos.margen)}
    <p class="suave">Es un colchón: si justo antes del pago no se puede trabajar, la plata ya está.</p>`;
}
function leerTrabajo(fd) {
  if (fd.get('frecuencia')) datos.frecuencia = fd.get('frecuencia');
  const cfg = L.ajustes({ diasSemana: fd.get('diasSemana'), margen: fd.get('margen') });
  datos.diasSemana = cfg.diasSemana;
  datos.margen = cfg.margen;
  if (fd.has('cuotaDiaria')) datos.cuotaDiaria = num(fd.get('cuotaDiaria'));
}

const plantillaPerfil = () => (datos.perfil === 'mama' ? PLANTILLA : PLANTILLA_PERSONAL);

function filaPago(p, i) {
  const cuando = p.tipo === 'semanal'
    ? `<label>Día de la semana</label><select name="dia-${i}">${DIAS.map((d, n) => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${d}</option>`).join('')}</select>`
    : `<label>Día que vence</label><input name="dia-${i}" inputmode="numeric" placeholder="1 a 31" maxlength="2">`;
  return `
    <div class="tarjeta" data-fila="${i}">
      <input name="nombre-${i}" value="${esc(p.nombre)}" aria-label="Nombre" placeholder="Nombre del pago" style="font-weight:700">
      ${p.ayuda ? `<p class="suave">${esc(p.ayuda)}</p>` : ''}
      <div class="fila">
        <div><label>${p.tipo === 'semanal' ? 'Valor semanal' : p.deuda ? 'Cuota del mes' : 'Valor'}</label>${campoPesos('monto-' + i)}</div>
        <div>${cuando}</div>
      </div>
      ${p.deuda ? `<div class="fila">
          <div><label>Deuda total</label>${campoPesos('saldo-' + i)}</div>
          <div><label>¿En cuántas cuotas?</label><input name="cuotas-${i}" inputmode="numeric" maxlength="3" placeholder="Ej: 6"></div>
        </div>
        <p class="suave">Si no sabe la cuota del mes, ponga la deuda total y en cuántas cuotas: la app la calcula.</p>` : ''}
      ${p.tipo === 'mensual' ? `<label class="check"><input type="checkbox" name="pagado-${i}"> Ya pagué el de este mes</label>` : ''}
      <input type="hidden" name="tipo-${i}" value="${p.tipo}"><input type="hidden" name="prio-${i}" value="${p.prioridad}">
      <input type="hidden" name="nombreBase-${i}" value="${esc(p.nombre)}">
    </div>`;
}

function pantallaInicio(c) {
  c.innerHTML = `
    <div class="tarjeta destacada">
      <p class="cifra-m">Hola 👋</p>
      <p>Perfil <b>${esc(datos.perfilNombre || 'Mamá')}</b>. Esta app le dice, cada vez que le entra plata, <b>cuánto guardar</b> y para qué, para que el día de pagar la plata ya esté lista.</p>
      <p class="suave">Llene solo lo que aplique. Lo que deje sin valor no se agrega. Todo se puede cambiar después.</p>
    </div>
    ${Nube.disponible && !Nube.sesion ? `<div class="tarjeta"><p>¿Ya tiene cuenta (por ejemplo, en otro celular)?</p>
      <button type="button" id="btn-ya-tengo">Entrar con mi cuenta</button></div>` : ''}
    <form id="form-inicio">
      <h2>¿Cómo trabaja?</h2>
      ${preguntasTrabajo()}
      <h2>Lo que hay que pagar</h2>
      <div class="rejilla" id="filas">${plantillaPerfil().map(filaPago).join('')}</div>
      <button type="button" id="btn-otra-fila">+ Agregar otro pago</button>
      <button type="submit" class="principal">Empezar</button>
    </form>`;

  if ($('#btn-ya-tengo')) $('#btn-ya-tengo').onclick = dialogoCuenta;
  let filas = plantillaPerfil().length;
  $('#form-inicio').addEventListener('change', (e) => {
    if (e.target.name === 'frecuencia') $('[data-solo-diario]').hidden = e.target.value !== 'diario';
  });
  $('#btn-otra-fila').onclick = () => {
    $('#filas').insertAdjacentHTML('beforeend', filaPago({ nombre: '', tipo: 'mensual', prioridad: 2, deuda: true }, filas));
    $(`[name=nombre-${filas}]`).focus();
    filas++;
  };

  $('#form-inicio').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    leerTrabajo(fd);
    const nuevas = [];
    const errores = [];
    $$('[data-fila]').forEach((fila) => {
      const i = fila.dataset.fila;
      const tipo = fd.get('tipo-' + i);
      const nombre = String(fd.get('nombre-' + i)).trim() || fd.get('nombreBase-' + i) || 'Pago';
      const saldo = num(fd.get('saldo-' + i));
      const cuotas = num(fd.get('cuotas-' + i));
      let monto = num(fd.get('monto-' + i));
      if (!monto && saldo && cuotas) monto = L.redondearMil(saldo / cuotas);
      const diaTexto = tipo === 'mensual' ? String(fd.get('dia-' + i) || '').trim() : '';
      if (!monto) {
        // Algo llenó pero falta el valor: avisar en vez de saltarla sin decir nada.
        if (saldo || diaTexto || cuotas) errores.push(`A "${nombre}" le falta la cuota del mes (o la deuda total y en cuántas cuotas)`);
        return;
      }
      const dia = Number(fd.get('dia-' + i));
      if (tipo === 'mensual' && !(dia >= 1 && dia <= 31)) return errores.push(`A "${nombre}" le falta el día que vence (1 a 31)`);
      const campos = { nombre, tipo, dia, monto, prioridad: Number(fd.get('prio-' + i)), saldoTotal: saldo || null };
      if (tipo === 'mensual' && fd.get('pagado-' + i)) campos.proximo = L.proximaSiYaPagoEsteMes(hoy(), dia);
      nuevas.push(crearObligacion(campos));
    });
    if (errores.length) return avisar(errores[0]);
    if (!nuevas.length) return avisar('Ponga al menos un valor para empezar');
    datos.obligaciones = nuevas;
    datos.configurado = true;
    guardar();
    ir('hoy');
  });
}

/* ---------- HOY ---------- */
/** Cuánto hay que apartar al día en un mes normal (sin atrasos), según los pagos y los días de trabajo. */
function cuotaMesNormal() {
  const porMes = activas().reduce((s, o) => s + (o.tipo === 'semanal' ? (o.monto * 52) / 12 : o.tipo === 'mensual' ? o.monto : o.tipo === 'anual' ? o.monto / 12 : 0), 0);
  const vecesPorSemana = L.ajustes(datos).diasSemana;
  return L.redondearMil(porMes / ((vecesPorSemana * 365) / 12 / 7));
}

function avisoPlan(p) {
  const malos = p.items.filter((x) => x.faltante > 0);
  const cuota = pesos(p.objetivo);
  if (!p.items.length) return '';
  const normal = cuotaMesNormal();
  const normalTotal = L.redondearMil(normal / (p.fraccion || 1));
  const conAhorro = datos.ahorroPct ? ` (contando el ${datos.ahorroPct}% para ahorro)` : '';
  const lineaNormal = normal ? `<p class="suave" style="margin-top:8px">Un mes normal, sin atrasos, necesita unos <b>${pesos(normalTotal)}</b> ${frec().por}${conAhorro}${datos.frecuencia === 'diario' || !datos.frecuencia ? `, trabajando ${datos.diasSemana} días a la semana` : ''}.</p>` : '';
  if (!malos.length) {
    return `<div class="alerta verde">✔ Con ${cuota} ${frec().por} alcanza para todo lo del próximo mes.${lineaNormal}</div>`;
  }
  return `
    <div class="alerta ambar">
      Con ${cuota} ${frec().por} no alcanza para:
      <ul class="lista" style="margin:6px 0">${malos.slice(0, 4).map((x) =>
        `<li><span>${esc(x.nombre)} <span class="suave">(${fechaCorta(x.fecha)})</span></span><span class="monto">faltan ${pesos(x.faltante)}</span></li>`).join('')}</ul>
      Para cubrir todo a tiempo habría que apartar <b>${pesos(p.necesariaTotal || p.necesaria)}</b> ${frec().por}${conAhorro}, conseguir más ingresos, o abonar de otro lado.
      ${lineaNormal}
    </div>`;
}

function camposDia(r = {}) {
  const fuentes = [...new Set([...datos.fuentes, ...Object.keys(r.ingresos || {})])];
  return `
    ${fuentes.map((f) => `<label>Le entró por ${esc(f)} <span class="suave">(ya sin comisión)</span></label>${campoPesos('ing:' + f, r.ingresos?.[f])}`).join('')}
    <div class="fila">
      <div><label>Gasolina</label>${campoPesos('gasolina', r.gasolina)}</div>
      <div><label>Otros gastos</label>${campoPesos('otros', r.otros)}</div>
    </div>
    <label>Nota <span class="suave">(opcional)</span></label>
    <input name="nota" value="${esc(r.nota)}" placeholder="Ej: lavada del carro, peaje…" maxlength="120">`;
}
function leerDia(form) {
  const fd = new FormData(form);
  const ingresos = {};
  for (const [k, v] of fd.entries()) if (k.startsWith('ing:') && num(v)) ingresos[k.slice(4)] = num(v);
  const gasolina = num(fd.get('gasolina'));
  const otros = num(fd.get('otros'));
  const ingreso = sumar(ingresos);
  return { ingresos, ingreso, gasolina, otros, carro: gasolina + otros, nota: String(fd.get('nota') || '').trim(), neto: ingreso - gasolina - otros };
}

function pantallaHoy(c) {
  const f = hoy();
  const p = proyeccion();
  const registrosHoy = datos.registros.filter((r) => r.fecha === f);
  const proximos = [...activas()].sort((a, b) => (a.proximo < b.proximo ? -1 : 1)).slice(0, 4);

  c.innerHTML = `
    <div class="columnas"><div>
    <div class="tarjeta destacada">
      <p class="suave">${datos.frecuencia && datos.frecuencia !== 'diario' ? (p.ya ? `Todavía le falta apartar de este ${frec().pago}` : 'Cuando le paguen, aparte') : (p.ya ? 'Todavía le falta apartar hoy' : 'Hoy toca apartar')}</p>
      <p class="cifra">${pesos(p.pendienteHoy)}</p>
      <p class="suave">${p.pendienteHoy ? (p.automatica ? 'para que alcance para todos los pagos.' : `de la cuota de ${pesos(p.objetivo)} ${frec().por}.`) : (datos.frecuencia && datos.frecuencia !== 'diario' ? `¡Listo! Ya apartó lo de este ${frec().pago}. 💪` : '¡Listo por hoy! 💪')}</p>
    </div>
    ${avisoPlan(p)}

    <form id="form-dia" class="tarjeta">
      <h2 style="margin-top:0">¿Cuánto hay para repartir hoy?</h2>
      ${campoPesos('apartar', p.pendienteHoy)}
      <p class="suave">Lo que le dieron hoy para apartar. Si fue más o menos de ${pesos(p.objetivo)}, cámbielo.</p>
      <div id="calculo"></div>
      <details class="detalle-dia"><summary>Agregar detalle del día <span class="suave">(opcional)</span></summary>${camposDia()}</details>
      <button type="button" class="principal" id="btn-registrar">Listo, ya lo aparté ✔</button>
      <p class="suave" style="margin-top:12px">¿Hoy no hubo plata? No registre nada: lo que falta se reparte solo en los próximos días.</p>
    </form>

    ${registrosHoy.length ? `
      <h2>Lo que ya registró hoy</h2>
      <div class="tarjeta"><ul class="lista">${registrosHoy.map((r) => `
        <li><span>Apartó <b>${pesos(r.apartado)}</b>${r.ingreso ? ` <span class="suave">(entró ${pesos(r.ingreso)})</span>` : ''}</span>
        <button class="chico" data-editar-registro="${r.id}">Editar</button></li>`).join('')}</ul></div>` : ''}
    </div><div>
    <h2 class="primero">Lo que viene</h2>
    ${proximos.map((o) => tarjetaCorta(o, f, p.faltantes)).join('') || '<p class="suave">No hay pagos. Agréguelos en "Pagos".</p>'}
    ${activas().length > proximos.length ? `<button type="button" class="principal" id="btn-ver-todos">Ver todas las cuentas (${activas().length})</button>` : ''}
    </div></div>
  `;

  const form = $('#form-dia');
  const calculo = $('#calculo');

  function actualizar() {
    const apartar = num(form.apartar.value);
    const d = leerDia(form);
    const r = L.repartirTodo(activas(), metasActivas(), apartar, f, datos);
    calculo.innerHTML = explicarReparto(r, apartar) + (d.ingreso
      ? `<div class="alerta verde">Entró ${pesos(d.ingreso)}${d.carro ? `, gastos ${pesos(d.carro)}` : ''}: para la casa quedan ${pesos(Math.max(0, d.neto - apartar))}</div>`
      : '');
    $('#btn-registrar').disabled = apartar <= 0;
    $('#btn-registrar').onclick = () => {
      const { neto: _n, ...dia } = d;
      const reg = { id: nuevoId(), fecha: hoy(), ...dia, apartado: apartar, reparto: r.reparto, ahorro: r.ahorro, extra: r.extra };
      aplicarReparto(reg);
      datos.registros.push(reg);
      guardar();
      avisar(`Listo: ${pesos(apartar)} repartidos`);
      render();
    };
  }

  if ($('#btn-ver-todos')) $('#btn-ver-todos').onclick = () => ir('sobres');
  form.addEventListener('input', actualizar);
  form.addEventListener('submit', (e) => e.preventDefault());
  actualizar();
  activarBotones(c);
}

/** Lista de cómo se reparte la plata y por qué a cada cuenta le toca eso. */
function explicarReparto(r, apartar) {
  if (!apartar) return '';
  const filas = Object.entries(r.detalle)
    .map(([id, d]) => ({ o: buscar(id), d, m: r.reparto[id] || 0 }))
    .filter((x) => x.o)
    .sort((a, b) => b.m - a.m || (a.d.fecha < b.d.fecha ? -1 : 1));
  const conPlata = filas.filter((x) => x.m > 0);
  const sinPlata = filas.filter((x) => x.m === 0);
  const noAlcanzo = filas.some((x) => x.m < x.d.necesidad);
  return `
    <p class="suave" style="margin-top:14px">Así se reparten los ${pesos(apartar)}${r.primeroAhorro ? `: primero ${pesos(r.primeroAhorro)} a ahorro (${datos.ahorroPct}%), y el resto` : ''} a cada cuenta según lo que le falta y los días que quedan para pagarla${noAlcanzo ? '. Como no alcanza para todo, las de prioridad alta van primero y el resto se reparte parejo' : ''}.</p>
    <ul class="lista reparto">
      ${conPlata.map(({ o, d, m }) => `
        <li><span><b>${esc(o.nombre)}</b><br>
          <span class="suave">Faltan ${pesos(d.falta)} · vence ${fechaCorta(d.fecha)} · ${d.dias <= 1 ? (datos.frecuencia && datos.frecuencia !== 'diario' ? `vence antes del próximo ${frec().pago} → toca completo` : 'ya se debe juntar → toca completo') : `${d.dias} ${frec().pagos} → necesita ${pesos(d.necesidad)} ${frec().por}`}</span></span>
          <span class="monto">${pesos(m)}</span></li>`).join('')}
      ${Object.entries(r.ahorro || {}).map(([id, m]) => `
        <li><span><b>💰 ${esc(buscarMeta(id)?.nombre || 'Ahorro')}</b><br><span class="suave">Ahorro${r.sobroDeCuentas ? ' (incluye lo que sobró: las cuentas ya tienen lo suyo de hoy)' : ''}</span></span><span class="monto">${pesos(m)}</span></li>`).join('')}
      ${r.extra ? `<li><span><b>💰 Ahorro sin meta</b><br><span class="suave">${r.sobroDeCuentas ? 'Las cuentas ya tienen lo suyo de hoy. ' : ''}Cree metas en "Ahorro" para repartirlo</span></span><span class="monto">${pesos(r.extra)}</span></li>` : ''}
    </ul>
    ${sinPlata.length ? `<p class="suave">Hoy no reciben: ${sinPlata.map(({ o }) => esc(o.nombre)).join(', ')} (${sinPlata.every(({ o }) => (o.prioridad || 2) > 1) ? 'prioridad más baja: reciben cuando las importantes estén al día' : 'reciben en los próximos días'}).</p>` : ''}
    ${(() => {
      const movs = movimientosCajitas(r);
      return movs.length ? `<div class="alerta verde">👉 Hoy mueva en ${esc(banco())}:
        <ul class="lista" style="margin:6px 0 0">${movs.map(([k, m]) => `<li><span>a la cajita <b>${esc(k)}</b></span><span class="monto">${pesos(m)}</span></li>`).join('')}</ul></div>` : '';
    })()}`;
}

/** Editar o borrar un día ya registrado (de hoy o de cualquier fecha). */
function editarRegistro(id) {
  const r = datos.registros.find((x) => x.id === id);
  if (!r) return;
  abrirModal(`
    <h2>Editar día</h2>
    <label>Fecha</label><input type="date" name="fecha" value="${r.fecha}" max="${hoy()}" required>
    ${camposDia(r)}
    <label>Apartó</label>${campoPesos('apartar', r.apartado)}
    <p class="suave">Si cambia lo apartado, se vuelve a repartir entre los pagos.</p>
    ${botonesModal(true)}
  `, (fd, boton) => {
    if (boton && boton.value === 'borrar') {
      preguntar('¿Borrar este día? Lo apartado se descuenta de los pagos.', 'Borrar').then((si) => {
        if (!si) return;
        revertirReparto(r);
        datos.registros = datos.registros.filter((x) => x.id !== id);
        marcarBorrado('registros', id);
        $('#modal').close();
        guardar(); avisar('Día borrado'); render();
      });
      return false;
    }
    const d = leerDia($('#modal-form'));
    const apartar = num(fd.get('apartar'));
    revertirReparto(r);
    if (apartar !== r.apartado) {
      const nuevo = L.repartirTodo(activas(), metasActivas(), apartar, fd.get('fecha') || r.fecha, datos);
      r.reparto = nuevo.reparto;
      r.ahorro = nuevo.ahorro;
      r.extra = nuevo.extra;
    }
    const { neto: _n, ...dia } = d;
    Object.assign(r, dia, { fecha: fd.get('fecha') || r.fecha, apartado: apartar });
    aplicarReparto(r);
    datos.registros.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    guardar(); avisar('Guardado'); render();
  });
}

/* ---------- PAGOS (compromisos) ---------- */
function lineaPlan(o, faltantes) {
  if (o.apartado >= o.monto) return '';
  const f = faltantes[o.id];
  if (f == null) return '';
  return f > 0
    ? `<p class="alerta ambar" style="margin:8px 0 0;padding:8px 12px">Con la cuota faltarían ${pesos(f)}</p>`
    : '<p class="suave">✔ Con la cuota llega completo</p>';
}

function tarjetaCorta(o, f, faltantes) {
  const est = estadoDe(o, f, faltantes);
  const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
  return `
    <div class="tarjeta">
      <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
      <p class="suave">${fechaCorta(o.proximo)} · ${cuandoVence(o.proximo)}</p>
      <div class="barra-progreso"><div style="width:${pct}%"></div></div>
      <p><b>${pesos(o.apartado)}</b> de ${o.variable ? '≈ ' : ''}${pesos(o.monto)}</p>
      ${lineaPlan(o, faltantes)}
      ${est === 'vence-hoy' || est === 'vencida' || est === 'cubierta'
        ? `<div class="botones"><button class="chico" data-pagar="${o.id}">Ya pagué</button></div>` : ''}
    </div>`;
}


/* ---------- PAGO DE LA TARJETA (suma de todos los perfiles) ---------- */
/** Junta las cuentas marcadas "se paga con la tarjeta" de todos los perfiles guardados en este celular. */
function pagosTarjeta() {
  const grupos = {};
  let faltanPerfiles = [];
  for (const p of perfiles.lista) {
    const d = p.id === datos.perfil ? datos : (() => { try { return localStorage.getItem(claveDatos(p.id)) ? cargar(p.id) : null; } catch (e) { return null; } })();
    if (!d) { faltanPerfiles.push(p.nombre); continue; }
    for (const o of d.obligaciones) {
      if (o.activa === false || !o.conTarjeta || !o.proximo) continue;
      const g = (grupos[o.proximo] = grupos[o.proximo] || { total: 0, apartado: 0, porPerfil: {} });
      g.total += o.monto || 0;
      g.apartado += Math.min(o.apartado || 0, o.monto || 0);
      g.porPerfil[p.nombre] = (g.porPerfil[p.nombre] || 0) + (o.monto || 0);
    }
  }
  return { grupos: Object.entries(grupos).sort((a, b) => (a[0] < b[0] ? -1 : 1)), faltanPerfiles };
}

function tarjetaPagoTarjeta() {
  const { grupos, faltanPerfiles } = pagosTarjeta();
  if (!grupos.length) return '';
  const [fecha, g] = grupos[0];
  return `
    <div class="tarjeta">
      <h3 style="margin:0 0 4px">💳 Pago de la tarjeta · ${fechaCorta(fecha)}</h3>
      <p class="cifra-m">${pesos(g.total)}</p>
      <ul class="lista">${Object.entries(g.porPerfil).map(([n, m]) => `<li><span>${esc(n)}</span><span class="monto">${pesos(m)}</span></li>`).join('')}
        <li><span>Ya apartado</span><span class="monto">${pesos(g.apartado)}</span></li></ul>
      <p class="suave">Compárelo con el <b>pago total</b> que muestra ${esc(banco())} después del corte. Si es distinto, ajuste los valores en "Editar".
        ${faltanPerfiles.length ? ` Falta sumar: ${faltanPerfiles.map(esc).join(', ')} (abra ese perfil una vez en este celular).` : ''}</p>
      <details class="detalle-dia"><summary>Consejos para pagar menos intereses</summary>
        <ul class="lista">
          <li><span>Pague <b>más que el mínimo</b>, idealmente el total, antes de la fecha límite.</span></li>
          <li><span>Las compras a <b>1 cuota</b> pagadas completas a tiempo no cobran intereses. En la app de ${esc(banco())} se pueden cambiar las cuotas de una compra.</span></li>
          <li><span>Al enviar plata por Bre-B, elija como fuente la <b>cuenta</b>, no la tarjeta de crédito: con la tarjeta cuenta como <b>avance</b> (intereses desde el primer día y comisión).</span></li>
          <li><span>Si sobra plata, que el abono vaya primero a los <b>avances</b>. Pregunte en el chat de ${esc(banco())} cómo aplicarlo a capital.</span></li>
        </ul>
      </details>
    </div>`;
}

function pantallaPagos(c) {
  const f = hoy();
  const p = proyeccion();
  const lista = [...activas()].sort((a, b) => (a.proximo < b.proximo ? -1 : 1));
  const terminadas = datos.obligaciones.filter((o) => o.activa === false);
  const totalApartado = activas().reduce((s, o) => s + o.apartado, 0) + datos.extra;

  c.innerHTML = `
    <div class="tarjeta">
      <p class="suave">Plata apartada para cuentas y ahorro (debería estar en las cajitas de ${esc(banco())})</p>
      <p class="cifra-m">${pesos(totalApartado)}</p>
      ${datos.extra ? `<p class="suave">De eso, ahorro extra (sin pago asignado): <b>${pesos(datos.extra)}</b>
        <button class="chico" id="btn-extra" style="margin-left:6px">Usar / ajustar</button></p>` : ''}
    </div>
    ${tarjetaPagoTarjeta()}
    ${tarjetaCuadre()}
    ${avisoPlan(p)}
    <button class="principal" id="btn-nuevo">+ Agregar un pago</button>
    <div class="rejilla">${lista.map((o) => {
      const est = estadoDe(o, f, p.faltantes);
      const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
      const cada = o.tipo === 'mensual' ? `cada mes el ${o.dia}` : o.tipo === 'semanal' ? `cada ${DIAS[o.dia]}`
        : o.tipo === 'anual' ? `cada año (${L.aFecha(o.proximo).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })})` : 'una sola vez';
      return `
      <div class="tarjeta">
        <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
        <p class="suave">${o.variable ? '≈ ' : ''}${pesos(o.monto)} · ${cada}</p>
        ${o.variable ? '<p class="suave">💡 El valor puede cambiar: cuando llegue el recibo o el cobro, actualícelo en "Editar".</p>' : ''}
        <p>Próximo pago: <b>${fechaCorta(o.proximo)}</b> (${cuandoVence(o.proximo)})</p>
        <div class="barra-progreso"><div style="width:${pct}%"></div></div>
        <p><b>${pesos(o.apartado)}</b> apartados de ${pesos(o.monto)}</p>
        ${o.saldoTotal != null ? `<p class="suave">Deuda total que queda: <b>${pesos(o.saldoTotal)}</b></p>` : ''}
        ${o.nota ? `<p class="suave">📝 ${esc(o.nota)}</p>` : ''}
        ${lineaPlan(o, p.faltantes)}
        <div class="botones">
          <button class="chico" data-pagar="${o.id}">Ya pagué</button>
          <button class="chico" data-editar="${o.id}">Editar</button>
        </div>
      </div>`;
    }).join('')}</div>
    ${terminadas.length ? `
      <h2>Terminadas 🎉</h2>
      ${terminadas.map((o) => `
        <div class="tarjeta"><div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip terminada">Terminada</span></div>
        <div class="botones"><button class="chico" data-editar="${o.id}">Editar / reactivar</button></div></div>`).join('')}` : ''}
  `;
  $('#btn-nuevo').onclick = () => editar(null);
  if ($('#btn-extra')) $('#btn-extra').onclick = dialogoExtra;
  activarBotones(c);
}

function activarBotones(c) {
  $$('[data-pagar]', c).forEach((b) => (b.onclick = () => dialogoPagar(b.dataset.pagar)));
  $$('[data-editar]', c).forEach((b) => (b.onclick = () => editar(b.dataset.editar)));
  $$('[data-editar-registro]', c).forEach((b) => (b.onclick = () => editarRegistro(b.dataset.editarRegistro)));
  $$('[data-deshacer-pago]', c).forEach((b) => (b.onclick = () => deshacerPago(b.dataset.deshacerPago)));
}

function dialogoExtra() {
  abrirModal(`
    <h2>Ahorro sin meta</h2>
    <p class="suave">Plata apartada que no tiene destino. Puede pasarla a una meta o a una cuenta, o cambiar el valor si la usó.</p>
    <label>Ahorro sin meta</label>${campoPesos('extra', datos.extra)}
    <label>Pasar a <span class="suave">(opcional)</span></label>
    <select name="destino"><option value="">— No pasar —</option>
      ${metasActivas().length ? `<optgroup label="Metas de ahorro">${metasActivas().map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Cuentas">${activas().map((o) => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('')}</optgroup>
    </select>
    <label>¿Cuánto pasar?</label>${campoPesos('pasar')}
    ${botonesModal()}
  `, (fd) => {
    let extra = num(fd.get('extra'));
    const destino = buscar(fd.get('destino'));
    const meta = buscarMeta(fd.get('destino'));
    const pasar = Math.min(num(fd.get('pasar')), extra);
    if (destino && pasar) { destino.apartado += pasar; extra -= pasar; }
    if (meta && pasar) { meta.ahorrado = (meta.ahorrado || 0) + pasar; extra -= pasar; }
    datos.extra = extra;
    guardar(); render();
  });
}

function dialogoPagar(id) {
  const o = buscar(id);
  abrirModal(`
    <h2>Pagar: ${esc(o.nombre)}</h2>
    <p class="suave">Tiene apartados ${pesos(o.apartado)}.</p>
    <label>¿Cuánto pagó?</label>
    ${campoPesos('pagado', o.monto)}
    ${o.variable ? '<p class="suave">Ponga lo que llegó en el recibo. Ese valor queda como estimado para el próximo mes.</p>' : ''}
    <label>Fecha del pago</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}">
    <p class="suave">Si es el fondo del carro y no lo usó, ponga $0: la plata sigue guardada y pasa al otro mes.</p>
    ${botonesModal(false, 'Pagado')}
  `, (fd) => {
    const pagado = num(fd.get('pagado'));
    const antes = { ...o };
    Object.assign(o, L.pagar(o, pagado));
    if (o.variable && pagado > 0 && o.saldoTotal == null && o.activa !== false) o.monto = pagado; // estimado para el próximo
    datos.pagos.push({ id: nuevoId(), fecha: fd.get('fecha') || hoy(), obligacionId: o.id, nombre: o.nombre, monto: pagado, antes });
    guardar();
    avisar(pagado > antes.apartado ? `Pagado. ${pesos(pagado - antes.apartado)} salieron de otro lado.` : 'Pagado ✔');
    render();
  });
}

/** Solo se puede deshacer el último pago de cada compromiso (vuelve todo como estaba). */
const puedeDeshacer = (pg) => (pg.tipo === 'retiro' ? buscarMeta(pg.obligacionId) : pg.antes && buscar(pg.obligacionId)) &&
  datos.pagos.filter((x) => x.obligacionId === pg.obligacionId).pop() === pg;

async function deshacerPago(id) {
  const pg = datos.pagos.find((x) => x.id === id);
  if (!pg || !puedeDeshacer(pg)) return;
  const esRetiro = pg.tipo === 'retiro';
  if (!(await preguntar(esRetiro ? `¿Deshacer lo que sacó de ${pg.nombre} (${pesos(pg.monto)})? La plata vuelve a la meta.` : `¿Deshacer el pago de ${pg.nombre} por ${pesos(pg.monto)}? Vuelve a quedar como antes de pagar.`, 'Deshacer'))) return;
  if (esRetiro) { const m = buscarMeta(pg.obligacionId); m.ahorrado = (m.ahorrado || 0) + pg.monto; }
  else Object.assign(buscar(pg.obligacionId), pg.antes);
  datos.pagos = datos.pagos.filter((x) => x.id !== id);
  marcarBorrado('pagos', id);
  guardar(); avisar('Pago deshecho'); render();
}

function editar(id) {
  const o = id ? buscar(id) : { nombre: '', tipo: 'mensual', dia: '', monto: '', prioridad: 2, saldoTotal: null, apartado: 0, nota: '' };
  abrirModal(`
    <h2>${id ? 'Editar pago' : 'Nuevo pago'}</h2>
    <label>Nombre</label><input name="nombre" value="${esc(o.nombre)}" required placeholder="Ej: Recibo de luz">
    <label>¿Cada cuánto?</label>
    <select name="tipo">
      <option value="mensual" ${o.tipo === 'mensual' ? 'selected' : ''}>Cada mes</option>
      <option value="semanal" ${o.tipo === 'semanal' ? 'selected' : ''}>Cada semana</option>
      <option value="anual" ${o.tipo === 'anual' ? 'selected' : ''}>Cada año</option>
      <option value="unica" ${o.tipo === 'unica' ? 'selected' : ''}>Una sola vez</option>
    </select>
    <div id="cuando"></div>
    ${id && o.tipo !== 'unica' && o.tipo !== 'anual' ? `<label>Próxima fecha de pago</label><input type="date" name="proximo" value="${o.proximo || ''}">
      <p class="suave">Cámbiela si este mes el recibo llega otro día.</p>` : ''}
    ${o.tipo !== 'semanal' && o.tipo !== 'unica' && o.tipo !== 'anual' ? `<label class="check"><input type="checkbox" name="yaPagado"> Ya está pagado el de este mes (el próximo es el del otro mes)</label>` : ''}
    <label>¿Cuánto es?</label>${campoPesos('monto', o.monto)}
    <div class="fila">
      <div><label>Deuda total <span class="suave">(opcional)</span></label>${campoPesos('saldo', o.saldoTotal)}</div>
      <div><label>¿En cuántas cuotas?</label><input name="cuotas" inputmode="numeric" maxlength="3" placeholder="Opcional"></div>
    </div>
    <p class="suave">La deuda total baja con cada pago. Si deja "¿Cuánto es?" vacío, la cuota se calcula con la deuda y las cuotas.</p>
    <label>¿Qué tan grave es no pagarlo a tiempo?</label>
    <select name="prioridad">
      <option value="1" ${o.prioridad === 1 ? 'selected' : ''}>Muy grave (cortan el servicio, intereses)</option>
      <option value="2" ${o.prioridad === 2 ? 'selected' : ''}>Normal</option>
      <option value="3" ${o.prioridad === 3 ? 'selected' : ''}>Puede esperar</option>
    </select>
    ${id ? `<label>Plata ya apartada para esto</label>${campoPesos('apartado', o.apartado)}` : ''}
    <label class="check"><input type="checkbox" name="variable" ${o.variable ? 'checked' : ''}> El valor cambia cada mes (recibo por consumo, cobro en dólares)</label>
    <label class="check"><input type="checkbox" name="conTarjeta" ${o.conTarjeta ? 'checked' : ''}> Se paga con la tarjeta de crédito</label>
    ${campoCajita(o.bolsillo, cajitaCuentas())}
    <label>Nota <span class="suave">(opcional)</span></label>
    <input name="nota" value="${esc(o.nota)}" placeholder="Ej: número de contrato, a quién se le paga…" maxlength="160">
    ${botonesModal(!!id)}
  `, (fd, boton) => {
    if (boton && boton.value === 'borrar') {
      preguntar(`¿Borrar "${o.nombre}"? Lo apartado para este pago pasa a ahorro extra.`, 'Borrar').then((si) => {
        if (!si) return;
        datos.extra += o.apartado || 0;
        datos.obligaciones = datos.obligaciones.filter((x) => x.id !== id);
        marcarBorrado('obligaciones', id);
        $('#modal').close();
        guardar(); render();
      });
      return false;
    }
    const tipo = fd.get('tipo');
    const campos = {
      nombre: String(fd.get('nombre')).trim(),
      tipo,
      monto: num(fd.get('monto')),
      prioridad: Number(fd.get('prioridad')),
      saldoTotal: num(fd.get('saldo')) || null,
      variable: !!fd.get('variable'),
      conTarjeta: !!fd.get('conTarjeta'),
      nota: String(fd.get('nota') || '').trim(),
      bolsillo: String(fd.get('bolsillo') || '').trim(),
    };
    if (tipo === 'unica' || tipo === 'anual') campos.fecha = fd.get('fecha');
    else campos.dia = Number(fd.get('dia'));
    if (!campos.monto && campos.saldoTotal && num(fd.get('cuotas'))) campos.monto = L.redondearMil(campos.saldoTotal / num(fd.get('cuotas')));
    if (!campos.monto) { avisar('Falta cuánto es (o la deuda total y en cuántas cuotas)'); return false; }
    if (tipo === 'mensual' && !(campos.dia >= 1 && campos.dia <= 31)) { avisar('El día del mes va de 1 a 31'); return false; }
    if ((tipo === 'unica' || tipo === 'anual') && !campos.fecha) { avisar('Falta la fecha'); return false; }

    if (!id) {
      if (tipo === 'mensual' && fd.get('yaPagado')) campos.proximo = L.proximaSiYaPagoEsteMes(hoy(), campos.dia);
      datos.obligaciones.push(crearObligacion(campos));
    } else {
      const cambioFecha = tipo !== o.tipo || campos.dia !== o.dia || campos.fecha !== o.fecha;
      const estabaTerminada = o.activa === false;
      const proximoManual = fd.get('proximo');
      const cambioManual = proximoManual && proximoManual !== o.proximo; // la persona escribió otra fecha
      Object.assign(o, campos, { apartado: num(fd.get('apartado')), activa: true });
      // Prioridad: 1) fecha escrita a mano  2) "ya pagué el de este mes"  3) recalcular si cambió el día
      if (cambioManual) { o.proximo = proximoManual; o.inicio = hoy(); }
      else if (tipo === 'mensual' && fd.get('yaPagado')) { o.proximo = L.proximaSiYaPagoEsteMes(hoy(), campos.dia); o.inicio = hoy(); }
      else if (cambioFecha || estabaTerminada) { o.proximo = L.primeraFecha(o, hoy()); o.inicio = hoy(); }
      if (tipo === 'anual' && campos.fecha) { o.proximo = L.proximaAnual(hoy(), campos.fecha); }
    }
    guardar(); render();
    const guardada = id ? o : datos.obligaciones[datos.obligaciones.length - 1];
    avisar(`Guardado ✔ Próximo pago: ${fechaCorta(guardada.proximo)}`);
  }, (form) => {
    const pintarCuando = () => {
      const t = form.tipo.value;
      $('#cuando', form).innerHTML = t === 'mensual'
        ? `<label>¿Qué día del mes?</label><input name="dia" inputmode="numeric" maxlength="2" value="${o.tipo === 'mensual' ? o.dia : ''}" placeholder="Ej: 15">`
        : t === 'semanal'
          ? `<label>¿Qué día de la semana?</label><select name="dia">${DIAS.map((d, n) => `<option value="${n}" ${o.tipo === 'semanal' && o.dia === n ? 'selected' : ''}>${d}</option>`).join('')}</select>`
          : t === 'anual'
            ? `<label>¿Qué fecha se paga cada año?</label><input type="date" name="fecha" value="${o.tipo === 'anual' ? (o.proximo || o.fecha || '') : ''}">
               <p class="suave">Ponga la próxima vez que toca pagarlo. Después de pagar, pasa sola al año siguiente.</p>`
            : `<label>¿Qué fecha?</label><input type="date" name="fecha" value="${o.fecha || ''}">`;
    };
    form.tipo.onchange = pintarCuando;
    pintarCuando();
  });
}

/* ---------- CAJITAS (bolsillos en el banco, p. ej. Nu) ---------- */
// Mamá usa los nombres de siempre; los otros perfiles, nombres propios para no mezclar la plata en el banco.
const esMama = () => (datos.perfil || 'mama') === 'mama';
const cajitaCuentas = () => (esMama() ? 'Cuentas por pagar' : 'Mis cuentas');
const cajitaMeta = (nombre) => (esMama() ? nombre : `${nombre} (${datos.perfilNombre || 'mío'})`);
const banco = () => datos.banco || 'Nu';
const cajitaDe = (x, esMeta) => (x && x.bolsillo) || (esMeta ? cajitaMeta(x.nombre) : cajitaCuentas());

/** Cuánto mover hoy a cada cajita, juntando lo que va a cuentas y a metas. */
function movimientosCajitas(r) {
  const t = {};
  for (const [id, m] of Object.entries(r.reparto || {})) { const k = cajitaDe(buscar(id), false); t[k] = (t[k] || 0) + m; }
  for (const [id, m] of Object.entries(r.ahorro || {})) { const k = cajitaDe(buscarMeta(id), true); t[k] = (t[k] || 0) + m; }
  if (r.extra) t['Ahorro sin meta'] = (t['Ahorro sin meta'] || 0) + r.extra;
  return Object.entries(t).filter(([, m]) => m > 0);
}

/** Cuánto debería haber en cada cajita del banco según lo apartado en la app. */
function saldosCajitas() {
  const t = {};
  for (const o of activas()) if (o.apartado) { const k = cajitaDe(o, false); t[k] = (t[k] || 0) + o.apartado; }
  for (const m of metasActivas()) if (m.ahorrado) { const k = cajitaDe(m, true); t[k] = (t[k] || 0) + m.ahorrado; }
  if (datos.extra) t['Ahorro sin meta'] = (t['Ahorro sin meta'] || 0) + datos.extra;
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
}

function tarjetaCuadre() {
  const filas = saldosCajitas();
  if (!filas.length) return '';
  const total = filas.reduce((s, [, m]) => s + m, 0);
  return `
    <div class="tarjeta">
      <h3 style="margin:0 0 4px">Cuadre con ${esc(banco())}</h3>
      <p class="suave">Lo que debería haber en cada cajita. Si no coincide, ajuste en la app o mueva la plata en ${esc(banco())}.</p>
      <ul class="lista">${filas.map(([k, m]) => `<li><span>${esc(k)}</span><span class="monto">${pesos(m)}</span></li>`).join('')}
        <li><span><b>Total</b></span><span class="monto">${pesos(total)}</span></li></ul>
    </div>`;
}

/** Campo para escoger la cajita (con las que ya existen como sugerencia). */
function campoCajita(valor, porDefecto) {
  const usadas = [...new Set([cajitaCuentas(), ...datos.obligaciones.map((o) => o.bolsillo), ...(datos.metas || []).map((m) => m.bolsillo || cajitaMeta(m.nombre))].filter(Boolean))];
  return `<label>¿En qué cajita de ${esc(banco())} la guarda?</label>
    <input name="bolsillo" list="lista-cajitas" value="${esc(valor || '')}" placeholder="${esc(porDefecto)}" maxlength="40">
    <datalist id="lista-cajitas">${usadas.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
    <p class="suave">Si lo deja vacío: "${esc(porDefecto)}".</p>`;
}

/* ---------- AHORRO (metas) ---------- */
const metasActivas = () => (datos.metas || []).filter((m) => m.activa !== false);
const buscarMeta = (id) => (datos.metas || []).find((m) => m.id === id);
const pesoTotal = () => metasActivas().reduce((s, m) => s + (m.porcentaje || 0), 0);

/** Promedio diario que ha recibido una meta en los últimos 30 días. */
function ritmoMeta(m) {
  const desde = L.sumarDias(hoy(), -29);
  const total = datos.registros.filter((r) => r.fecha >= desde).reduce((s, r) => s + ((r.ahorro || {})[m.id] || 0), 0);
  return total / 30;
}

function tarjetaMeta(m) {
  const pct = m.objetivo > 0 ? Math.min(100, Math.round(((m.ahorrado || 0) / m.objetivo) * 100)) : null;
  const parte = pesoTotal() ? Math.round(((m.porcentaje || 0) / pesoTotal()) * 100) : 0;
  const ritmo = ritmoMeta(m);
  let cuando = '';
  if (m.objetivo > 0 && (m.ahorrado || 0) >= m.objetivo) cuando = '🎉 ¡Meta cumplida!';
  else if (m.objetivo > 0 && ritmo > 0) {
    const dias = Math.ceil((m.objetivo - (m.ahorrado || 0)) / ritmo);
    cuando = `A este ritmo llega en ${dias < 60 ? `${dias} días` : `${Math.round(dias / 30)} meses`}`;
  } else if (ritmo > 0) cuando = `Viene recibiendo unos ${pesos(ritmo * 30)} al mes`;
  return `
    <div class="tarjeta">
      <div class="cabeza"><h3>${esc(m.nombre)}</h3><span class="chip al-dia">${parte}% del ahorro</span></div>
      <p class="cifra-m">${pesos(m.ahorrado)}</p>
      ${pct != null ? `<div class="barra-progreso"><div style="width:${pct}%"></div></div><p class="suave">${pct}% de ${pesos(m.objetivo)}</p>` : '<p class="suave">Sin meta de monto</p>'}
      ${cuando ? `<p class="suave">${cuando}</p>` : ''}
      ${m.nota ? `<p class="suave">📝 ${esc(m.nota)}</p>` : ''}
      <div class="botones">
        <button class="chico" data-sacar="${m.id}">Sacar plata</button>
        <button class="chico" data-editar-meta="${m.id}">Editar</button>
      </div>
    </div>`;
}

function pantallaAhorro(c) {
  const metas = metasActivas();
  const total = metas.reduce((s, m) => s + (m.ahorrado || 0), 0) + (datos.extra || 0);
  const pct = datos.ahorroPct || 0;
  const cuota = datos.cuotaDiaria || 0;
  const p = proyeccion();
  c.innerHTML = `
    <div class="tarjeta destacada">
      <p class="suave">Ahorrado en total</p>
      <p class="cifra">${pesos(total)}</p>
      <p class="suave">Plata que no es para pagar cuentas: para emergencias y para invertir más adelante.</p>
    </div>

    <div class="rejilla">
    <div>
      <h2>¿Cuánto de lo de cada día va a ahorro?</h2>
      <form class="tarjeta" id="form-pct">
        <div class="dias" style="grid-template-columns:repeat(7,minmax(0,1fr))">${[0, 5, 10, 15, 20, 25, 30].map((n) =>
          `<label><input type="radio" name="ahorroPct" value="${n}" ${n === pct ? 'checked' : ''}><span>${n}%</span></label>`).join('')}</div>
        <p class="suave" style="margin-top:10px">${pct
          ? `Se aparta primero, antes de las cuentas${cuota ? `: de ${pesos(cuota)} ${frec().por}, ${pesos(Math.round((cuota * pct) / 100 / 1000) * 1000)} van a ahorro` : ''}.`
          : 'Hoy no se aparta nada primero para ahorro.'} Además, lo que sobre después de cubrir las cuentas siempre va a ahorro.</p>
        ${pct && !p.alcanza ? `<div class="alerta ambar">Con este porcentaje las cuentas no alcanzan a cubrirse a tiempo (vea "Hoy"). Puede bajarlo mientras se pone al día.</div>` : ''}
      </form>
    </div>
    <div>
      <h2>Metas</h2>
      ${!metas.length ? `<div class="tarjeta"><p>Todavía no hay metas. Puede empezar con dos:</p>
        <ul class="lista"><li><span><b>Fondo de emergencias</b><br><span class="suave">Para imprevistos (un daño del carro, una enfermedad) sin endeudarse.</span></span></li>
        <li><span><b>Para invertir</b><br><span class="suave">Plata que se va juntando para invertir más adelante.</span></span></li></ul>
        <button class="principal" id="btn-sugeridas">Crear estas dos metas</button></div>` : ''}
    </div>
    </div>
    <div class="rejilla">${metas.map(tarjetaMeta).join('')}</div>
    <button class="principal" id="btn-nueva-meta">+ Agregar meta</button>
    ${datos.extra ? `<div class="tarjeta"><p>Ahorro sin meta: <b>${pesos(datos.extra)}</b></p>
      <button class="chico" id="btn-extra">Pasar a una meta o cuenta</button></div>` : ''}

    ${tarjetaCuadre()}
    <h2>Cómo usar las cajitas de ${esc(banco())}</h2>
    <div class="tarjeta">
      <ul class="lista">
        <li><span>Cree en ${esc(banco())} una cajita <b>"${cajitaCuentas()}"</b> y una por cada meta (por ejemplo "${cajitaMeta('Fondo de emergencias')}" y "${cajitaMeta('Para invertir')}").</span></li>
        <li><span>Cada día, después de "Listo, ya lo aparté", haga en ${esc(banco())} los movimientos que dice la app.</span></li>
        <li><span>Cuando pague un recibo, sáquelo de "${cajitaCuentas()}" y marque "Ya pagué" en la app.</span></li>
        <li><span>Si quiere una cajita por cada recibo (más orden, más movimientos), póngale el nombre en "Editar" de cada pago.</span></li>
        <li><span>Una vez por semana compare el "Cuadre" de la app con lo que muestra ${esc(banco())}.</span></li>
      </ul>
    </div>

    <h2>Antes de invertir</h2>
    <div class="tarjeta">
      <p class="suave">Ideas generales, no son una recomendación para su caso:</p>
      <ul class="lista">
        <li><span>Muchas guías de finanzas personales sugieren este orden: estar al día con las deudas que cobran intereses altos (como las tarjetas de crédito), luego tener un fondo de emergencias de varios meses de gastos, y después invertir.</span></li>
        <li><span>Antes de meter plata en algo, pregunte: ¿qué tan riesgoso es?, ¿en cuánto tiempo la puedo sacar?, ¿cuánto cobran?</span></li>
        <li><span>Verifique que la entidad esté vigilada por la Superintendencia Financiera de Colombia. Desconfíe de rendimientos "garantizados" muy altos.</span></li>
        <li><span>Para decidir en qué invertir según su situación, consulte un asesor financiero certificado.</span></li>
      </ul>
    </div>`;

  $('#form-pct').onchange = (e) => {
    datos.ahorroPct = Number(new FormData(e.currentTarget).get('ahorroPct')) || 0;
    guardar(); avisar('Guardado'); render();
  };
  if ($('#btn-sugeridas')) $('#btn-sugeridas').onclick = () => {
    datos.metas = [
      { id: nuevoId(), nombre: 'Fondo de emergencias', objetivo: null, ahorrado: 0, porcentaje: 50, nota: '', activa: true },
      { id: nuevoId() + 'i', nombre: 'Para invertir', objetivo: null, ahorrado: 0, porcentaje: 50, nota: '', activa: true },
    ];
    guardar(); render();
  };
  $('#btn-nueva-meta').onclick = () => dialogoMeta(null);
  if ($('#btn-extra')) $('#btn-extra').onclick = dialogoExtra;
  $$('[data-editar-meta]', c).forEach((b) => (b.onclick = () => dialogoMeta(b.dataset.editarMeta)));
  $$('[data-sacar]', c).forEach((b) => (b.onclick = () => dialogoSacar(b.dataset.sacar)));
}

function dialogoMeta(id) {
  const m = id ? buscarMeta(id) : { nombre: '', objetivo: null, ahorrado: 0, porcentaje: 50, nota: '' };
  abrirModal(`
    <h2>${id ? 'Editar meta' : 'Nueva meta'}</h2>
    <label>Nombre</label><input name="nombre" value="${esc(m.nombre)}" required placeholder="Ej: Para invertir">
    <label>¿A cuánto quiere llegar? <span class="suave">(opcional)</span></label>${campoPesos('objetivo', m.objetivo)}
    <label>¿Qué parte del ahorro va a esta meta? <span class="suave">(%)</span></label>
    <input name="porcentaje" inputmode="numeric" maxlength="3" value="${m.porcentaje ?? 50}">
    <p class="suave">Se compara con las otras metas: si dos metas tienen 50, cada una recibe la mitad.</p>
    ${id ? `<label>Ya ahorrado</label>${campoPesos('ahorrado', m.ahorrado)}` : ''}
    ${campoCajita(m.bolsillo, m.nombre ? cajitaMeta(m.nombre) : 'el nombre de la meta')}
    <label>Nota <span class="suave">(opcional)</span></label><input name="nota" value="${esc(m.nota)}" maxlength="160">
    ${botonesModal(!!id)}
  `, (fd, boton) => {
    if (boton && boton.value === 'borrar') {
      preguntar(`¿Borrar la meta "${m.nombre}"? Lo ahorrado (${pesos(m.ahorrado)}) pasa a ahorro sin meta.`, 'Borrar').then((si) => {
        if (!si) return;
        datos.extra += m.ahorrado || 0;
        datos.metas = datos.metas.filter((x) => x.id !== id);
        marcarBorrado('metas', id);
        $('#modal').close();
        guardar(); render();
      });
      return false;
    }
    const campos = {
      nombre: String(fd.get('nombre')).trim(),
      objetivo: num(fd.get('objetivo')) || null,
      porcentaje: Math.min(100, num(fd.get('porcentaje'))),
      nota: String(fd.get('nota') || '').trim(),
      bolsillo: String(fd.get('bolsillo') || '').trim(),
    };
    if (!campos.nombre) { avisar('Falta el nombre'); return false; }
    if (id) Object.assign(m, campos, { ahorrado: num(fd.get('ahorrado')) });
    else datos.metas.push({ id: nuevoId(), ahorrado: 0, activa: true, ...campos });
    guardar(); render();
  });
}

function dialogoSacar(id) {
  const m = buscarMeta(id);
  abrirModal(`
    <h2>Sacar de: ${esc(m.nombre)}</h2>
    <p class="suave">Hay ${pesos(m.ahorrado)}.</p>
    <label>¿Cuánto sacó?</label>${campoPesos('monto')}
    <label>¿Para qué? <span class="suave">(opcional)</span></label><input name="nota" maxlength="120" placeholder="Ej: arreglo del carro, inversión en…">
    <label>Fecha</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}">
    ${botonesModal(false, 'Sacar')}
  `, (fd) => {
    const monto = Math.min(num(fd.get('monto')), m.ahorrado || 0);
    if (!monto) { avisar('Ponga cuánto sacó'); return false; }
    m.ahorrado = (m.ahorrado || 0) - monto;
    const nota = String(fd.get('nota') || '').trim();
    datos.pagos.push({ id: nuevoId(), fecha: fd.get('fecha') || hoy(), obligacionId: m.id, nombre: m.nombre + (nota ? ` (${nota})` : ''), monto, tipo: 'retiro' });
    guardar(); avisar(`Sacó ${pesos(monto)} de ${m.nombre}`); render();
  });
}

/* ---------- HISTORIAL ---------- */
function pantallaHistorial(c) {
  const f = hoy();
  const desde7 = L.sumarDias(f, -6);
  const mes = f.slice(0, 7);
  const suma = (lista, campo) => lista.reduce((s, r) => s + (r[campo] || 0), 0);
  const semana = datos.registros.filter((r) => r.fecha >= desde7);
  const delMes = datos.registros.filter((r) => r.fecha.startsWith(mes));
  const neto = (l) => suma(l, 'ingreso') - suma(l, 'carro');
  const porFuente = {};
  for (const r of delMes) for (const [k, v] of Object.entries(r.ingresos || {})) porFuente[k] = (porFuente[k] || 0) + v;

  const movimientos = [
    ...datos.registros.map((r) => ({
      fecha: r.fecha,
      txt: `Le entró ${pesos(r.ingreso)}${r.carro ? ` · gastos ${pesos(r.carro)}` : ''}${r.nota ? `<br><span class="suave">📝 ${esc(r.nota)}</span>` : ''}`,
      monto: `+${pesos(r.apartado)}`,
      boton: `<button class="chico" data-editar-registro="${r.id}">Editar</button>`,
    })),
    ...datos.pagos.map((pg) => ({
      fecha: pg.fecha,
      txt: pg.tipo === 'retiro' ? `Sacó del ahorro: ${esc(pg.nombre)}` : `Pagó ${esc(pg.nombre)}`,
      monto: `−${pesos(pg.monto)}`,
      boton: puedeDeshacer(pg) ? `<button class="chico" data-deshacer-pago="${pg.id}">Deshacer</button>` : '',
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 80);

  c.innerHTML = `
    <div class="rejilla">
    <div><h2>Últimos 7 días</h2>
    <div class="tarjeta"><ul class="lista">
      <li><span>Días trabajados</span><span class="monto">${new Set(semana.map((r) => r.fecha)).size}</span></li>
      <li><span>Quedó limpio</span><span class="monto">${pesos(neto(semana))}</span></li>
      <li><span>Apartó</span><span class="monto">${pesos(suma(semana, 'apartado'))}</span></li>
    </ul></div></div>
    <div><h2>Este mes</h2>
    <div class="tarjeta"><ul class="lista">
      ${Object.entries(porFuente).map(([k, v]) => `<li><span>Entró por ${esc(k)}</span><span class="monto">${pesos(v)}</span></li>`).join('')}
      <li><span>Gasolina</span><span class="monto">${pesos(suma(delMes, 'gasolina'))}</span></li>
      <li><span>Otros gastos</span><span class="monto">${pesos(suma(delMes, 'otros'))}</span></li>
      <li><span>Apartó</span><span class="monto">${pesos(suma(delMes, 'apartado'))}</span></li>
      <li><span>Pagó cuentas</span><span class="monto">${pesos(suma(datos.pagos.filter((x) => x.fecha.startsWith(mes) && x.tipo !== 'retiro'), 'monto'))}</span></li>
      <li><span>Ahorró</span><span class="monto">${pesos(delMes.reduce((s, r) => s + sumar(r.ahorro) + (r.extra || 0), 0))}</span></li>
      <li><span>Sacó del ahorro</span><span class="monto">${pesos(suma(datos.pagos.filter((x) => x.fecha.startsWith(mes) && x.tipo === 'retiro'), 'monto'))}</span></li>
    </ul></div></div>
    </div>
    <h2>Movimientos</h2>
    <p class="suave">Toque "Editar" para corregir o borrar un día. Los pagos se pueden deshacer (el último de cada uno).</p>
    <div class="tarjeta">${movimientos.length ? `<ul class="lista">${movimientos.map((m) =>
      `<li><span><span class="suave">${fechaCorta(m.fecha)}</span><br>${m.txt}</span>
       <span class="derecha"><span class="monto">${m.monto}</span>${m.boton}</span></li>`).join('')}</ul>`
      : '<p class="suave">Todavía no hay movimientos.</p>'}</div>`;
  activarBotones(c);
}

/* ---------- AJUSTES ---------- */
function pantallaAjustes(c) {
  c.innerHTML = `
    <div class="rejilla">
    <div><h2>Cuenta en la nube</h2>
    <div class="tarjeta" id="tarjeta-cuenta">${tarjetaCuenta()}</div>
    <h2>Perfil</h2>
    <form class="tarjeta" id="form-perfil">
      <label>Nombre de este perfil</label>
      <input name="nombre" value="${esc(datos.perfilNombre || 'Mamá')}" maxlength="20">
      <div class="botones">
        <button class="principal" style="margin:0;flex:1">Guardar nombre</button>
        ${datos.perfil !== 'mama' ? '<button type="button" class="peligro" id="btn-borrar-perfil">Borrar perfil</button>' : ''}
      </div>
      <p class="suave">Para cambiar de perfil o crear otro, use los botones de arriba.</p>
    </form>
    <h2>Banco</h2>
    <form class="tarjeta" id="form-banco">
      <label>¿En qué banco o app guarda la plata?</label>
      <input name="banco" value="${esc(banco())}" maxlength="30" placeholder="Nu">
      <p class="suave">Se usa en los textos ("Hoy mueva en Nu…").</p>
    </form>
    <h2>Ingresos y cuota</h2>
    <form class="tarjeta" id="form-trabajo" style="padding-top:2px">${preguntasTrabajo()}</form></div>

    <div><h2>De dónde entra la plata</h2>
    <form class="tarjeta" id="form-fuentes">
      <p class="suave">Cada una sale como un campo en "¿Cómo le fue hoy?". Agregue Uber cuando empiece.</p>
      <div id="fuentes">${datos.fuentes.map((f) => filaFuente(f)).join('')}</div>
      <div class="botones">
        <button type="button" id="btn-fuente">+ Agregar</button>
        <button class="principal" style="margin:0;flex:1">Guardar</button>
      </div>
    </form>

    <h2>Copia de seguridad</h2>
    <div class="tarjeta">
      <p class="suave">Todo se guarda solo en este teléfono, no en internet. Descargue una copia de vez en cuando por si se pierde o cambia el celular.</p>
      <div class="botones">
        <button id="btn-exportar">Descargar copia</button>
        <button type="button" id="btn-importar">Cargar copia</button>
        <input type="file" id="archivo" accept="application/json,.json" hidden>
      </div>
    </div>

    <h2>Clave de entrada</h2>
    <form class="tarjeta" id="form-clave">
      ${tieneClave()
        ? `<p>La app pide clave al abrirla y tras ${MINUTOS_BLOQUEO} minutos sin usarla.</p>
           <div class="botones"><button type="button" id="btn-bloquear">Bloquear ahora</button><button type="button" class="peligro" id="btn-quitar-clave">Quitar clave</button></div>
           <label>Cambiar clave</label>`
        : '<p class="suave">Sin clave: cualquiera con este celular desbloqueado puede abrirla.</p><label>Poner clave (4 a 8 números)</label>'}
      <input name="clave1" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" placeholder="Clave nueva">
      <input name="clave2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" placeholder="Repita la clave" style="margin-top:8px">
      <button class="principal">Guardar clave</button>
    </form>

    <h2>Empezar de cero</h2>
    <div class="tarjeta">
      <button class="peligro" id="btn-borrar">Borrar todo</button>
    </div></div>
    </div>`;

  activarCuenta();
  $('#form-perfil').onsubmit = (e) => {
    e.preventDefault();
    const nombre = String(new FormData(e.currentTarget).get('nombre') || '').trim();
    if (!nombre) return avisar('Falta el nombre');
    datos.perfilNombre = nombre;
    const p = perfiles.lista.find((x) => x.id === datos.perfil);
    if (p) p.nombre = nombre;
    guardarPerfiles(); guardar(); avisar('Guardado'); render();
  };
  if ($('#btn-borrar-perfil')) $('#btn-borrar-perfil').onclick = async () => {
    if (!(await preguntar(`¿Borrar el perfil "${datos.perfilNombre}" con todas sus cuentas, metas y registros${Nube.sesion ? ', también en la nube' : ''}? No se puede deshacer.`, 'Borrar perfil'))) return;
    const id = datos.perfil;
    try { await Nube.borrarPerfil(id); } catch (err) { avisar('No se pudo borrar en la nube'); return; }
    try { localStorage.removeItem(claveDatos(id)); } catch (err) { /* nada */ }
    perfiles.lista = perfiles.lista.filter((x) => x.id !== id);
    perfiles.activo = 'mama';
    guardarPerfiles();
    datos = cargar('mama');
    vista = 'hoy';
    render();
  };
  $('#form-banco').onchange = (e) => {
    datos.banco = String(new FormData(e.currentTarget).get('banco') || '').trim() || 'Nu';
    guardar(); avisar('Guardado');
  };
  $('#form-trabajo').onchange = (e) => {
    leerTrabajo(new FormData(e.currentTarget));
    guardar();
    avisar('Guardado');
    if (e.target.name === 'frecuencia') render();
  };

  $('#btn-fuente').onclick = () => {
    $('#fuentes').insertAdjacentHTML('beforeend', filaFuente(''));
    $$('#fuentes input').pop().focus();
  };
  $('#fuentes').onclick = (e) => {
    const b = e.target.closest('[data-quitar]');
    if (b) b.parentElement.remove();
  };
  $('#form-fuentes').onsubmit = (e) => {
    e.preventDefault();
    const nombres = [...new Set($$('#fuentes input').map((i) => i.value.trim()).filter(Boolean))];
    if (!nombres.length) return avisar('Deje al menos una');
    datos.fuentes = nombres;
    guardar(); avisar('Guardado'); render();
  };

  $('#form-clave').onsubmit = async (e) => {
    e.preventDefault();
    const a = e.target.clave1.value, b = e.target.clave2.value;
    if (!/^\d{4,8}$/.test(a)) return avisar('La clave son de 4 a 8 números');
    if (a !== b) return avisar('Las dos claves no coinciden');
    await ponerClave(a);
    avisar('Clave guardada');
    render();
  };
  if (tieneClave()) {
    $('#btn-bloquear').onclick = bloquear;
    $('#btn-quitar-clave').onclick = async () => {
      if (!(await preguntar('¿Quitar la clave?', 'Quitar'))) return;
      try { localStorage.removeItem(CLAVE_PIN); } catch (e) { /* nada */ }
      avisar('Clave quitada');
      render();
    };
  }

  $('#btn-exportar').onclick = () => {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alcancia-${hoy()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#btn-importar').onclick = () => $('#archivo').click();
  $('#archivo').onchange = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      const d = JSON.parse(await archivo.text());
      if (!Array.isArray(d.obligaciones)) throw new Error('formato');
      if (!(await preguntar('Esto reemplaza lo que hay en este teléfono por la copia. ¿Seguir?', 'Reemplazar'))) return;
      const nuevos = migrar(d);
      for (const t of ['obligaciones', 'registros', 'pagos', 'metas']) {
        const quedan = new Set(nuevos[t].map((x) => x.id));
        for (const x of datos[t]) if (!quedan.has(x.id)) nuevos.borrados[t].push(x.id);
      }
      datos = nuevos;
      guardar();
      avisar('Copia cargada');
      ir('hoy');
    } catch (err) {
      avisar('Ese archivo no es una copia válida');
    }
  };
  $('#btn-borrar').onclick = async () => {
    const msg = Nube.sesion ? '¿Seguro? Se borra todo lo registrado, en este teléfono Y en la nube.' : '¿Seguro? Se borra todo lo registrado en este teléfono.';
    if (!(await preguntar(msg, 'Borrar todo'))) return;
    const borrados = { obligaciones: datos.obligaciones.map((x) => x.id), registros: datos.registros.map((x) => x.id), pagos: datos.pagos.map((x) => x.id), metas: (datos.metas || []).map((x) => x.id) };
    const perfilActual = { perfil: datos.perfil, perfilNombre: datos.perfilNombre };
    datos = { ...estadoNuevo(), ...perfilActual };
    datos.borrados = borrados;
    guardar();
    ir('hoy');
  };
}

function filaFuente(nombre) {
  return `<div class="fila-quitar"><input value="${esc(nombre)}" placeholder="Ej: Uber" maxlength="30" aria-label="Fuente de ingreso">
    <button type="button" class="chico peligro" data-quitar aria-label="Quitar">✕</button></div>`;
}

/* ---------- CUENTA EN LA NUBE ---------- */
const TEXTO_NUBE = {
  'al-dia': '☁ Guardado', subiendo: '☁ Guardando…', bajando: '☁ Actualizando…',
  error: '⚠ Sin conexión: se guarda cuando vuelva', 'sin-sesion': '', 'no-disponible': '',
};
function pintarEstadoNube() {
  const e = $('#nube-estado');
  if (e) {
    e.textContent = TEXTO_NUBE[Nube.estado] || '';
    e.className = 'nube ' + Nube.estado;
  }
  const t = $('#tarjeta-cuenta');
  if (t && !t.contains(document.activeElement)) { t.innerHTML = tarjetaCuenta(); activarCuenta(); }
}

function tarjetaCuenta() {
  if (!Nube.disponible) return '<p class="suave">No se pudo cargar la conexión a la nube. Revise el internet y vuelva a abrir la app.</p>';
  if (!Nube.sesion) {
    return `<p class="suave">Sin cuenta, todo queda solo en este celular. Con cuenta, se guarda en la nube: no se pierde si cambia de celular y lo puede ver desde el PC o pgAdmin.</p>
      <button type="button" class="principal" id="btn-cuenta">Entrar o crear cuenta</button>`;
  }
  return `<p>Conectado como <b>${esc(Nube.correo)}</b></p>
    <p class="suave">${esc(TEXTO_NUBE[Nube.estado] || '')}</p>
    <div class="botones">
      <button type="button" id="btn-sincronizar">Actualizar ahora</button>
      <button type="button" class="peligro" id="btn-salir">Cerrar sesión</button>
    </div>`;
}
function activarCuenta() {
  if ($('#btn-cuenta')) $('#btn-cuenta').onclick = dialogoCuenta;
  if ($('#btn-sincronizar')) $('#btn-sincronizar').onclick = async () => { await Nube.subirAhora(datos); await traerDeLaNube(true); avisar('Actualizado'); };
  if ($('#btn-salir')) $('#btn-salir').onclick = async () => {
    if (!(await preguntar('¿Cerrar sesión? Los datos quedan guardados en la nube y se borran de este celular hasta que vuelva a entrar.', 'Cerrar sesión'))) return;
    await cerrarSesion();
  };
}

function dialogoCuenta() {
  abrirModal(`
    <h2>Cuenta en la nube</h2>
    <label>Correo</label><input name="correo" type="email" autocomplete="email" required>
    <label>Contraseña <span class="suave">(mínimo 8 caracteres)</span></label>
    <input name="clave" type="password" autocomplete="current-password" minlength="8" required>
    <p class="suave">¿No se acuerda de la contraseña? Escriba el correo y toque "Olvidé la contraseña": le llega un correo para crear una nueva.</p>
    <div class="botones acciones">
      <button value="cancelar" formnovalidate>Cancelar</button>
      <button value="olvide" formnovalidate>Olvidé la contraseña</button>
      <button value="entrar" class="principal">Entrar</button>
    </div>
  `, (fd, boton) => {
    const correo = String(fd.get('correo')).trim();
    const clave = String(fd.get('clave'));
    const accion = boton && boton.value === 'crear' ? 'crear' : boton && boton.value === 'olvide' ? 'olvide' : 'entrar';
    if (accion === 'olvide' && !/^\S+@\S+\.\S+$/.test(correo)) { avisar('Escriba primero su correo'); return false; }
    const botones = $$('#modal-form button');
    botones.forEach((b) => (b.disabled = true));
    (async () => {
      try {
        if (accion === 'olvide') {
          await Nube.recuperar(correo);
          $('#modal').close();
          avisar('Listo. Revise su correo (también en "spam") y toque el enlace para crear la contraseña nueva.');
          return;
        }
        if (accion === 'crear') {
          const r = await Nube.crearCuenta(correo, clave);
          if (!r.session) {
            $('#modal').close();
            avisar('Listo. Revise su correo y toque el enlace para confirmar la cuenta.');
            return;
          }
        } else {
          await Nube.entrar(correo, clave);
        }
        $('#modal').close();
        avisar('Sesión iniciada');
        await traerDeLaNube(true);
        render();
      } catch (e) {
        botones.forEach((b) => (b.disabled = false));
        avisar(traducirError(e));
      }
    })();
    return false; // el diálogo se cierra cuando termine
  });
}

/** Después de tocar el enlace del correo de recuperación: pedir la contraseña nueva. */
function dialogoClaveNueva() {
  abrirModal(`
    <h2>Contraseña nueva</h2>
    <p class="suave">Escriba la contraseña nueva para entrar a la nube (mínimo 8 caracteres). Guárdela en un lugar seguro.</p>
    <label>Contraseña nueva</label><input name="clave1" type="password" autocomplete="new-password" minlength="8" required>
    <label>Repítala</label><input name="clave2" type="password" autocomplete="new-password" minlength="8" required>
    ${botonesModal(false, 'Guardar contraseña')}
  `, (fd) => {
    const a = String(fd.get('clave1')), b = String(fd.get('clave2'));
    if (a.length < 8) { avisar('Mínimo 8 caracteres'); return false; }
    if (a !== b) { avisar('Las dos contraseñas no coinciden'); return false; }
    $$('#modal-form button').forEach((x) => (x.disabled = true));
    Nube.cambiarClave(a)
      .then(async () => { $('#modal').close(); avisar('Contraseña cambiada. Ya quedó con sesión iniciada.'); await traerDeLaNube(true); })
      .catch((e) => { $$('#modal-form button').forEach((x) => (x.disabled = false)); avisar(traducirError(e)); });
    return false;
  });
}

function traducirError(e) {
  const m = String((e && (e.message || e.code)) || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar el correo: revise su bandeja de entrada';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta: use "Entrar"';
  if (/Signups not allowed|signup.*disabled/i.test(m)) return 'No se permiten cuentas nuevas';
  if (/Password should be/i.test(m)) return 'La contraseña es muy corta o muy sencilla';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Ya se mandó un correo hace poco. Espere unos minutos y revise su bandeja (y "spam")';
  if (/same.*password|different from the old/i.test(m)) return 'La contraseña nueva debe ser distinta a la anterior';
  if (/fetch|network/i.test(m)) return 'Sin conexión a internet';
  return 'No se pudo: ' + m;
}

/** Baja lo de la nube y, si cambió algo, lo muestra (sin interrumpir si está escribiendo). */
async function traerDeLaNube(forzarPintar = false) {
  if (!Nube.sesion) return;
  const remotos = await Nube.sincronizar(datos, async () =>
    (await preguntar('Hay datos en la nube y también en este celular. "Juntar ambos" sube lo de este celular sin borrar nada de la nube. "Cancelar" deja solo lo de la nube.', 'Juntar ambos')) ? 'celular' : 'nube');
  if (remotos) {
    const antes = JSON.stringify(datos);
    datos = migrar({ ...datos, ...remotos });
    guardarLocal();
    const ocupado = document.body.classList.contains('escribiendo') || $('#modal').open;
    if ((antes !== JSON.stringify(datos) || forzarPintar) && !ocupado) render();
  } else if (forzarPintar) {
    render();
  }
}

async function iniciarNube() {
  if (typeof Nube === 'undefined' || !Nube.disponible) { nubeLista = true; render(); return; }
  Nube.onCambio(pintarEstadoNube);
  Nube.onSubido(guardarLocal); // la lista de borrados ya se aplicó en la nube
  try { await Nube.iniciar(); } catch (e) { /* sin conexión: sigue con la sesión guardada si hay */ }
  nubeLista = true;
  render();
  pintarEstadoNube();
  if (!Nube.sesion) return;
  if (Nube.recuperando) dialogoClaveNueva();
  await traerPerfilesDeLaNube();
  await traerDeLaNube(true);
}
/** Si en otro celular se creó un perfil, que aparezca aquí también. */
async function traerPerfilesDeLaNube() {
  if (!Nube.sesion) return;
  const remotos = await Nube.listarPerfiles();
  let cambio = false;
  for (const r of remotos) {
    const local = perfiles.lista.find((p) => p.id === r.id);
    if (!local) { perfiles.lista.push({ id: r.id, nombre: r.nombre || r.id }); cambio = true; }
    else if (r.nombre && local.nombre !== r.nombre) { local.nombre = r.nombre; cambio = true; }
  }
  if (cambio) { guardarPerfiles(); datos.perfilNombre = nombrePerfil(datos.perfil); pintarPerfiles(); }
}
window.addEventListener('online', () => { if (Nube.sesion && Nube.hayPendiente(datos.perfil)) Nube.subirAhora(datos); });

/* ---------- CLAVE ----------
 * Candado local: los datos nunca salen del teléfono, así que la clave solo evita
 * que otra persona con el celular en la mano abra la app. Se guarda como hash, no en texto.
 */
function leerClave() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PIN) || 'null'); } catch (e) { return null; }
}
function tieneClave() { return !!leerClave(); }
async function hashClave(pin, sal) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${pin}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function ponerClave(pin) {
  const sal = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(CLAVE_PIN, JSON.stringify({ sal, hash: await hashClave(pin, sal) }));
  sessionStorage.setItem('alcancia-abierta', '1');
}
function bloquear() {
  try { sessionStorage.removeItem('alcancia-abierta'); } catch (e) { /* nada */ }
  bloqueada = true;
  render();
}

let intentosFallidos = 0;
let esperarHasta = 0;
function pantallaBloqueo(c) {
  c.innerHTML = `
    <form class="tarjeta" id="form-entrar" style="margin-top:40px;text-align:center">
      <p class="cifra-m">🔒</p>
      <label for="pin">Escriba la clave</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" style="text-align:center;letter-spacing:8px">
      <button class="principal">Entrar</button>
      <p class="suave" style="margin-top:16px"><a href="#" id="olvide">Olvidé la clave</a></p>
    </form>`;
  const pin = $('#pin');
  pin.focus();
  $('#form-entrar').onsubmit = async (e) => {
    e.preventDefault();
    const ahora = Date.now();
    if (ahora < esperarHasta) return avisar(`Espere ${Math.ceil((esperarHasta - ahora) / 1000)} segundos`);
    const guardada = leerClave();
    if (guardada && (await hashClave(pin.value, guardada.sal)) === guardada.hash) {
      intentosFallidos = 0;
      bloqueada = false;
      sessionStorage.setItem('alcancia-abierta', '1');
      render();
      return;
    }
    intentosFallidos++;
    if (intentosFallidos >= 5) esperarHasta = ahora + 30000 * (intentosFallidos - 4);
    pin.value = '';
    avisar('Clave incorrecta');
  };
  $('#olvide').onclick = async (e) => {
    e.preventDefault();
    if (!(await preguntar('Se quita la clave, se cierra la sesión y se borran los datos de este celular. Los datos siguen en la nube: para verlos, entre otra vez con su correo y contraseña. ¿Seguir?', 'Seguir'))) return;
    try { localStorage.removeItem(CLAVE_PIN); } catch (err) { /* nada */ }
    await Nube.salir();
    borrarDatosLocales();
    bloqueada = false;
    render();
  };
}

/* Mientras se escribe (teclado abierto) se esconde la barra de abajo */
const esCampo = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), select');
document.addEventListener('focusin', (e) => { if (esCampo(e.target)) document.body.classList.add('escribiendo'); });
document.addEventListener('focusout', () => {
  setTimeout(() => { if (!esCampo(document.activeElement)) document.body.classList.remove('escribiendo'); }, 50);
});

/* ---------- arranque ---------- */
let bloqueada = true;
try { bloqueada = tieneClave() && sessionStorage.getItem('alcancia-abierta') !== '1'; } catch (e) { bloqueada = tieneClave(); }
render();
// Al volver a la app: si cambió el día se actualiza; si pasó mucho rato, pide la clave.
let diaPintado = hoy();
let ocultaDesde = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ocultaDesde = Date.now(); return; }
  if (tieneClave() && !bloqueada && ocultaDesde && Date.now() - ocultaDesde > MINUTOS_BLOQUEO * 60000) return bloquear();
  if (hoy() !== diaPintado) { diaPintado = hoy(); render(); }
  traerDeLaNube();
});
iniciarNube();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Si llega una versión nueva de la app, se recarga sola una vez.
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargando) return;
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => { reg.update(); document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); }); })
    .catch(() => {});
}
