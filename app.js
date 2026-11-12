/* Pantallas de "La Alcancía". Todo se guarda en este teléfono (localStorage). */
const L = window.Logica;
const CLAVE = 'la-alcancia-v1';
const CLAVE_PIN = 'la-alcancia-clave';
const MINUTOS_BLOQUEO = 5;
const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
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

function cuandoVence(f) {
  const d = L.diasEntre(hoy(), f);
  if (d === 0) return 'vence HOY';
  if (d === 1) return 'vence mañana';
  if (d < 0) return `se venció hace ${-d} día${d === -1 ? '' : 's'}`;
  return `en ${d} días`;
}

const ETIQUETA = { cubierta: 'Lista ✔', 'al-dia': 'Al día', atrasada: 'Atrasada', 'vence-hoy': 'Vence hoy', vencida: 'Vencida', terminada: 'Terminada' };

/* Campos de plata: muestran puntos de miles mientras se escribe */
function campoPesos(nombre, valor = '', extra = '') {
  const v = valor ? Number(valor).toLocaleString('es-CO') : '';
  return `<input name="${nombre}" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${v ? '$ ' + v : ''}" data-pesos ${extra}>`;
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
  return { version: 1, configurado: false, descanso: [0], obligaciones: [], registros: [], pagos: [] };
}
function cargar() {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) return { ...estadoNuevo(), ...JSON.parse(t) };
  } catch (e) { /* sin almacenamiento: empieza vacío */ }
  return estadoNuevo();
}
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    avisar('No se pudo guardar en este teléfono');
  }
}

let datos = cargar();
let vista = 'hoy';

const activas = () => datos.obligaciones.filter((o) => o.activa !== false);
const buscar = (id) => datos.obligaciones.find((o) => o.id === id);

function crearObligacion(campos) {
  const f = hoy();
  const o = {
    id: nuevoId(), activa: true, apartado: 0, prioridad: 2, saldoTotal: null, inicio: f, ...campos,
  };
  o.proximo = L.primeraFecha(o, f);
  return o;
}

/** Lo que ya se apartó hoy para cada compromiso. */
function aportesDe(fecha) {
  const t = {};
  for (const r of datos.registros) {
    if (r.fecha !== fecha) continue;
    for (const [id, m] of Object.entries(r.reparto)) t[id] = (t[id] || 0) + m;
  }
  return t;
}

/** Para cada compromiso activo: cuota de hoy y cuánto falta apartar de ella. */
function cuentasDeHoy() {
  const f = hoy();
  const aportes = aportesDe(f);
  return activas().map((o) => {
    const ya = aportes[o.id] || 0;
    const alEmpezarElDia = { ...o, apartado: Math.max(0, o.apartado - ya) };
    const cuota = L.cuotaDelDia(alEmpezarElDia, f, datos.descanso);
    return {
      o, ya, cuota,
      pendiente: Math.max(0, cuota - ya),
      falta: Math.max(0, o.monto - o.apartado),
    };
  });
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

/* ---------- primera vez ---------- */
function filaPlantilla(p, i) {
  const cuando = p.tipo === 'semanal'
    ? `<label>Día de la semana</label><select name="dia-${i}">${DIAS.map((d, n) => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${d}</option>`).join('')}</select>`
    : `<label>Día de pago</label><input name="dia-${i}" inputmode="numeric" placeholder="1 a 31" maxlength="2">`;
  return `
    <div class="tarjeta">
      <input name="nombre-${i}" value="${esc(p.nombre)}" aria-label="Nombre" style="font-weight:700">
      ${p.ayuda ? `<p class="suave">${esc(p.ayuda)}</p>` : ''}
      <div class="fila">
        <div><label>${p.tipo === 'semanal' ? 'Valor semanal' : 'Valor'}</label>${campoPesos('monto-' + i)}</div>
        <div>${cuando}</div>
      </div>
      ${p.deuda ? `<label>Deuda total <span class="suave">(opcional)</span></label>${campoPesos('saldo-' + i)}` : ''}
      <input type="hidden" name="tipo-${i}" value="${p.tipo}"><input type="hidden" name="prio-${i}" value="${p.prioridad}">
    </div>`;
}

function selectorDescanso(nombre = 'descanso') {
  return `<div class="dias">${DIAS.map((d, n) =>
    `<label title="${d}"><input type="checkbox" name="${nombre}" value="${n}" ${datos.descanso.includes(n) ? 'checked' : ''}><span>${CORTOS[n]}</span></label>`).join('')}</div>`;
}

function pantallaInicio(c) {
  c.innerHTML = `
    <div class="tarjeta destacada">
      <p class="cifra-m">Hola 👋</p>
      <p>Esta app le dice, cada día que trabaja, <b>cuánto guardar</b> para que el día de pagar la plata ya esté lista.</p>
      <p class="suave">Llene solo lo que aplique. Lo que deje sin valor no se agrega. Todo se puede cambiar después.</p>
    </div>
    <form id="form-inicio">
      <h2>¿Qué días descansa?</h2>
      <p class="suave">Esos días no se cuentan para apartar.</p>
      ${selectorDescanso()}
      <h2>Lo que hay que pagar</h2>
      <div class="rejilla">${PLANTILLA.map(filaPlantilla).join('')}</div>
      <button type="submit" class="principal">Empezar</button>
    </form>`;

  $('#form-inicio').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    datos.descanso = fd.getAll('descanso').map(Number);
    const nuevas = [];
    const errores = [];
    PLANTILLA.forEach((p, i) => {
      const monto = num(fd.get('monto-' + i));
      if (!monto) return;
      const tipo = fd.get('tipo-' + i);
      const dia = Number(fd.get('dia-' + i));
      const nombre = String(fd.get('nombre-' + i)).trim() || p.nombre;
      if (tipo === 'mensual' && !(dia >= 1 && dia <= 31)) return errores.push(nombre);
      const saldo = num(fd.get('saldo-' + i));
      nuevas.push(crearObligacion({ nombre, tipo, dia, monto, prioridad: Number(fd.get('prio-' + i)), saldoTotal: saldo || null }));
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
function pantallaHoy(c) {
  const f = hoy();
  const cuentas = cuentasDeHoy();
  const pendiente = cuentas.reduce((s, x) => s + x.pendiente, 0);
  const registrosHoy = datos.registros.filter((r) => r.fecha === f);
  const apartadoHoy = registrosHoy.reduce((s, r) => s + r.apartado, 0);
  const proximos = [...activas()].sort((a, b) => (a.proximo < b.proximo ? -1 : 1)).slice(0, 4);
  const descansa = datos.descanso.includes(L.aFecha(f).getDay());

  c.innerHTML = `
    <div class="columnas"><div>
    <div class="tarjeta destacada">
      <p class="suave">${apartadoHoy ? 'Todavía le falta apartar hoy' : 'Hoy toca apartar'}</p>
      <p class="cifra">${pesos(pendiente)}</p>
      <p class="suave">${pendiente ? 'para que no falte cuando lleguen los pagos.' : apartadoHoy ? '¡Listo por hoy! 💪' : 'No hay nada pendiente hoy.'}</p>
      ${descansa ? '<p class="suave">Hoy es su día de descanso. Si trabajó, regístrelo igual.</p>' : ''}
    </div>

    <form id="form-dia" class="tarjeta">
      <h2 style="margin-top:0">¿Cómo le fue hoy?</h2>
      <label>¿Cuánto le entró hoy? <span class="suave">(InDrive + Uber, ya sin comisión)</span></label>
      ${campoPesos('ingreso')}
      <label>¿Cuánto gastó en gasolina o el carro hoy?</label>
      ${campoPesos('carro')}
      <div id="calculo"></div>
    </form>

    ${registrosHoy.length ? `
      <h2>Lo que ya registró hoy</h2>
      <div class="tarjeta"><ul class="lista">${registrosHoy.map((r) => `
        <li><span>Le entró ${pesos(r.ingreso)}, apartó <b>${pesos(r.apartado)}</b></span>
        <button class="chico" data-deshacer="${r.id}">Deshacer</button></li>`).join('')}</ul></div>` : ''}
    </div><div>
    <h2 class="primero">Lo que viene</h2>
    ${proximos.map((o) => tarjetaCorta(o, f)).join('') || '<p class="suave">No hay pagos. Agréguelos en "Pagos".</p>'}
    </div></div>
  `;

  const form = $('#form-dia');
  const calculo = $('#calculo');
  let apartarEditado = false;

  function actualizar() {
    const ingreso = num(form.ingreso.value);
    const carro = num(form.carro.value);
    const neto = Math.max(0, ingreso - carro);
    if (!ingreso) { calculo.innerHTML = ''; return; }
    const campo = $('[name=apartar]', calculo);
    let apartar = apartarEditado && campo ? num(campo.value) : Math.min(neto, pendiente);
    const items = cuentas.map((x) => ({ id: x.o.id, cuota: x.pendiente, falta: x.falta, proximo: x.o.proximo, prioridad: x.o.prioridad }));
    const r = L.repartir(items, apartar);
    apartar -= r.sobrante; // no se puede apartar más de lo que se debe
    const queda = neto - apartar;
    const html = `
      <p class="suave" style="margin-top:14px">Le quedó limpio: <b>${pesos(neto)}</b></p>
      <label>Aparte hoy</label>
      ${campoPesos('apartar', apartar)}
      ${Object.keys(r.reparto).length ? `<ul class="lista">${Object.entries(r.reparto).map(([id, m]) =>
        `<li><span>${esc(buscar(id).nombre)}</span><span class="monto">${pesos(m)}</span></li>`).join('')}</ul>` : ''}
      ${r.sinCubrir ? `<div class="alerta ambar">Hoy no alcanzó para todo: faltaron ${pesos(r.sinCubrir)}. No pasa nada, se reparten solos en los próximos días.</div>` : ''}
      ${queda < 0 ? `<div class="alerta ambar">Está apartando más de lo que le quedó hoy.</div>` : ''}
      <div class="alerta verde">Para la casa y el día a día le quedan: ${pesos(Math.max(0, queda))}</div>
      <p class="suave">👉 Pase los ${pesos(apartar)} al bolsillo de ahorro (Nequi / Daviplata) hoy mismo. Si se queda en la billetera, se gasta.</p>
      <button type="button" class="principal" id="btn-registrar" ${apartar <= 0 && !ingreso ? 'disabled' : ''}>Ya lo aparté ✔</button>`;
    // conservar el foco si está escribiendo en "Aparte hoy"
    const enfocado = document.activeElement && document.activeElement.name === 'apartar';
    calculo.innerHTML = html;
    if (enfocado) {
      const nuevo = $('[name=apartar]', calculo);
      nuevo.focus();
      nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length);
    }
    $('#btn-registrar').onclick = () => registrar({ ingreso, carro, apartado: apartar, reparto: r.reparto });
  }

  form.addEventListener('input', (e) => {
    if (e.target.name === 'apartar') apartarEditado = true;
    else if (e.target.name === 'ingreso' || e.target.name === 'carro') apartarEditado = false;
    actualizar();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  $$('[data-deshacer]', c).forEach((b) => (b.onclick = () => deshacer(b.dataset.deshacer)));
  activarBotonesTarjetas(c);
}

function registrar({ ingreso, carro, apartado, reparto }) {
  for (const [id, m] of Object.entries(reparto)) buscar(id).apartado += m;
  datos.registros.push({ id: nuevoId(), fecha: hoy(), ingreso, carro, apartado, reparto });
  guardar();
  avisar(apartado ? `Bien hecho: ${pesos(apartado)} apartados` : 'Día registrado');
  render();
}

function deshacer(id) {
  const r = datos.registros.find((x) => x.id === id);
  if (!r) return;
  for (const [oid, m] of Object.entries(r.reparto)) {
    const o = buscar(oid);
    if (o) o.apartado = Math.max(0, o.apartado - m);
  }
  datos.registros = datos.registros.filter((x) => x.id !== id);
  guardar();
  avisar('Registro borrado');
  render();
}

/* ---------- PAGOS (compromisos) ---------- */
function tarjetaCorta(o, f) {
  const est = L.estado(o, f);
  const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
  return `
    <div class="tarjeta">
      <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
      <p class="suave">${fechaCorta(o.proximo)} · ${cuandoVence(o.proximo)}</p>
      <div class="barra-progreso"><div style="width:${pct}%"></div></div>
      <p><b>${pesos(o.apartado)}</b> de ${pesos(o.monto)}</p>
      ${est === 'vence-hoy' || est === 'vencida' || est === 'cubierta'
        ? `<div class="botones"><button class="chico" data-pagar="${o.id}">Ya pagué</button></div>` : ''}
    </div>`;
}

function pantallaPagos(c) {
  const f = hoy();
  const cuentas = cuentasDeHoy();
  const lista = [...cuentas].sort((a, b) => (a.o.proximo < b.o.proximo ? -1 : 1));
  const terminadas = datos.obligaciones.filter((o) => o.activa === false);
  const totalApartado = activas().reduce((s, o) => s + o.apartado, 0);

  c.innerHTML = `
    <div class="tarjeta">
      <p class="suave">Plata apartada en total (debería estar en su bolsillo de ahorro)</p>
      <p class="cifra-m">${pesos(totalApartado)}</p>
    </div>
    <button class="principal" id="btn-nuevo">+ Agregar un pago</button>
    <div class="rejilla">${lista.map(({ o, cuota }) => {
      const est = L.estado(o, f);
      const pct = Math.min(100, Math.round((o.apartado / (o.monto || 1)) * 100));
      const cada = o.tipo === 'mensual' ? `cada mes el ${o.dia}` : o.tipo === 'semanal' ? `cada ${DIAS[o.dia]}` : 'una sola vez';
      return `
      <div class="tarjeta">
        <div class="cabeza"><h3>${esc(o.nombre)}</h3><span class="chip ${est}">${ETIQUETA[est]}</span></div>
        <p class="suave">${pesos(o.monto)} · ${cada}</p>
        <p>Próximo pago: <b>${fechaCorta(o.proximo)}</b> (${cuandoVence(o.proximo)})</p>
        <div class="barra-progreso"><div style="width:${pct}%"></div></div>
        <p><b>${pesos(o.apartado)}</b> apartados de ${pesos(o.monto)}${cuota ? ` · hoy: ${pesos(cuota)}` : ''}</p>
        ${o.saldoTotal != null ? `<p class="suave">Deuda total que queda: <b>${pesos(o.saldoTotal)}</b></p>` : ''}
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
  activarBotonesTarjetas(c);
}

function activarBotonesTarjetas(c) {
  $$('[data-pagar]', c).forEach((b) => (b.onclick = () => dialogoPagar(b.dataset.pagar)));
  $$('[data-editar]', c).forEach((b) => (b.onclick = () => editar(b.dataset.editar)));
}

function abrirModal(html, alEnviar) {
  const modal = $('#modal');
  const form = $('#modal-form');
  form.innerHTML = html;
  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === 'cancelar') return;
    e.preventDefault();
    if (alEnviar(new FormData(form), e.submitter) !== false) modal.close();
  };
  modal.showModal();
}

function dialogoPagar(id) {
  const o = buscar(id);
  abrirModal(`
    <h2>Pagar: ${esc(o.nombre)}</h2>
    <p class="suave">Tiene apartados ${pesos(o.apartado)}.</p>
    <label>¿Cuánto pagó?</label>
    ${campoPesos('pagado', o.monto)}
    <p class="suave">Si es el fondo del carro y no lo usó, ponga $0: la plata sigue guardada y pasa al otro mes.</p>
    <div class="botones acciones"><button value="cancelar" formnovalidate>Cancelar</button><button class="principal" style="margin:0;flex:1">Pagado</button></div>
  `, (fd) => {
    const pagado = num(fd.get('pagado'));
    const antes = o.apartado;
    Object.assign(o, L.pagar(o, pagado));
    datos.pagos.push({ id: nuevoId(), fecha: hoy(), obligacionId: o.id, nombre: o.nombre, monto: pagado });
    guardar();
    avisar(pagado > antes ? `Pagado. ${pesos(pagado - antes)} salieron de otro lado.` : 'Pagado ✔');
    render();
  });
}

function editar(id) {
  const o = id ? buscar(id) : { nombre: '', tipo: 'mensual', dia: '', monto: '', prioridad: 2, saldoTotal: null, apartado: 0 };
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
    <label>¿Cuánto es?</label>${campoPesos('monto', o.monto)}
    <label>Deuda total <span class="suave">(opcional; se va bajando con cada pago)</span></label>${campoPesos('saldo', o.saldoTotal)}
    <label>¿Qué tan grave es no pagarlo a tiempo?</label>
    <select name="prioridad">
      <option value="1" ${o.prioridad === 1 ? 'selected' : ''}>Muy grave (cortan el servicio, intereses)</option>
      <option value="2" ${o.prioridad === 2 ? 'selected' : ''}>Normal</option>
      <option value="3" ${o.prioridad === 3 ? 'selected' : ''}>Puede esperar</option>
    </select>
    ${id ? `<label>Plata ya apartada para esto</label>${campoPesos('apartado', o.apartado)}` : ''}
    <div class="botones acciones">
      <button value="cancelar" formnovalidate>Cancelar</button>
      ${id ? '<button value="borrar" class="peligro" formnovalidate>Borrar</button>' : ''}
      <button value="guardar" class="principal" style="margin:0;flex:1">Guardar</button>
    </div>
  `, (fd, boton) => {
    if (boton && boton.value === 'borrar') {
      if (!confirm(`¿Borrar "${o.nombre}"? Se pierde lo apartado registrado.`)) return false;
      datos.obligaciones = datos.obligaciones.filter((x) => x.id !== id);
      guardar(); render(); return;
    }
    const tipo = fd.get('tipo');
    const campos = {
      nombre: String(fd.get('nombre')).trim(),
      tipo,
      monto: num(fd.get('monto')),
      prioridad: Number(fd.get('prioridad')),
      saldoTotal: num(fd.get('saldo')) || null,
    };
    if (tipo === 'unica') campos.fecha = fd.get('fecha');
    else campos.dia = Number(fd.get('dia'));
    if (!campos.monto) { avisar('Falta cuánto es'); return false; }
    if (tipo === 'mensual' && !(campos.dia >= 1 && campos.dia <= 31)) { avisar('El día del mes va de 1 a 31'); return false; }
    if (tipo === 'unica' && !campos.fecha) { avisar('Falta la fecha'); return false; }

    if (!id) {
      datos.obligaciones.push(crearObligacion(campos));
    } else {
      const cambioFecha = tipo !== o.tipo || campos.dia !== o.dia || campos.fecha !== o.fecha;
      const estabaTerminada = o.activa === false;
      Object.assign(o, campos, { apartado: num(fd.get('apartado')), activa: true });
      if (cambioFecha || estabaTerminada) { o.proximo = L.primeraFecha(o, hoy()); o.inicio = hoy(); }
    }
    guardar(); render();
  });

  const form = $('#modal-form');
  const pintarCuando = () => {
    const t = form.tipo.value;
    $('#cuando').innerHTML = t === 'mensual'
      ? `<label>¿Qué día del mes?</label><input name="dia" inputmode="numeric" maxlength="2" value="${o.tipo === 'mensual' ? o.dia : ''}" placeholder="Ej: 15">`
      : t === 'semanal'
        ? `<label>¿Qué día de la semana?</label><select name="dia">${DIAS.map((d, n) => `<option value="${n}" ${o.tipo === 'semanal' && o.dia === n ? 'selected' : ''}>${d}</option>`).join('')}</select>`
        : `<label>¿Qué fecha?</label><input type="date" name="fecha" value="${o.fecha || ''}" min="${hoy()}">`;
  };
  form.tipo.onchange = pintarCuando;
  pintarCuando();
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

  const movimientos = [
    ...datos.registros.map((r) => ({ fecha: r.fecha, txt: `Le entró ${pesos(r.ingreso)}${r.carro ? `, carro ${pesos(r.carro)}` : ''}`, monto: `+${pesos(r.apartado)}` })),
    ...datos.pagos.map((p) => ({ fecha: p.fecha, txt: `Pagó ${esc(p.nombre)}`, monto: `−${pesos(p.monto)}` })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 60);

  c.innerHTML = `
    <h2>Últimos 7 días</h2>
    <div class="tarjeta"><ul class="lista">
      <li><span>Días trabajados</span><span class="monto">${new Set(semana.map((r) => r.fecha)).size}</span></li>
      <li><span>Le quedó limpio</span><span class="monto">${pesos(neto(semana))}</span></li>
      <li><span>Apartó</span><span class="monto">${pesos(suma(semana, 'apartado'))}</span></li>
    </ul></div>
    <h2>Este mes</h2>
    <div class="tarjeta"><ul class="lista">
      <li><span>Le entró</span><span class="monto">${pesos(suma(delMes, 'ingreso'))}</span></li>
      <li><span>Gasolina y carro</span><span class="monto">${pesos(suma(delMes, 'carro'))}</span></li>
      <li><span>Apartó</span><span class="monto">${pesos(suma(delMes, 'apartado'))}</span></li>
      <li><span>Pagó</span><span class="monto">${pesos(suma(datos.pagos.filter((p) => p.fecha.startsWith(mes)), 'monto'))}</span></li>
    </ul></div>
    <h2>Movimientos</h2>
    <div class="tarjeta">${movimientos.length ? `<ul class="lista">${movimientos.map((m) =>
      `<li><span><span class="suave">${fechaCorta(m.fecha)}</span><br>${m.txt}</span><span class="monto">${m.monto}</span></li>`).join('')}</ul>`
      : '<p class="suave">Todavía no hay movimientos.</p>'}</div>`;
}

/* ---------- AJUSTES ---------- */
function pantallaAjustes(c) {
  c.innerHTML = `
    <h2>Días de descanso</h2>
    <div class="tarjeta">${selectorDescanso()}</div>
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
    </div>`;

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
    $('#btn-quitar-clave').onclick = () => {
      if (!confirm('¿Quitar la clave?')) return;
      try { localStorage.removeItem(CLAVE_PIN); } catch (e) { /* nada */ }
      avisar('Clave quitada');
      render();
    };
  }

  $$('[name=descanso]', c).forEach((ch) => (ch.onchange = () => {
    datos.descanso = $$('[name=descanso]:checked', c).map((x) => Number(x.value));
    guardar();
    avisar('Guardado');
  }));

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
      if (!confirm('Esto reemplaza lo que hay en este teléfono por la copia. ¿Seguir?')) return;
      datos = { ...estadoNuevo(), ...d };
      guardar();
      avisar('Copia cargada');
      ir('hoy');
    } catch (err) {
      avisar('Ese archivo no es una copia válida');
    }
  };
  $('#btn-borrar').onclick = () => {
    if (!confirm('¿Seguro? Se borra todo lo registrado en este teléfono.')) return;
    datos = estadoNuevo();
    guardar();
    ir('hoy');
  };
}

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
  $('#olvide').onclick = (e) => {
    e.preventDefault();
    if (!confirm('Sin la clave no se puede entrar. La única salida es BORRAR TODO lo de este teléfono (después puede cargar una copia de seguridad). ¿Borrar todo?')) return;
    try { localStorage.removeItem(CLAVE_PIN); localStorage.removeItem(CLAVE); } catch (err) { /* nada */ }
    datos = estadoNuevo();
    bloqueada = false;
    render();
  };
}

/* Mientras se escribe (teclado abierto) se esconde la barra de abajo */
const esCampo = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=file]), select');
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
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
