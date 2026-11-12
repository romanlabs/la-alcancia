# La Alcancía

App sencilla para el celular que responde una sola pregunta cada día:
**"Hoy me entró esto. ¿Cuánto guardo para que no me falte cuando llegue cada pago?"**

Está pensada para ingresos diarios e irregulares (InDrive / Uber) y para pagos que llegan de golpe
(tarjeta, recibos, colegio, mercado).

## Cómo funciona

- Cada pago tiene un valor, una fecha (cada mes, cada semana o una sola vez) y lo que ya se ha apartado.
- **Cuota diaria fija** (por defecto $40.000, editable; en $0 la calcula la app).
  Lo apartado se reparte entre los pagos: primero lo que vence antes; si todo está cubierto, va a *ahorro extra*.
- **Proyección (próximos 31 días):** con esa cuota, los días que se trabajan por semana y el margen
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
