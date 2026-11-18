import { afterEach, describe, expect, it } from "vitest";
import { codigoFijoRevision, esCuentaRevision } from "./cuentaRevision";

describe("cuenta de revisión de las tiendas", () => {
  const original = process.env.CODIGO_REVISION_TIENDAS;
  afterEach(() => {
    if (original === undefined) delete process.env.CODIGO_REVISION_TIENDAS;
    else process.env.CODIGO_REVISION_TIENDAS = original;
  });

  it("da el código fijo solo al correo de revisión", () => {
    process.env.CODIGO_REVISION_TIENDAS = "482913";
    expect(codigoFijoRevision("Revision@ZPlash.cl ")).toBe("482913");
    expect(codigoFijoRevision("cliente@zplash.cl")).toBeNull();
    expect(codigoFijoRevision("revision@zplash.cl.evil.com")).toBeNull();
  });

  it("sin variable o con un valor que no son 6 dígitos, no hay código fijo", () => {
    delete process.env.CODIGO_REVISION_TIENDAS;
    expect(codigoFijoRevision("revision@zplash.cl")).toBeNull();
    process.env.CODIGO_REVISION_TIENDAS = "12345";
    expect(codigoFijoRevision("revision@zplash.cl")).toBeNull();
    process.env.CODIGO_REVISION_TIENDAS = "abcdef";
    expect(codigoFijoRevision("revision@zplash.cl")).toBeNull();
  });

  it("reconoce el correo de revisión sin importar mayúsculas", () => {
    expect(esCuentaRevision("REVISION@zplash.cl")).toBe(true);
    expect(esCuentaRevision("otro@zplash.cl")).toBe(false);
  });
});
