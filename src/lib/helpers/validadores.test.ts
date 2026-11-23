import { describe, expect, it } from "vitest";
import { formatoPatente } from "./validadores";

describe("formatoPatente", () => {
  it("separa la patente como va en la placa", () => {
    expect(formatoPatente("ABCD12")).toBe("AB·CD·12");
    expect(formatoPatente("ab1234")).toBe("AB·12·34");
    expect(formatoPatente("ab-cd-12")).toBe("AB·CD·12");
  });

  it("lo que no es una patente válida queda tal cual", () => {
    expect(formatoPatente("Sin auto")).toBe("Sin auto");
    expect(formatoPatente("ABC12")).toBe("ABC12");
    expect(formatoPatente(null)).toBe("");
  });
});
