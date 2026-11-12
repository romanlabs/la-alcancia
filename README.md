# La Alcancía

App sencilla para el celular que responde una sola pregunta cada día:
**"Hoy me entró esto. ¿Cuánto guardo para que no me falte cuando llegue cada pago?"**

Está pensada para ingresos diarios e irregulares (InDrive / Uber) y para pagos que llegan de golpe
(tarjeta, recibos, colegio, mercado).

## Cómo funciona

- Cada pago tiene un valor, una fecha (cada mes, cada semana o una sola vez) y lo que ya se ha apartado.
- **Cuota diaria fija** (por defecto $40.000, editable; en $0 la calcula la app).
  Lo de cada día se reparte entre **todas** las cuentas: a cada una según lo que le falta ÷ los días de trabajo
  que quedan para pagarla. Si no alcanza, primero la prioridad alta y, dentro de ella, en proporción a lo que
  necesita cada una. La app muestra por qué le toca eso a cada cuenta. Si todo está cubierto, va a *ahorro extra*.
- **Ahorro:** metas (p. ej. "Fondo de emergencias" y "Para invertir"). Un porcentaje de lo de cada día va
  primero a ahorro y lo que sobre de las cuentas también; se reparte entre las metas según su porcentaje.
- **Cajitas del banco (Nu):** cada cuenta y meta dice en qué cajita se guarda; cada día la app dice cuánto
  mover a cada una, y el "Cuadre" muestra cuánto debería haber en cada cajita.
- "Ya pagué el de este mes": para recibos que ya se pagaron por fuera; el próximo pasa al mes siguiente.
- **Proyección (próximos 31 días):** simulando el mismo reparto día a día con esa cuota, los días que se trabajan por semana y el margen
  (tener la plata X días antes del pago), dice qué pagos no alcanzan, cuánto faltaría y qué cuota
  diaria cubriría todo a tiempo. También muestra lo que necesita un mes normal, sin atrasos.
- Un día que no se trabaja no se registra; la proyección se ajusta sola.
- Fuentes de ingreso configurables (InDrive, Uber…), gasolina y otros gastos por separado, y nota por día.
- Todo se puede corregir: editar o borrar cualquier día, deshacer el último pago de cada compromiso,
  cambiar la próxima fecha de pago, mover el ahorro extra a un pago.
- Al pagar, lo apartado se descuenta y el pago pasa solo a la fecha siguiente.
- **Deuda total** (opcional): para la tarjeta o el colegio. Baja con cada pago; cuando llega a cero, el pago queda terminado
  (la última cuota se ajusta sola).
- Estados: *Al día* / *Atrasada* (lleva menos de lo que debería si apartara parejo) / *Vence hoy* / *Vencida* / *Lista*.

La app **no mueve plata**. Lo apartado tiene que pasarse de verdad a un bolsillo aparte
(Nequi "Bolsillos", Daviplata, una cuenta de ahorros). Si se queda en la billetera, se gasta.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `estilos.css`, `app.js` | Las pantallas |
| `logica.js` | Los cálculos (fechas, cuotas, reparto, pagos), sin pantalla |
| `nube.js` | Sincronización con Supabase (PostgreSQL) |
| `supabase/*.sql` | Tablas y seguridad (RLS), en orden: 01, 02, 03 |
| `pruebas/logica.test.js` | Pruebas de los cálculos |
| `sw.js`, `manifest.webmanifest`, `icono.svg` | Para instalarla en el celular y que abra sin internet |

Sin dependencias ni compilación. Los datos se guardan **solo en el teléfono** (`localStorage`);
en *Ajustes → Descargar copia* se saca una copia en JSON.

## Probar

```bash
npm test          # pruebas de los cálculos
npm start         # sirve la app en http://localhost:5173
```

## Ponerla en el celular

Hay que publicarla en una dirección https (por ejemplo GitHub Pages o Netlify: son archivos estáticos, se suben tal cual).
Luego, en el celular: abrir el enlace en Chrome → menú ⋮ → **Agregar a la pantalla principal**.

Al publicar cambios, sube `VERSION` en `sw.js`.
