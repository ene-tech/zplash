// Recorta el grid 2x2 (S/M/L/XL) de scripts/assets/Tamaño-vehiculos.png en 4
// PNG individuales para public/ (usados por TAMANO_IMAGEN en
// src/types/precios.ts, selector de tamaño de DetailingTab). One-off: solo
// hace falta correrlo de nuevo si se reemplaza la imagen fuente.
//
// Uso: node scripts/recortar-tamanos-vehiculo.js
const sharp = require("sharp");

const SRC = "scripts/assets/Tamaño-vehiculos.png";
const W = 1254,
  H = 1254;
const half = 627;
// Margen extra hacia el centro para no cortar el borde de la tarjeta si el
// grid no está perfectamente centrado a la mitad — 24px invadía la esquina
// redondeada de la tarjeta vecina y trim() se frenaba ahí, dejando una franja
// negra sin recortar; 6px alcanza para el margen de error sin ese problema.
const pad = 6;

const quads = {
  s: { left: 0, top: 0, width: half + pad, height: half + pad },
  m: { left: half - pad, top: 0, width: W - (half - pad), height: half + pad },
  l: { left: 0, top: half - pad, width: half + pad, height: H - (half - pad) },
  xl: { left: half - pad, top: half - pad, width: W - (half - pad), height: H - (half - pad) },
};

(async () => {
  for (const [key, box] of Object.entries(quads)) {
    const out = `public/tamano-${key}.png`;
    // extract().trim() encadenados en un mismo pipeline de sharp/libvips
    // fallaba con "bad extract area" para recortes con left/top != 0 — se
    // separa en dos pasos (extract a buffer, trim en una instancia nueva).
    const cropped = await sharp(SRC).extract(box).png().toBuffer();
    await sharp(cropped).trim({ background: "#000000", threshold: 60 }).toFile(out);
    const meta = await sharp(out).metadata();
    console.log(key, "->", out, meta.width + "x" + meta.height);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
