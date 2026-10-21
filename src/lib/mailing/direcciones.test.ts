import { describe, expect, it } from "vitest";
import { emailValido, motivoEmailInvalido, normalizarEmail } from "./direcciones";

describe("normalizarEmail", () => {
  it("quita espacios al borde (NBSP y tabs incluidos) y pasa a minúsculas, sin tocar los internos", () => {
    expect(normalizarEmail("  Juan.Perez@Gmail.COM ")).toBe("juan.perez@gmail.com");
    expect(normalizarEmail("\u00a0ana@gmail.com\t")).toBe("ana@gmail.com");
    expect(normalizarEmail("juan perez@gmail.com")).toBe("juan perez@gmail.com");
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

  // "juan perez@" puede ser juan.perez@ o juan_perez@: adivinar le manda el
  // correo a otra persona, así que no se manda.
  it("una dirección con espacios internos sigue sin mandarse después de normalizar", () => {
    expect(motivoEmailInvalido(normalizarEmail("Juan Perez@gmail.com"))).toContain("espacios");
    expect(motivoEmailInvalido(normalizarEmail("ana@gmail. com"))).toContain("espacios");
  });
});
