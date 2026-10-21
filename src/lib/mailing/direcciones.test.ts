import { describe, expect, it } from "vitest";
import { emailValido, motivoEmailInvalido, normalizarEmail } from "./direcciones";

describe("normalizarEmail", () => {
  it("quita espacios al borde, internos y NBSP, y pasa a minúsculas", () => {
    expect(normalizarEmail("  Juan.Perez@Gmail.COM ")).toBe("juan.perez@gmail.com");
    expect(normalizarEmail("juan perez@gmail.com")).toBe("juanperez@gmail.com");
    expect(normalizarEmail("ana@gmail. com\t")).toBe("ana@gmail.com");
  });

  it("null/undefined -> vacío", () => {
    expect(normalizarEmail(null)).toBe("");
    expect(normalizarEmail(undefined)).toBe("");
  });
});

describe("emailValido / motivoEmailInvalido", () => {
  it.each(["juan@gmail.com", "juan.perez+zplash@empresa.cl", "a_b-c@sub.dominio.co", "x@xn--80ak6aa92e.xn--p1ai", "o'brien@mail.com"])(
    "acepta %s",
    (email) => {
      expect(motivoEmailInvalido(email)).toBeNull();
      expect(emailValido(email)).toBe(true);
    }
  );

  it.each([
    ["", "vacía"],
    ["juangmail.com", "falta la @"],
    ["juan@@gmail.com", "más de una @"],
    ["@gmail.com", "antes de la @"],
    ["juan@", "falta el dominio"],
    ["cardenas.matias.nuños@gmail.com", "tildes"],
    ["israelgutiérrezf1982@gmail.com", "tildes"],
    ["juan@gmáil.com", "tildes"],
    [".juan@gmail.com", "punto"],
    ["cliente.@gmail.com", "punto"],
    ["juan..perez@gmail.com", "punto"],
    ["juan@gmail", "no tiene punto"],
    ["juan@gmail.com.", "punto"],
    ["juan@.gmail.com", "punto"],
    ["juan@gmail..com", "punto"],
    ["juan(perez)@gmail.com", "caracteres no permitidos"],
    ["juan@gm_ail.com", "caracteres no permitidos en el dominio"],
    ["juan@-gmail.com", "caracteres no permitidos en el dominio"],
    ["juan@gmail.c", "no es válido"],
    ["juan@gmail.123", "no es válido"],
  ])("rechaza %j (%s)", (email, fragmento) => {
    expect(emailValido(email)).toBe(false);
    expect(motivoEmailInvalido(email)).toContain(fragmento);
  });

  it("una dirección con espacios internos queda válida después de normalizar", () => {
    expect(emailValido("Juan Perez@gmail.com")).toBe(false);
    expect(emailValido(normalizarEmail("Juan Perez@gmail.com"))).toBe(true);
  });
});
