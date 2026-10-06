"use server";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  formulaComponentes,
  formulas,
  insumos,
  materiasPrimas,
  movimientosContables,
  movimientosMateriaPrima,
  proveedores,
  recepcionesFabrica,
  recepcionFabricaLineas,
} from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import { fmtCLP, uid, uidMovimientoContable } from "@/lib/helpers";
import { calcularRecepcion, redondearCantidad, validarFormula, type LineaRecepcionInput } from "@/lib/logic";
import { sesionActual, tieneModulo } from "@/lib/session";
import type {
  DatosFabricacion,
  Formula,
  Insumo,
  MateriaPrima,
  MovimientoContable,
  RecepcionFabrica,
  TipoMovimientoMateriaPrima,
} from "@/types";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Categoría del egreso si el proveedor no trae una propia (ver proveedores.categoria_gasto). */
const CATEGORIA_GASTO_FABRICA = "Insumos de Lavado";

const DATOS_VACIOS: DatosFabricacion = { materiasPrimas: [], formulas: [], recepciones: [], movimientos: [] };

/** Fuera de AppData a propósito: solo esta pantalla lo usa. */
export async function cargarFabricacion(): Promise<DatosFabricacion> {
  if (!(await tieneModulo("fabricacion"))) return DATOS_VACIOS;
  const db = getDb();
  try {
    const [mps, fs, comps, recs, movs] = await Promise.all([
      db.select().from(materiasPrimas).orderBy(materiasPrimas.nombre),
      db.select().from(formulas),
      db.select().from(formulaComponentes),
      db.select().from(recepcionesFabrica).orderBy(desc(recepcionesFabrica.fecha)).limit(200),
      db.select().from(movimientosMateriaPrima).orderBy(desc(movimientosMateriaPrima.fecha)).limit(500),
    ]);
    const lineas = recs.length
      ? await db.select().from(recepcionFabricaLineas).where(inArray(recepcionFabricaLineas.recepcionId, recs.map((r) => r.id)))
      : [];
    return {
      materiasPrimas: mps.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        unidad: m.unidad,
        propia: m.propia,
        costoUnitario: m.costoUnitario,
        stock: m.stock,
        stockMin: m.stockMin,
        activa: m.activa,
      })),
      formulas: fs.map((f) => ({
        id: f.id,
        insumoId: f.insumoId,
        maquilaPorLitro: f.maquilaPorLitro,
        notas: f.notas || undefined,
        componentes: comps
          .filter((c) => c.formulaId === f.id)
          .map((c) => ({ id: c.id, materiaPrimaId: c.materiaPrimaId, porcentaje: c.porcentaje })),
      })),
      recepciones: recs.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        proveedorId: r.proveedorId || undefined,
        numeroDocumento: r.numeroDocumento || undefined,
        totalMaquila: r.totalMaquila,
        totalMateriasFabrica: r.totalMateriasFabrica,
        movimientoContableId: r.movimientoContableId || undefined,
        notas: r.notas || undefined,
        creadoPor: r.creadoPor || undefined,
        lineas: lineas
          .filter((l) => l.recepcionId === r.id)
          .map((l) => ({
            insumoId: l.insumoId || undefined,
            insumoNombre: l.insumoNombre,
            litros: l.litros,
            maquila: l.maquila,
            materiasFabrica: l.materiasFabrica,
          })),
      })),
      movimientos: movs.map((m) => ({
        id: m.id,
        materiaPrimaId: m.materiaPrimaId,
        fecha: m.fecha,
        tipo: m.tipo as TipoMovimientoMateriaPrima,
        cantidad: m.cantidad,
        recepcionId: m.recepcionId || undefined,
        notas: m.notas || undefined,
        creadoPor: m.creadoPor || undefined,
      })),
    };
  } catch (error) {
    console.error("Error cargando fabricación", error);
    return DATOS_VACIOS;
  }
}

/** Crea o edita la ficha. El stock NO se toca acá: solo cambia con
 * moverStockMateriaPrima o una recepción, para que todo quede en el historial. */
export async function guardarMateriaPrima(mp: MateriaPrima): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  const nombre = mp.nombre.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre" };
  const campos = {
    nombre,
    unidad: mp.unidad.trim() || "kg",
    propia: mp.propia,
    costoUnitario: Math.max(0, mp.costoUnitario || 0),
    stockMin: Math.max(0, mp.stockMin || 0),
    activa: mp.activa,
  };
  try {
    await getDb()
      .insert(materiasPrimas)
      .values({ id: mp.id || uid(), ...campos })
      .onConflictDoUpdate({ target: materiasPrimas.id, set: campos });
    return { ok: true };
  } catch (error) {
    console.error("Error guardando materia prima", error);
    return { ok: false, error: "No se pudo guardar la materia prima" };
  }
}

export async function eliminarMateriaPrima(id: string): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  const db = getDb();
  const enUso = await db.select({ id: formulaComponentes.id }).from(formulaComponentes).where(eq(formulaComponentes.materiaPrimaId, id)).limit(1);
  if (enUso.length) return { ok: false, error: "Esta materia prima está en una fórmula: sácala de la fórmula o desactívala" };
  try {
    await db.delete(materiasPrimas).where(eq(materiasPrimas.id, id));
    return { ok: true };
  } catch (error) {
    console.error("Error eliminando materia prima", error);
    return { ok: false, error: "No se pudo eliminar la materia prima" };
  }
}

/** Compra (entra a la fábrica) o ajuste por conteo (con signo). La factura de
 * la compra se sigue registrando en Contabilidad como siempre: acá solo se
 * mueve el stock, para no duplicar el gasto. */
export async function moverStockMateriaPrima(input: {
  materiaPrimaId: string;
  tipo: "compra" | "ajuste";
  cantidad: number;
  notas?: string;
}): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.modulos.includes("fabricacion")) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  const cantidad = redondearCantidad(input.cantidad);
  if (!cantidad) return { ok: false, error: "Indica una cantidad distinta de 0" };
  if (input.tipo === "compra" && cantidad < 0) return { ok: false, error: "Una compra no puede ser negativa: usa un ajuste" };
  try {
    await getDb().transaction(async (tx) => {
      const [fila] = await tx
        .update(materiasPrimas)
        .set({ stock: sql`${materiasPrimas.stock} + ${cantidad}` })
        .where(eq(materiasPrimas.id, input.materiaPrimaId))
        .returning({ id: materiasPrimas.id });
      if (!fila) throw new Error("materia prima inexistente");
      await tx.insert(movimientosMateriaPrima).values({
        id: uid(),
        materiaPrimaId: input.materiaPrimaId,
        fecha: new Date().toISOString(),
        tipo: input.tipo,
        cantidad,
        notas: input.notas?.trim() || null,
        creadoPor: sesion.nombre,
      });
    });
    return { ok: true };
  } catch (error) {
    console.error("Error moviendo stock de materia prima", error);
    return { ok: false, error: "No se pudo guardar el movimiento" };
  }
}

export async function guardarFormula(formula: Formula): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  if (!formula.insumoId) return { ok: false, error: "Elige el producto (insumo) de la fórmula" };
  const errores = validarFormula(formula);
  if (errores.length) return { ok: false, error: errores[0] };
  const id = formula.id || uid();
  try {
    await getDb().transaction(async (tx) => {
      const campos = { insumoId: formula.insumoId, maquilaPorLitro: formula.maquilaPorLitro, notas: formula.notas?.trim() || null };
      await tx.insert(formulas).values({ id, ...campos }).onConflictDoUpdate({ target: formulas.id, set: campos });
      await tx.delete(formulaComponentes).where(eq(formulaComponentes.formulaId, id));
      if (formula.componentes.length) {
        await tx.insert(formulaComponentes).values(
          formula.componentes.map((c) => ({ id: uid() + c.materiaPrimaId, formulaId: id, materiaPrimaId: c.materiaPrimaId, porcentaje: c.porcentaje }))
        );
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("Error guardando fórmula", error);
    // insumo_id es unique: el caso típico es una segunda fórmula para el mismo producto.
    return { ok: false, error: "No se pudo guardar la fórmula (¿ese producto ya tiene una?)" };
  }
}

export async function eliminarFormula(id: string): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  try {
    await getDb().delete(formulas).where(eq(formulas.id, id));
    return { ok: true };
  } catch (error) {
    console.error("Error eliminando fórmula", error);
    return { ok: false, error: "No se pudo eliminar la fórmula" };
  }
}

export interface RecepcionFabricaInput {
  proveedorId?: string;
  numeroDocumento?: string;
  notas?: string;
  lineas: LineaRecepcionInput[];
}

class FaltaMateriaPrima extends Error {}

/** ÚNICO camino para recibir producto de la fábrica, en UNA transacción:
 * sube el stock de los insumos, descuenta las materias primas propias según
 * la fórmula (bloquea si alguna no alcanza), y crea un egreso por pagar con
 * la maquila + las materias primas que puso la fábrica. Las materias primas
 * se leen con FOR UPDATE para que dos recepciones simultáneas no consuman el
 * mismo saldo. */
export async function registrarRecepcionFabrica(
  input: RecepcionFabricaInput
): Promise<Resultado<{ recepcion: RecepcionFabrica; insumos: Insumo[]; movimiento: MovimientoContable | null }>> {
  const sesion = await sesionActual();
  if (!sesion?.modulos.includes("fabricacion")) return { ok: false, error: "Tu perfil no tiene acceso a Fabricación" };
  if (!input.lineas.length) return { ok: false, error: "Agrega al menos un producto recibido" };

  const db = getDb();
  const fecha = new Date().toISOString();
  const recepcionId = uid();
  const insumoIds = [...new Set(input.lineas.map((l) => l.insumoId))];

  try {
    const resultado = await db.transaction(async (tx) => {
      const [mps, insumoRows, formulaRows, compRows, proveedorRows] = await Promise.all([
        tx.select().from(materiasPrimas).for("update"),
        tx.select({ id: insumos.id, nombre: insumos.nombre }).from(insumos).where(inArray(insumos.id, insumoIds)),
        tx.select().from(formulas).where(inArray(formulas.insumoId, insumoIds)),
        tx.select().from(formulaComponentes),
        input.proveedorId ? tx.select().from(proveedores).where(eq(proveedores.id, input.proveedorId)).limit(1) : Promise.resolve([]),
      ]);
      const formulasDominio: Formula[] = formulaRows.map((f) => ({
        id: f.id,
        insumoId: f.insumoId,
        maquilaPorLitro: f.maquilaPorLitro,
        componentes: compRows.filter((c) => c.formulaId === f.id),
      }));
      const calc = calcularRecepcion(input.lineas, formulasDominio, mps, insumoRows);
      if ("error" in calc) throw new FaltaMateriaPrima(calc.error);
      if (calc.faltantes.length) {
        throw new FaltaMateriaPrima(
          "No alcanza la materia prima propia: " +
            calc.faltantes.map((f) => `${f.nombre} (necesita ${f.necesita} ${f.unidad}, hay ${f.hay})`).join("; ")
        );
      }

      const proveedor = proveedorRows[0];
      const total = calc.totalMaquila + calc.totalMateriasFabrica;
      const detalle = calc.lineas.map((l) => `${l.insumoNombre} ${l.litros} L`).join(", ");
      const movimiento: MovimientoContable | null =
        total > 0
          ? {
              id: uidMovimientoContable(),
              tipo: "egreso",
              fecha,
              descripcion: `Fábrica: ${detalle}`,
              categoria: proveedor?.categoriaGasto || CATEGORIA_GASTO_FABRICA,
              contraparte: proveedor?.nombre,
              rutProveedor: proveedor?.rut || undefined,
              numeroFactura: input.numeroDocumento?.trim() || undefined,
              tipoDocumento: "Factura",
              monto: total,
              estado: "pendiente_pago",
              notas: `Maquila ${fmtCLP(calc.totalMaquila)} + materias primas de la fábrica ${fmtCLP(calc.totalMateriasFabrica)}`,
              creadoEn: fecha,
              creadoPor: sesion.nombre,
            }
          : null;

      await tx.insert(recepcionesFabrica).values({
        id: recepcionId,
        fecha,
        proveedorId: input.proveedorId || null,
        numeroDocumento: input.numeroDocumento?.trim() || null,
        totalMaquila: calc.totalMaquila,
        totalMateriasFabrica: calc.totalMateriasFabrica,
        movimientoContableId: movimiento?.id ?? null,
        notas: input.notas?.trim() || null,
        creadoPor: sesion.nombre,
      });
      await tx.insert(recepcionFabricaLineas).values(
        calc.lineas.map((l) => ({ id: uid() + l.insumoId, recepcionId, ...l, insumoId: l.insumoId ?? null }))
      );
      for (const l of calc.lineas) {
        await tx.update(insumos).set({ stock: sql`${insumos.stock} + ${l.litros}` }).where(eq(insumos.id, l.insumoId!));
      }
      for (const [materiaPrimaId, cantidad] of calc.consumos) {
        await tx.update(materiasPrimas).set({ stock: sql`${materiasPrimas.stock} - ${cantidad}` }).where(eq(materiasPrimas.id, materiaPrimaId));
        await tx.insert(movimientosMateriaPrima).values({
          id: uid() + materiaPrimaId,
          materiaPrimaId,
          fecha,
          tipo: "consumo",
          cantidad: -cantidad,
          recepcionId,
          notas: detalle,
          creadoPor: sesion.nombre,
        });
      }
      if (movimiento) await tx.insert(movimientosContables).values(dataAccess.movimientoToRow(movimiento));

      const recepcion: RecepcionFabrica = {
        id: recepcionId,
        fecha,
        proveedorId: input.proveedorId,
        numeroDocumento: input.numeroDocumento?.trim() || undefined,
        totalMaquila: calc.totalMaquila,
        totalMateriasFabrica: calc.totalMateriasFabrica,
        movimientoContableId: movimiento?.id,
        notas: input.notas?.trim() || undefined,
        creadoPor: sesion.nombre,
        lineas: calc.lineas,
      };
      return { recepcion, movimiento };
    });

    const actualizados = await db.select().from(insumos).where(inArray(insumos.id, insumoIds));
    return { ok: true, ...resultado, insumos: actualizados.map(dataAccess.insumoFromRow) };
  } catch (error) {
    if (error instanceof FaltaMateriaPrima) return { ok: false, error: error.message };
    console.error("Error registrando recepción de fábrica", error);
    return { ok: false, error: "No se pudo guardar la recepción. Revisa la conexión e inténtalo de nuevo." };
  }
}

