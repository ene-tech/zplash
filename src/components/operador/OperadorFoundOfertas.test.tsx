import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Cliente, Cupon } from "@/types";
import OperadorFoundOfertas from "./OperadorFoundOfertas";

vi.mock("@/context/AppContext", () => ({ useAppData: () => ({ guardando: false }) }));

// El caso real de la campaña de plan vencido (patente CZTF29, ago-2026): el
// cupón de $4.000 pasó a canal "web", así que el mesón ya no lo puede aplicar
// pero SÍ tiene que ofrecerlo — y de primero, antes que cualquier otra tarjeta.
const c: Cliente = { id: "c1", nombre: "MARCOS VALERIA", patente: "CZTF29", creadoEn: "2026-01-01T00:00:00.000Z" };

const cupon = (canal: Cupon["canal"], valor: number): Cupon => ({
  id: `cu-${canal}`,
  codigo: "AAA111",
  nombreLote: "Descuento plan vencido - ago 2026",
  numeroLote: 1,
  totalLote: 1,
  tipo: "descuento",
  valor,
  usado: false,
  patenteAsignada: c.patente,
  canal,
  creadoEn: "2026-08-30T00:00:00.000Z",
  fechaCaducidad: "2026-09-10T23:59:59.000Z",
});

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(<OperadorFoundOfertas {...({ c, ...props } as unknown as Parameters<typeof OperadorFoundOfertas>[0])} />);
}

describe("OperadorFoundOfertas — descuento solo web", () => {
  it("muestra el recuadro Web con el monto y sin prometer que se aplica acá", () => {
    const html = render({ cuponDescuentoSoloWeb: cupon("web", 4000) });
    expect(html).toContain(">Web<");
    expect(html).toContain("Promoción especial contratando por la web");
    expect(html).toContain("$4.000");
    expect(html).toContain("CZTF29");
    expect(html).toContain("solo si contrata por la web");
    // Lo que NO puede decir: el precio de esta pantalla no lleva el descuento.
    expect(html).not.toContain("Ya está restado en los precios de esta pantalla");
  });

  it("muestra el total que le sale el plan contratando por la web", () => {
    const html = render({ cuponDescuentoSoloWeb: cupon("web", 4000), precioPlanWeb: 20990 });
    expect(html).toContain("$20.990");
    expect(html).toContain("total pagando por la web");
  });

  it("sin precio de plan web calculado no inventa un total", () => {
    const html = render({ cuponDescuentoSoloWeb: cupon("web", 4000) });
    expect(html).not.toContain("total pagando por la web");
  });

  it("va primero, antes del descuento cobrable en el mesón", () => {
    const html = render({ cuponDescuentoSoloWeb: cupon("web", 4000), cuponDescuentoVigente: cupon("local", 2000) });
    expect(html.indexOf("Promoción especial contratando por la web")).toBeLessThan(
      html.indexOf("Descuento vigente para este vehículo")
    );
  });

  it("sin cupón de web no aparece, y el cobrable acá ya no se rotula WhatsApp", () => {
    const html = render({ cuponDescuentoVigente: cupon("local", 2000) });
    expect(html).not.toContain("Promoción especial contratando por la web");
    expect(html).not.toContain("WhatsApp");
    expect(html).toContain("Ya está restado en los precios de esta pantalla");
  });
});
