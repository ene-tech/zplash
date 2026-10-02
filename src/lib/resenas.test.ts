import { describe, expect, it } from "vitest";
import { parsearAviso } from "./resenas";

// Cuerpos de texto reales de avisos de Google (oct-2026), links acortados.
const CON_TEXTO = ` <https://business.google.com/n/1/reviews/A?fid=2>
Felicitaciones, tienes una nueva opinión de  5 estrellas
Leer la opinión <https://business.google.com/n/1/reviews/A?fid=2&trk=x>
agustin peñailillo
(Translated by Google) The best place in Temuco to wash your car
(Original)
Lo mejor de temuco para...
Responder la opinión <https://business.google.com/n/1/reviews/A?fid=2&trk=y>
Responder las opiniones te permite demostrar a los clientes que valoras sus comentarios.`;

const SOLO_ESTRELLAS = `Felicitaciones, tienes una nueva opinión de  4 estrellas
Leer la opinión <https://business.google.com/n/1/reviews/B>
Marcos Hernandez
Este usuario solo dejó una calificación
Responder la opinión <https://business.google.com/n/1/reviews/B?r=1>`;

describe("parsearAviso", () => {
  it("toma el original, no la traducción de Google", () => {
    expect(parsearAviso("agustin dejó una opinión sobre Zplash AutoLavado", CON_TEXTO)).toEqual({
      autor: "agustin",
      estrellas: 5,
      texto: "Lo mejor de temuco para...",
      linkResponder: "https://business.google.com/n/1/reviews/A?fid=2&trk=y",
    });
  });

  it("reseña sin texto", () => {
    const r = parsearAviso("Marcos dejó una opinión sobre Zplash AutoLavado", SOLO_ESTRELLAS);
    expect(r).toMatchObject({ autor: "Marcos", estrellas: 4, texto: "" });
    expect(r.linkResponder).toBe("https://business.google.com/n/1/reviews/B?r=1");
  });
});
