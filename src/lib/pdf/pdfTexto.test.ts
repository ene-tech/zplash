import { describe, expect, it } from "vitest";
import { pdfTexto } from "./pdfTexto";

describe("pdfTexto", () => {
  const pdf = pdfTexto(
    [
      { texto: "Comprobante de devolución", negrita: true },
      { texto: "Monto devuelto", valor: "$19.990 — orden (oc-1)" },
      { texto: "palabra ".repeat(80) },
    ],
    "Título"
  );
  const txt = pdf.toString("latin1");

  it("empieza y termina como PDF", () => {
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("los offsets del xref apuntan a cada objeto", () => {
    const xref = Number(/startxref\n(\d+)/.exec(txt)![1]);
    expect(txt.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...txt.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(7);
    offsets.forEach((o, i) => expect(txt.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("escapa paréntesis y codifica tildes y raya en WinAnsi", () => {
    expect(txt).toContain("(Comprobante de devoluci\\363n)");
    expect(txt).toContain("\\227 orden \\(oc-1\\)");
  });

  it("el largo del stream coincide con su contenido", () => {
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(txt)!;
    expect(Buffer.byteLength(m[2], "latin1")).toBe(Number(m[1]));
  });
});
