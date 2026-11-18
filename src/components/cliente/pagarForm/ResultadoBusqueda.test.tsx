import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultadoBusqueda } from "./ResultadoBusqueda";
import type { EstadoPlan } from "./usePagarForm";

// El caso real que destapó el bug (patente TYGL84, ago-2026): cliente sin plan
// con un cupón de descuento de $5.000 sobre el plan de $21.990. El botón
// anunciaba $21.990 y el cobro tampoco aplicaba el cupón (ver cobrarSuscripcion).
// Los valores de `resultado` son la respuesta literal de /api/pagos/estado.
function render(resultado: EstadoPlan) {
  return renderToStaticMarkup(
    <ResultadoBusqueda
      resultado={resultado}
      email=""
      setEmail={() => {}}
      telefono="+569"
      setTelefono={() => {}}
      inscribiendo={false}
      activarAutomatica={async () => {}}
      precios={{ planOneclick: { nombre: "Plan X5", precio: 21990 }, planX3Oneclick: { nombre: "Plan X3", precio: 14990 } } as never}
    />
  );
}

const SIN_PLAN_CON_CUPON: EstadoPlan = {
  encontrado: true,
  nombre: "IGNACIO ORTEGA CARRASCO",
  vencimiento: null,
  estado: { label: "Sin plan", cls: "bad" },
  descuentoCupon: 5000,
  precioPlanHeredado: null,
  precioPrimerCobroAuto: 16990,
  ticketReactivacion: false,
};

describe("ResultadoBusqueda", () => {
  it("anuncia el primer mes rebajado y el precio mensual de después", () => {
    const html = render(SIN_PLAN_CON_CUPON);
    expect(html).toContain("$16.990 el primer mes");
    expect(html).toContain("desde el próximo, $21.990/mes");
    expect(html).toContain("descuento de $5.000");
  });

  it("sin cupón ni promoción anuncia solo el precio mensual", () => {
    const html = render({ ...SIN_PLAN_CON_CUPON, descuentoCupon: 0, precioPrimerCobroAuto: undefined });
    expect(html).toContain("$21.990/mes");
    expect(html).not.toContain("primer mes");
  });

  it("ofrece el Plan X3 con sus 3 lavados y su precio", () => {
    const html = render({ ...SIN_PLAN_CON_CUPON, descuentoCupon: 0, precioPrimerCobroAuto: undefined });
    expect(html).toContain("Plan X3");
    expect(html).toContain("3 lavados Full Túnel al mes");
    expect(html).toContain("$14.990/mes");
  });

  it("el cliente del X3 parte con el X3 elegido y renueva a su precio", () => {
    const html = render({ ...SIN_PLAN_CON_CUPON, plan: "Plan X3", descuentoCupon: 0, precioPrimerCobroAuto: undefined });
    expect(html).toContain("Activar renovación automática — $14.990/mes");
  });
});
