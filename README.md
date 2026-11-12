# La Alcancía

App sencilla para el celular que responde una sola pregunta cada día:
**"Hoy me entró esto. ¿Cuánto guardo para que no me falte cuando llegue cada pago?"**

Está pensada para ingresos diarios e irregulares (InDrive / Uber) y para pagos que llegan de golpe
(tarjeta, recibos, colegio, mercado).

## Cómo funciona

- Cada pago tiene un valor, una fecha (cada mes, cada semana o una sola vez) y lo que ya se ha apartado.
- **Cuota del día** = lo que falta ÷ los días que *probablemente* se trabajen antes de la meta.
  - Se configura cuántos días se trabaja a la semana, más o menos (los días varían; un imprevisto no rompe nada).
  - **Margen:** la meta es tener la plata lista X días *antes* del pago, como colchón.
  - Si un día no se trabaja, no se registra nada: lo que faltó se reparte solo en los días siguientes.
- Al registrar el día (lo que entró − gasolina/carro), la app propone cuánto apartar y lo reparte:
  primero lo que vence antes y, si hay empate, lo más grave.
- Si no alcanza, lo dice claramente ("faltaron $X") y lo reparte en los días siguientes.
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
