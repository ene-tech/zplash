# Zplash — guía de marca para Figma

Extraído de `MANUAL Zplash CAR WASH OK.pdf` (2024) y contrastado contra el CSS actual de la app
(`src/app/globals.css`). Los colores y la tipografía **ya coinciden** con el manual — no hace
falta cambiarlos, solo formalizarlos como estilos en Figma.

## Colores de marca

| Nombre | Hex | Pantone / CMYK | Uso |
|---|---|---|---|
| Gold | `#FFC72C` | Pantone 123 C · CMYK 0/87/25/0 | Acento primario, la "Z" del logo |
| Black | `#2D2926` | Pantone Black C · CMYK 0/0/0/100 | Base del logo, fondos oscuros |
| White | `#F5F5F0` | — | Texto sobre fondo oscuro |
| Silver | `#C9C6BA` | — | Versión escala de grises del logo |

El resto de los colores del CSS (`--bg`, `--bg-panel`, `--bg-card`, `--border`, `--red`, `--green`)
son extensiones de UI (fondos, estados) construidas sobre el negro/dorado de marca — no vienen del
manual pero son coherentes con él. Ver `design/figma-tokens.json` para la lista completa.

**Uso incorrecto** (según manual, pág. 11): no usar colores ajenos a esta paleta como fondo del
logotipo (evitar verde, azul, celeste, rojo detrás del isotipo).

## Tipografía

Familia corporativa: **Helvetica Neue**, pesos Regular (400) y Bold (700). Ya es la fuente en uso
en toda la app (`font-family: "Helvetica Neue", Helvetica, Arial, sans-serif`).

> Nota aparte (no es del manual): el CSS actual tiene una escala tipográfica bastante ad-hoc —
> tamaños como 11, 12, 12.5, 13, 13.5, 14, 14.5, 17, 20, 22, 26, 28, 30, 34, 64px conviven sin un
> sistema claro. Si en algún momento quieren consolidar esto en una escala (ej. 12/14/16/20/24/32),
> es un buen candidato para un pase de limpieza aparte — no lo toqué acá porque no era el pedido.

## Logotipo

- **Versiones cromáticas válidas**: negro sobre blanco, blanco sobre negro, negro sobre dorado,
  negro sobre gris. (manual pág. 10)
- **Área de seguridad**: margen mínimo alrededor del logo equivalente a 1cm proporcional al
  tamaño del logo (aprox. a la altura de la barra superior de la "Z"). En pantalla, tratarlo como
  un padding mínimo del ~15% del ancho del logo.
- **Tamaño mínimo**: 3cm de ancho en impreso ≈ no bajar de ~90-100px de ancho en pantalla para que
  el texto "CAR WASH" siga siendo legible.
- **No usar**: colores ajenos a la paleta de marca como fondo, ni combinaciones que resten
  contraste.

Asset ya disponible en el repo: [public/logo.jpg](../public/logo.jpg).

## Imaginería / fotografía

El manual usa dos tipos de imagen recurrentes que sirven como textura/fondo:

1. **Auto negro en estudio, primer plano de faros/llantas** — fondo oscuro, alto contraste,
   sensación premium/detailing. Buena como hero/background en secciones de marketing o splash.
2. **Gotas de agua sobre superficie dorada** — textura macro, refuerza "lavado" + el color gold de
   marca. Buena como fondo sutil (con overlay oscuro) detrás de paneles o como textura de fondo en
   estados vacíos/loading.

Las dos imágenes que pasaste en el chat no las pude guardar automáticamente (no tengo forma de
extraer el archivo binario de un adjunto pegado en la conversación) — guardalas vos en
`public/brand/` (ej. `public/brand/hero-auto.jpg` y `public/brand/textura-gotas.jpg`) y aviname
para conectarlas en el CSS.

## Cómo pasar esto a Figma

La API de Figma es de solo lectura para contenido de diseño — no puedo crear frames/estilos
directamente en tu archivo. La forma más rápida de que esto quede armado en Figma:

1. Instalá el plugin gratuito **Tokens Studio for Figma** (Community).
2. Abrí tu archivo de Figma → plugin → **Import** → seleccioná `design/figma-tokens.json`.
3. Le das "Create Styles" (o "Sync to Variables") y te crea automáticamente los estilos de color
   y tipografía en el archivo. Un par de clicks, sin tipear nada a mano.
4. El resto (reglas de área de seguridad, tamaño mínimo, uso incorrecto) quedan en este documento
   como referencia — pegalas como texto en una página "Guía" del archivo si querés tenerlas ahí.
