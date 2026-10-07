import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Cliente, Cupon } from "@/types";
import OperadorFoundOfertas from "./OperadorFoundOfertas";

vi.mock("@/context/AppContext", () => ({ useAppData: () => ({ guardando: false }) }));
// La tarjeta del QR arma el link con window.location.origin.
vi.stubGlobal("window", { location: { origin: "https://zplash.cl" } });

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

describe("OperadorFoundOfertas — orden", () => {
  it("el lavado va primero y las promociones después, de menor a mayor precio", () => {
    const html = render({
      planVigente: false,
      pContratacion: 19990,
      precioLavadoUnicoFinal: 9990,
      precioPromo2: 12990,
      precioQrTarjeta: { primerCobro: 6910, mensual: 19990 },
    });
    const lavado = html.indexOf("Cobrar Lavado Full Túnel");
    const qr = html.indexOf("Mostrar QR para pagar con tarjeta");
    const promo2 = html.indexOf("Cobrar Promo 2 lavados");
    expect(lavado).toBeGreaterThan(-1);
    expect(lavado).toBeLessThan(qr);
    expect(qr).toBeLessThan(promo2);
    // El Plan X5 se vende solo por la web: el mesón no lo cobra.
    expect(html).not.toContain("Contratar plan nuevo");
    const vip = html.indexOf("Promociones exclusivas cliente VIP");
    expect(html).toContain("<span>MARCOS VALERIA</span>");
    expect(vip).toBeGreaterThan(lavado);
    expect(vip).toBeLessThan(promo2);
  });
});

describe("OperadorFoundOfertas — plan solo por la web", () => {
  it("al que tiene el plan vigente y lo paga en el mesón le muestra el QR, no un botón de renovar", () => {
    const html = render({
      c: { ...c, plan: "Plan X5", vencimiento: "2026-10-20T03:00:00.000Z" },
      planVigente: true,
      showOffer: true,
      precioQrTarjeta: { primerCobro: 19990, mensual: 19990 },
    });
    expect(html).toContain("Mostrar QR para pagar con tarjeta");
    expect(html).toContain("se le renueva solo cada mes");
    expect(html).not.toContain("Renovar plan");
  });

  it("al que ya paga por la web no le ofrece nada", () => {
    const html = render({ planVigente: true, showOffer: false, precioQrTarjeta: { primerCobro: 19990, mensual: 19990 } });
    expect(html).not.toContain("Mostrar QR para pagar con tarjeta");
  });
});

describe("OperadorFoundOfertas — descuento solo web", () => {
  it("muestra el recuadro Web con el monto y sin prometer que se aplica acá", () => {
    const html = render({ cuponDescuentoSoloWeb: cupon("web", 4000) });
    expect(html).not.toContain("badge");
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

  it("con el QR del plan a la vista no se repite", () => {
    const html = render({
      cuponDescuentoSoloWeb: cupon("web", 4000),
      planVigente: false,
      precioQrTarjeta: { primerCobro: 6910, mensual: 19990 },
    });
    expect(html).not.toContain("Promoción especial contratando por la web");
    expect(html).toContain("Mostrar QR para pagar con tarjeta");
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
