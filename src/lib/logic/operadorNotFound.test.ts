import { describe, expect, it } from "vitest";
import { prepararClienteRapido, type DatosClienteRapido } from "./operadorNotFound";
import { precioLavadoUnico, precioSoloTunel } from "@/lib/helpers";
import type { AppData, Cupon } from "@/types";

const cupon = (extra: Partial<Cupon>): Cupon => ({
  id: "c1",
  codigo: "396FQV",
  nombreLote: "Próxima visita",
  valor: 2000,
  numeroLote: 1,
  totalLote: 1,
  fechaCaducidad: "2999-01-01T00:00:00.000Z",
  usado: false,
  creadoEn: "2026-11-03T00:00:00.000Z",
  tipo: "descuento",
  esPorcentaje: false,
  canal: "ambos",
  ...extra,
});

const data = (c: Cupon) => ({ precios: {}, cupones: [c], clientes: [], empresas: [] }) as unknown as AppData;

const datos = (extra: Partial<DatosClienteRapido>): DatosClienteRapido => ({
  patente: "ABCD12",
  nombre: "Juan",
  telefono: "+56911111111",
  email: "",
  vehiculo: "",
  tipoDocumento: "Boleta",
  razonSocial: "",
  rut: "",
  direccion: "",
  giro: "",
  tipoCliente: "soloTunel",
  codigoCupon: "396FQV",
  perfilNombre: "Operador",
  ...extra,
});

describe("prepararClienteRapido con código de descuento", () => {
  it("rebaja el Solo túnel de una patente nueva con un código Próxima visita", () => {
    const r = prepararClienteRapido(data(cupon({})), datos({}));
    expect(r).toMatchObject({ ok: true, precio: precioSoloTunel({}) - 2000 });
    expect(r.ok && r.cuponAplicado?.codigo).toBe("396FQV");
  });

  it("rechaza con aviso un código que no vale para el Solo túnel, en vez de cobrar el precio completo", () => {
    const r = prepararClienteRapido(data(cupon({ nombreLote: "Campaña Vuelve" })), datos({}));
    expect(r).toEqual({ ok: false, error: "Este código es solo para el Lavado Full Túnel" });
  });

  it("sigue rebajando el Lavado Full Túnel con cualquier código de descuento", () => {
    const r = prepararClienteRapido(data(cupon({ nombreLote: "Campaña Vuelve" })), datos({ tipoCliente: "unico" }));
    expect(r).toMatchObject({ ok: true, precio: precioLavadoUnico({}) - 2000 });
  });
});
