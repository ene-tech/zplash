import { describe, expect, it } from "vitest";
import { conOrigen, linksConOrigen, posicionesVariableEnLink, sufijoOrigen } from "./utm";

const wa = { source: "whatsapp", medium: "bot" };

describe("conOrigen", () => {
  it("agrega ? o & según el link ya tenga parámetros", () => {
    expect(conOrigen("https://zplash.cl/servicios/plan-mensual", wa)).toBe(
      "https://zplash.cl/servicios/plan-mensual?utm_source=whatsapp&utm_medium=bot"
    );
    expect(conOrigen("https://zplash.cl/pagar?item=plan&patente=ABCD12", { ...wa, campaign: "x5" })).toBe(
      "https://zplash.cl/pagar?item=plan&patente=ABCD12&utm_source=whatsapp&utm_medium=bot&utm_campaign=x5"
    );
  });

  it("deja la puntuación final y el ancla en su lugar", () => {
    expect(conOrigen("https://zplash.cl/#lavados.", wa)).toBe("https://zplash.cl/?utm_source=whatsapp&utm_medium=bot#lavados.");
  });

  it("no toca links ya marcados, la baja de SMS ni otros dominios", () => {
    const marcado = "https://zplash.cl/?utm_source=instagram";
    expect(conOrigen(marcado, wa)).toBe(marcado);
    expect(conOrigen("https://zplash.cl/b/836M7T", wa)).toBe("https://zplash.cl/b/836M7T");
    expect(conOrigen("https://admin.zplash.cl/", wa)).toBe("https://admin.zplash.cl/");
    expect(conOrigen("https://wa.me/?text=hola", wa)).toBe("https://wa.me/?text=hola");
  });
});

describe("linksConOrigen", () => {
  it("marca cada link a zplash.cl de un texto y respeta el resto", () => {
    const texto = "Renueve aquí: https://zplash.cl/pagar?item=plan&patente=AB12CD. O escriba a https://google.com";
    expect(linksConOrigen(texto, wa)).toBe(
      "Renueve aquí: https://zplash.cl/pagar?item=plan&patente=AB12CD&utm_source=whatsapp&utm_medium=bot. O escriba a https://google.com"
    );
  });

  it("no confunde otros dominios que empiezan igual ni re-marca un href con &amp;", () => {
    const texto = 'https://zplash.cl.otro.com/x y <a href="https://zplash.cl/x?a=1&amp;utm_source=campana">';
    expect(linksConOrigen(texto, wa)).toBe(texto);
    expect(linksConOrigen("Visítanos en https://zplash.cl.", wa)).toBe(
      "Visítanos en https://zplash.cl?utm_source=whatsapp&utm_medium=bot."
    );
  });

  it("marca los href de un correo", () => {
    expect(linksConOrigen('<a href="https://zplash.cl/cliente" style="x">', { source: "correo", medium: "email" })).toBe(
      '<a href="https://zplash.cl/cliente?utm_source=correo&utm_medium=email" style="x">'
    );
  });
});

describe("posicionesVariableEnLink", () => {
  it("encuentra la variable que cierra el link aunque se repita en el saludo", () => {
    const upgrade = "Hola {{nombre}}, tu {{patente}} por {{precio}}:\nhttps://zplash.cl/pagar?item=plan&patente={{patente}}\n\nChao";
    expect(posicionesVariableEnLink(upgrade, 4)).toEqual([3]);
    const referidos = "Regala {{a}} y gana {{a}}:\nhttps://zplash.cl/?ref={{patente}}\n";
    expect(posicionesVariableEnLink(referidos, 3)).toEqual([2]);
  });

  it("no marca nada si los placeholders no calzan con metaVariables", () => {
    expect(posicionesVariableEnLink("https://zplash.cl/?ref={{patente}}", 2)).toEqual([]);
  });

  it("ignora variables a mitad de link o fuera de zplash.cl", () => {
    expect(posicionesVariableEnLink("https://zplash.cl/pagar?patente={{p}}&item=plan", 1)).toEqual([]);
    expect(posicionesVariableEnLink("https://otro.cl/?ref={{p}}", 1)).toEqual([]);
  });

  it("el sufijo se pega directo al valor", () => {
    expect("ABCD12" + sufijoOrigen({ source: "whatsapp", medium: "plantilla", campaign: "lavado_unico_referidos" })).toBe(
      "ABCD12&utm_source=whatsapp&utm_medium=plantilla&utm_campaign=lavado_unico_referidos"
    );
  });
});
