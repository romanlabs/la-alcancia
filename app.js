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
    obligaciones: [], registros: [], pagos: [],
  };
}
/** Pone al día datos guardados con versiones anteriores de la app. */
function migrar(d) {
  const n = { ...estadoNuevo(), ...d };
  if (d.diasSemana == null && Array.isArray(d.descanso)) n.diasSemana = Math.max(1, 7 - d.descanso.length);
  delete n.descanso;
  if (!Array.isArray(n.fuentes) || !n.fuentes.length) n.fuentes = ['InDrive'];
  n.registros = (n.registros || []).map((r) => ({
    ingresos: r.ingresos || { Total: r.ingreso || 0 },
    gasolina: r.gasolina ?? (r.carro || 0),
    otros: r.otros || 0,
    extra: r.extra || 0,
    nota: r.nota || '',
    ...r,
  }));
  n.version = 3;
  return n;
}
function cargar() {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) return migrar(JSON.parse(t));
  } catch (e) { /* sin almacenamiento: empieza vacío */ }
  return estadoNuevo();
}
function guardarLocal() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    avisar('No se pudo guardar en este teléfono');
  }
}
function guardar() {
  guardarLocal();
  if (typeof Nube !== 'undefined') Nube.programarSubida(() => datos);
}

let datos = cargar();
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
  const ya = apartadoDelDia(f);
  let p = L.plan(activas(), f, datos, ya);
  const automatica = !datos.cuotaDiaria;
  if (automatica) p = L.plan(activas(), f, { ...datos, cuotaDiaria: p.necesaria }, ya);
  const objetivo = automatica ? p.necesaria : datos.cuotaDiaria;
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
  datos.extra += r.extra || 0;
}
function revertirReparto(r) {
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

function render() {
  $('#fecha-hoy').textContent = fechaLarga(hoy());
  const nav = $('#pestanas');
  nav.hidden = !datos.configurado;
  $$('button', nav).forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  const c = $('#contenido');
  if (bloqueada) { nav.hidden = true; return pantallaBloqueo(c); }
  if (!datos.configurado) return pantallaInicio(c);
  ({ hoy: pantallaHoy, sobres: pantallaPagos, historial: pantallaHistorial, ajustes: pantallaAjustes }[vista] || pantallaHoy)(c);
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
  return `
    <label>¿Cuánto quiere apartar cada día que trabaja?</label>
    ${campoPesos('cuotaDiaria', datos.cuotaDiaria)}
    <p class="suave">La app reparte esa plata entre los pagos, primero lo que vence antes, y le avisa si no alcanza. Deje en $0 para que la app calcule cuánto hace falta.</p>
    <label>¿Cuántos días trabaja a la semana, más o menos?</label>
    ${botonesNumero('diasSemana', 1, 7, datos.diasSemana)}
    <p class="suave">Si a veces falla por un imprevisto, ponga un número más bajo. Mejor que sobre a que falte.</p>
    <label>¿Cuántos días antes del pago quiere tener la plata lista?</label>
    ${botonesNumero('margen', 0, 4, datos.margen)}
    <p class="suave">Es un colchón: si justo antes del pago no se puede trabajar, la plata ya está.</p>`;
}
function leerTrabajo(fd) {
  const cfg = L.ajustes({ diasSemana: fd.get('diasSemana'), margen: fd.get('margen') });
  datos.diasSemana = cfg.diasSemana;
  datos.margen = cfg.margen;
  if (fd.has('cuotaDiaria')) datos.cuotaDiaria = num(fd.get('cuotaDiaria'));
}

function filaPago(p, i) {
  const cuando = p.tipo === 'semanal'
    ? `<label>Día de la semana</label><select name="dia-${i}">${DIAS.map((d, n) => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${d}</option>`).join('')}</select>`
    : `<label>Día que vence</label><input name="dia-${i}" inputmode="numeric" placeholder="1 a 31" maxlength="2">`;
  return `
    <div class="tarjeta" data-fila="${i}">
      <input name="nombre-${i}" value="${esc(p.nombre)}" aria-label="Nombre" placeholder="Nombre del pago" style="font-weight:700">
      ${p.ayuda ? `<p class="suave">${esc(p.ayuda)}</p>` : ''}
      <div class="fila">
        <div><label>${p.tipo === 'semanal' ? 'Valor semanal' : 'Valor'}</label>${campoPesos('monto-' + i)}</div>
        <div>${cuando}</div>
      </div>
      ${p.deuda ? `<label>Deuda total <span class="suave">(opcional)</span></label>${campoPesos('saldo-' + i)}` : ''}
      ${p.tipo === 'mensual' ? `<label class="check"><input type="checkbox" name="pagado-${i}"> Ya pagué el de este mes</label>` : ''}
      <input type="hidden" name="tipo-${i}" value="${p.tipo}"><input type="hidden" name="prio-${i}" value="${p.prioridad}">
      <input type="hidden" name="nombreBase-${i}" value="${esc(p.nombre)}">
    </div>`;
}

function pantallaInicio(c) {
  c.innerHTML = `
    <div class="tarjeta destacada">
      <p class="cifra-m">Hola 👋</p>
      <p>Esta app le dice, cada día que trabaja, <b>cuánto guardar</b> y para qué, para que el día de pagar la plata ya esté lista.</p>
      <p class="suave">Llene solo lo que aplique. Lo que deje sin valor no se agrega. Todo se puede cambiar después.</p>
    </div>
    ${Nube.disponible && !Nube.sesion ? `<div class="tarjeta"><p>¿Ya tiene cuenta (por ejemplo, en otro celular)?</p>
      <button type="button" id="btn-ya-tengo">Entrar con mi cuenta</button></div>` : ''}
    <form id="form-inicio">
      <h2>¿Cómo trabaja?</h2>
      ${preguntasTrabajo()}
      <h2>Lo que hay que pagar</h2>
      <div class="rejilla" id="filas">${PLANTILLA.map(filaPago).join('')}</div>
      <button type="button" id="btn-otra-fila">+ Agregar otro pago</button>
      <button type="submit" class="principal">Empezar</button>
    </form>`;

  if ($('#btn-ya-tengo')) $('#btn-ya-tengo').onclick = dialogoCuenta;
  let filas = PLANTILLA.length;
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
      const monto = num(fd.get('monto-' + i));
      if (!monto) return;
      const tipo = fd.get('tipo-' + i);
      const dia = Number(fd.get('dia-' + i));
      const nombre = String(fd.get('nombre-' + i)).trim() || fd.get('nombreBase-' + i) || 'Pago';
      if (tipo === 'mensual' && !(dia >= 1 && dia <= 31)) return errores.push(nombre);
      const saldo = num(fd.get('saldo-' + i));
      const campos = { nombre, tipo, dia, monto, prioridad: Number(fd.get('prio-' + i)), saldoTotal: saldo || null };
      if (tipo === 'mensual' && fd.get('pagado-' + i)) campos.proximo = L.proximaSiYaPagoEsteMes(hoy(), dia);
      nuevas.push(crearObligacion(campos));
    });
    if (errores.length) return avisar(`Falta el día de pago de: ${errores[0]}`);
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
  const porMes = activas().reduce((s, o) => s + (o.tipo === 'semanal' ? (o.monto * 52) / 12 : o.tipo === 'mensual' ? o.monto : 0), 0);
  return L.redondearMil(porMes / ((datos.diasSemana * 365) / 12 / 7));
}

function avisoPlan(p) {
  const malos = p.items.filter((x) => x.faltante > 0);
  const cuota = pesos(p.objetivo);
  if (!p.items.length) return '';
  const normal = cuotaMesNormal();
  const lineaNormal = normal ? `<p class="suave" style="margin-top:8px">Un mes normal, sin atrasos, necesita unos <b>${pesos(normal)}</b> diarios trabajando ${datos.diasSemana} días a la semana.</p>` : '';
  if (!malos.length) {
    return `<div class="alerta verde">✔ Con ${cuota} diarios alcanza para todo lo del próximo mes.${lineaNormal}</div>`;
  }
  return `
    <div class="alerta ambar">
      Con ${cuota} diarios no alcanza para:
      <ul class="lista" style="margin:6px 0">${malos.slice(0, 4).map((x) =>
        `<li><span>${esc(x.nombre)} <span class="suave">(${fechaCorta(x.fecha)})</span></span><span class="monto">faltan ${pesos(x.faltante)}</span></li>`).join('')}</ul>
      Para cubrir todo a tiempo habría que apartar <b>${pesos(p.necesaria)}</b> al día, trabajar más días, o abonar de otro lado.
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
      <p class="suave">${p.ya ? 'Todavía le falta apartar hoy' : 'Hoy toca apartar'}</p>
      <p class="cifra">${pesos(p.pendienteHoy)}</p>
      <p class="suave">${p.pendienteHoy ? (p.automatica ? 'para que alcance para todos los pagos.' : `de la cuota diaria de ${pesos(p.objetivo)}.`) : '¡Listo por hoy! 💪'}</p>
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
    </div></div>
  `;

  const form = $('#form-dia');
  const calculo = $('#calculo');

  function actualizar() {
    const apartar = num(form.apartar.value);
    const d = leerDia(form);
    const r = L.repartirDia(activas(), apartar, f, datos);
    calculo.innerHTML = explicarReparto(r, apartar) + (d.ingreso
      ? `<div class="alerta verde">Entró ${pesos(d.ingreso)}${d.carro ? `, gastos ${pesos(d.carro)}` : ''}: para la casa quedan ${pesos(Math.max(0, d.neto - apartar))}</div>`
      : '');
    $('#btn-registrar').disabled = apartar <= 0;
    $('#btn-registrar').onclick = () => {
      const { neto: _n, ...dia } = d;
      const reg = { id: nuevoId(), fecha: hoy(), ...dia, apartado: apartar, reparto: r.reparto, extra: r.extra };
      aplicarReparto(reg);
      datos.registros.push(reg);
      guardar();
      avisar(`Listo: ${pesos(apartar)} repartidos`);
      render();
    };
  }

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
    <p class="suave" style="margin-top:14px">Así se reparten los ${pesos(apartar)}: a cada cuenta según lo que le falta y los días que quedan para pagarla${noAlcanzo ? '. Como no alcanza para todo, las de prioridad alta van primero y el resto se reparte parejo' : ''}.</p>
    <ul class="lista reparto">
      ${conPlata.map(({ o, d, m }) => `
        <li><span><b>${esc(o.nombre)}</b><br>
          <span class="suave">Faltan ${pesos(d.falta)} · vence ${fechaCorta(d.fecha)} · ${d.dias <= 1 ? 'ya se debe juntar' : `${d.dias} días de trabajo`} → necesita ${pesos(d.necesidad)} al día</span></span>
          <span class="monto">${pesos(m)}</span></li>`).join('')}
      ${r.extra ? `<li><span><b>Ahorro extra</b><br><span class="suave">Todas las cuentas ya tienen lo suyo</span></span><span class="monto">${pesos(r.extra)}</span></li>` : ''}
    </ul>
    ${sinPlata.length ? `<p class="suave">Hoy no reciben: ${sinPlata.map(({ o }) => esc(o.nombre)).join(', ')} (${sinPlata.every(({ o }) => (o.prioridad || 2) > 1) ? 'prioridad más baja: reciben cuando las importantes estén al día' : 'reciben en los próximos días'}).</p>` : ''}
    <p class="suave">👉 Pase la plata al bolsillo de ahorro hoy mismo. Si se queda en la billetera, se gasta.</p>`;
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
        $('#modal').close();
        guardar(); avisar('Día borrado'); render();
      });
      return false;
    }
    const d = leerDia($('#modal-form'));
    const apartar = num(fd.get('apartar'));
    revertirReparto(r);
    if (apartar !== r.apartado) {
      const nuevo = L.repartirDia(activas(), apartar, fd.get('fecha') || r.fecha, datos);
      r.reparto = nuevo.reparto;
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
    ? `<p class="alerta ambar" style="margin:8px 0 0;padding:8px 12px">Con la cuota diaria faltarían ${pesos(f)}</p>`
    : '<p class="suave">✔ Con la cuota diaria llega completo</p>';
}

function tarjetaCorta(o, f, faltantes) {
  const est = estadoDe(o, f, faltantes);
  const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
  return `
    <div class="tarjeta">
      <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
      <p class="suave">${fechaCorta(o.proximo)} · ${cuandoVence(o.proximo)}</p>
      <div class="barra-progreso"><div style="width:${pct}%"></div></div>
      <p><b>${pesos(o.apartado)}</b> de ${pesos(o.monto)}</p>
      ${lineaPlan(o, faltantes)}
      ${est === 'vence-hoy' || est === 'vencida' || est === 'cubierta'
        ? `<div class="botones"><button class="chico" data-pagar="${o.id}">Ya pagué</button></div>` : ''}
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
      <p class="suave">Plata apartada en total (debería estar en el bolsillo de ahorro)</p>
      <p class="cifra-m">${pesos(totalApartado)}</p>
      ${datos.extra ? `<p class="suave">De eso, ahorro extra (sin pago asignado): <b>${pesos(datos.extra)}</b>
        <button class="chico" id="btn-extra" style="margin-left:6px">Usar / ajustar</button></p>` : ''}
    </div>
    ${avisoPlan(p)}
    <button class="principal" id="btn-nuevo">+ Agregar un pago</button>
    <div class="rejilla">${lista.map((o) => {
      const est = estadoDe(o, f, p.faltantes);
      const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
      const cada = o.tipo === 'mensual' ? `cada mes el ${o.dia}` : o.tipo === 'semanal' ? `cada ${DIAS[o.dia]}` : 'una sola vez';
      return `
      <div class="tarjeta">
        <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
        <p class="suave">${pesos(o.monto)} · ${cada}</p>
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
    <h2>Ahorro extra</h2>
    <p class="suave">Plata apartada que no tiene un pago asignado. Puede pasarla a un pago o cambiar el valor si la usó.</p>
    <label>Ahorro extra</label>${campoPesos('extra', datos.extra)}
    <label>Pasar a un pago <span class="suave">(opcional)</span></label>
    <select name="destino"><option value="">— No pasar —</option>${activas().map((o) => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('')}</select>
    <label>¿Cuánto pasar?</label>${campoPesos('pasar')}
    ${botonesModal()}
  `, (fd) => {
    let extra = num(fd.get('extra'));
    const destino = buscar(fd.get('destino'));
    const pasar = Math.min(num(fd.get('pasar')), extra);
    if (destino && pasar) { destino.apartado += pasar; extra -= pasar; }
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
    <label>Fecha del pago</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}">
    <p class="suave">Si es el fondo del carro y no lo usó, ponga $0: la plata sigue guardada y pasa al otro mes.</p>
    ${botonesModal(false, 'Pagado')}
  `, (fd) => {
    const pagado = num(fd.get('pagado'));
    const antes = { ...o };
    Object.assign(o, L.pagar(o, pagado));
    datos.pagos.push({ id: nuevoId(), fecha: fd.get('fecha') || hoy(), obligacionId: o.id, nombre: o.nombre, monto: pagado, antes });
    guardar();
    avisar(pagado > antes.apartado ? `Pagado. ${pesos(pagado - antes.apartado)} salieron de otro lado.` : 'Pagado ✔');
    render();
  });
}

/** Solo se puede deshacer el último pago de cada compromiso (vuelve todo como estaba). */
const puedeDeshacer = (pg) => pg.antes && buscar(pg.obligacionId) &&
  datos.pagos.filter((x) => x.obligacionId === pg.obligacionId).pop() === pg;

async function deshacerPago(id) {
  const pg = datos.pagos.find((x) => x.id === id);
  if (!pg || !puedeDeshacer(pg)) return;
  if (!(await preguntar(`¿Deshacer el pago de ${pg.nombre} por ${pesos(pg.monto)}? Vuelve a quedar como antes de pagar.`, 'Deshacer'))) return;
  Object.assign(buscar(pg.obligacionId), pg.antes);
  datos.pagos = datos.pagos.filter((x) => x.id !== id);
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
      <option value="unica" ${o.tipo === 'unica' ? 'selected' : ''}>Una sola vez</option>
    </select>
    <div id="cuando"></div>
    ${id && o.tipo !== 'unica' ? `<label>Próxima fecha de pago</label><input type="date" name="proximo" value="${o.proximo || ''}">
      <p class="suave">Cámbiela si este mes el recibo llega otro día.</p>` : ''}
    ${o.tipo !== 'semanal' && o.tipo !== 'unica' ? `<label class="check"><input type="checkbox" name="yaPagado"> Ya está pagado el de este mes (el próximo es el del otro mes)</label>` : ''}
    <label>¿Cuánto es?</label>${campoPesos('monto', o.monto)}
    <label>Deuda total <span class="suave">(opcional; se va bajando con cada pago)</span></label>${campoPesos('saldo', o.saldoTotal)}
    <label>¿Qué tan grave es no pagarlo a tiempo?</label>
    <select name="prioridad">
      <option value="1" ${o.prioridad === 1 ? 'selected' : ''}>Muy grave (cortan el servicio, intereses)</option>
      <option value="2" ${o.prioridad === 2 ? 'selected' : ''}>Normal</option>
      <option value="3" ${o.prioridad === 3 ? 'selected' : ''}>Puede esperar</option>
    </select>
    ${id ? `<label>Plata ya apartada para esto</label>${campoPesos('apartado', o.apartado)}` : ''}
    <label>Nota <span class="suave">(opcional)</span></label>
    <input name="nota" value="${esc(o.nota)}" placeholder="Ej: número de contrato, a quién se le paga…" maxlength="160">
    ${botonesModal(!!id)}
  `, (fd, boton) => {
    if (boton && boton.value === 'borrar') {
      preguntar(`¿Borrar "${o.nombre}"? Lo apartado para este pago pasa a ahorro extra.`, 'Borrar').then((si) => {
        if (!si) return;
        datos.extra += o.apartado || 0;
        datos.obligaciones = datos.obligaciones.filter((x) => x.id !== id);
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
      nota: String(fd.get('nota') || '').trim(),
    };
    if (tipo === 'unica') campos.fecha = fd.get('fecha');
    else campos.dia = Number(fd.get('dia'));
    if (!campos.monto) { avisar('Falta cuánto es'); return false; }
    if (tipo === 'mensual' && !(campos.dia >= 1 && campos.dia <= 31)) { avisar('El día del mes va de 1 a 31'); return false; }
    if (tipo === 'unica' && !campos.fecha) { avisar('Falta la fecha'); return false; }

    if (!id) {
      if (tipo === 'mensual' && fd.get('yaPagado')) campos.proximo = L.proximaSiYaPagoEsteMes(hoy(), campos.dia);
      datos.obligaciones.push(crearObligacion(campos));
    } else {
      const cambioFecha = tipo !== o.tipo || campos.dia !== o.dia || campos.fecha !== o.fecha;
      const estabaTerminada = o.activa === false;
      const proximoManual = fd.get('proximo');
      Object.assign(o, campos, { apartado: num(fd.get('apartado')), activa: true });
      if (tipo === 'mensual' && fd.get('yaPagado')) { o.proximo = L.proximaSiYaPagoEsteMes(hoy(), campos.dia); o.inicio = hoy(); }
      else if (proximoManual && proximoManual !== o.proximo && !cambioFecha) { o.proximo = proximoManual; o.inicio = hoy(); }
      else if (cambioFecha || estabaTerminada) { o.proximo = L.primeraFecha(o, hoy()); o.inicio = hoy(); }
    }
    guardar(); render();
  }, (form) => {
    const pintarCuando = () => {
      const t = form.tipo.value;
      $('#cuando', form).innerHTML = t === 'mensual'
        ? `<label>¿Qué día del mes?</label><input name="dia" inputmode="numeric" maxlength="2" value="${o.tipo === 'mensual' ? o.dia : ''}" placeholder="Ej: 15">`
        : t === 'semanal'
          ? `<label>¿Qué día de la semana?</label><select name="dia">${DIAS.map((d, n) => `<option value="${n}" ${o.tipo === 'semanal' && o.dia === n ? 'selected' : ''}>${d}</option>`).join('')}</select>`
          : `<label>¿Qué fecha?</label><input type="date" name="fecha" value="${o.fecha || ''}">`;
    };
    form.tipo.onchange = pintarCuando;
    pintarCuando();
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
      txt: `Pagó ${esc(pg.nombre)}`,
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
      <li><span>Pagó</span><span class="monto">${pesos(suma(datos.pagos.filter((x) => x.fecha.startsWith(mes)), 'monto'))}</span></li>
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
    <h2>Cuota y días de trabajo</h2>
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
  $('#form-trabajo').onchange = (e) => {
    leerTrabajo(new FormData(e.currentTarget));
    guardar();
    avisar('Guardado');
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
      datos = migrar(d);
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
    datos = estadoNuevo();
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
    if (!(await preguntar('¿Cerrar sesión? Los datos siguen en este celular y en la nube.', 'Cerrar sesión'))) return;
    await Nube.salir();
    render();
  };
}

function dialogoCuenta() {
  abrirModal(`
    <h2>Cuenta en la nube</h2>
    <label>Correo</label><input name="correo" type="email" autocomplete="email" required>
    <label>Contraseña <span class="suave">(mínimo 8 caracteres)</span></label>
    <input name="clave" type="password" autocomplete="current-password" minlength="8" required>
    <p class="suave">"Crear cuenta" solo la primera vez. Le llega un correo para confirmar.</p>
    <div class="botones acciones">
      <button value="cancelar" formnovalidate>Cancelar</button>
      <button value="crear">Crear cuenta</button>
      <button value="entrar" class="principal">Entrar</button>
    </div>
  `, (fd, boton) => {
    const correo = String(fd.get('correo')).trim();
    const clave = String(fd.get('clave'));
    const accion = boton && boton.value === 'crear' ? 'crear' : 'entrar';
    const botones = $$('#modal-form button');
    botones.forEach((b) => (b.disabled = true));
    (async () => {
      try {
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

function traducirError(e) {
  const m = String((e && (e.message || e.code)) || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar el correo: revise su bandeja de entrada';
  if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene cuenta: use "Entrar"';
  if (/Signups not allowed|signup.*disabled/i.test(m)) return 'No se permiten cuentas nuevas';
  if (/Password should be/i.test(m)) return 'La contraseña es muy corta o muy sencilla';
  if (/fetch|network/i.test(m)) return 'Sin conexión a internet';
  return 'No se pudo: ' + m;
}

/** Baja lo de la nube y, si cambió algo, lo muestra (sin interrumpir si está escribiendo). */
async function traerDeLaNube(forzarPintar = false) {
  if (!Nube.sesion) return;
  const remotos = await Nube.sincronizar(datos, async () =>
    (await preguntar('Hay datos en la nube y también en este celular. ¿Cuáles quiere usar? "Usar la nube" reemplaza lo de este celular; "Cancelar" sube lo de este celular a la nube.', 'Usar la nube')) ? 'nube' : 'celular');
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
  if (typeof Nube === 'undefined' || !Nube.disponible) return;
  Nube.onCambio(pintarEstadoNube);
  await Nube.iniciar();
  pintarEstadoNube();
  await traerDeLaNube(true);
}
window.addEventListener('online', () => { if (Nube.sesion && Nube.pendiente) Nube.subirAhora(datos); });

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
    if (!(await preguntar('Sin la clave no se puede entrar. La única salida es BORRAR TODO lo de este teléfono (después puede cargar una copia de seguridad). ¿Borrar todo?', 'Borrar todo'))) return;
    try { localStorage.removeItem(CLAVE_PIN); localStorage.removeItem(CLAVE); } catch (err) { /* nada */ }
    await Nube.salir(); // para volver a ver los datos de la nube hay que entrar con la cuenta
    datos = estadoNuevo();
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
