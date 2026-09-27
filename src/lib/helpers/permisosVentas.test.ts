import { describe, expect, it } from "vitest";
import {
  MODULOS_BORRAN_CUPONES,
  MODULOS_CREAN_CUPONES,
  MODULOS_CREAN_VENTAS,
  MODULOS_EDITAN_VENTAS,
  PERFILES_DEFAULT,
  TODOS_LOS_MODULOS,
  tieneAlgunoDe,
} from "./perfiles";

// Quién puede tocar ventas y cupones. Estas listas son el permiso real de
// insertVentas/upsertVentas/upsertCupones/deleteCupones (Server Actions
// alcanzables por POST directo), así que un cambio distraído acá abre o
// rompe un flujo de caja sin que nada más lo note.
describe("permisos de ventas y cupones", () => {
  const CAJA_TIENDA = ["pos"] as const;
  const OPERADOR_TUNEL = ["operador", "servicios", "funcionario"] as const;

  it("la caja de la tienda no puede crear ni editar ventas, ni emitir o borrar cupones", () => {
    // El POS vende por registrarVentaPos, que escribe en su propia
    // transacción: no necesita ninguna de estas cuatro. Si alguna se abriera,
    // un cajero de tienda podría emitirse un vale de lavado gratis o una
    // venta de plan.
    expect(tieneAlgunoDe([...CAJA_TIENDA], MODULOS_CREAN_VENTAS)).toBe(false);
    expect(tieneAlgunoDe([...CAJA_TIENDA], MODULOS_EDITAN_VENTAS)).toBe(false);
    expect(tieneAlgunoDe([...CAJA_TIENDA], MODULOS_CREAN_CUPONES)).toBe(false);
    expect(tieneAlgunoDe([...CAJA_TIENDA], MODULOS_BORRAN_CUPONES)).toBe(false);
  });

  it("el operador del túnel sigue cobrando y canjeando como siempre", () => {
    // Cobrar un lavado, contratar o renovar un plan, canjear un ticket y
    // marcar un descuento como usado pasan por estas dos.
    expect(tieneAlgunoDe([...OPERADOR_TUNEL], MODULOS_CREAN_VENTAS)).toBe(true);
    expect(tieneAlgunoDe([...OPERADOR_TUNEL], MODULOS_CREAN_CUPONES)).toBe(true);
    // Canjear un lavado web prepagado edita la venta.
    expect(tieneAlgunoDe([...OPERADOR_TUNEL], MODULOS_EDITAN_VENTAS)).toBe(true);
  });

  it("los perfiles que vienen de fábrica no se quedan sin lo que su pantalla necesita", () => {
    for (const perfil of PERFILES_DEFAULT) {
      const vendeEnMeson = perfil.modulos.includes("operador") || perfil.modulos.includes("servicios");
      if (vendeEnMeson) expect(tieneAlgunoDe(perfil.modulos, MODULOS_CREAN_VENTAS)).toBe(true);
      // Emitir vales de empresa y descuentos desde la ficha del cliente.
      if (perfil.modulos.includes("empresa") || perfil.modulos.includes("clientes")) {
        expect(tieneAlgunoDe(perfil.modulos, MODULOS_CREAN_CUPONES)).toBe(true);
      }
    }
  });

  it("Gerencia (todos los módulos) puede todo", () => {
    expect(tieneAlgunoDe(TODOS_LOS_MODULOS, MODULOS_CREAN_VENTAS)).toBe(true);
    expect(tieneAlgunoDe(TODOS_LOS_MODULOS, MODULOS_EDITAN_VENTAS)).toBe(true);
    expect(tieneAlgunoDe(TODOS_LOS_MODULOS, MODULOS_CREAN_CUPONES)).toBe(true);
    expect(tieneAlgunoDe(TODOS_LOS_MODULOS, MODULOS_BORRAN_CUPONES)).toBe(true);
  });

  it("sin sesión (módulos undefined) no pasa nada", () => {
    expect(tieneAlgunoDe(undefined, MODULOS_CREAN_VENTAS)).toBe(false);
    expect(tieneAlgunoDe([], MODULOS_CREAN_CUPONES)).toBe(false);
  });
});
