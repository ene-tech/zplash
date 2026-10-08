"use server";

import { asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  formulaComponentes,
  formulas,
  insumos,
  lotesMateriaPrima,
  materiasPrimas,
  movimientosContables,
  movimientosMateriaPrima,
  presentacionComponentes,
  presentaciones,
  productos,
  proveedores,
  recepcionesFabrica,
  recepcionFabricaLineas,
} from "@/db/schema";
import * as dataAccess from "@/lib/dataAccess";
import { fmtCLP, uid, uidMovimientoContable } from "@/lib/helpers";
import {
  calcularRecepcion,
  consumirFifo,
  redondearCantidad,
  totalesConIva,
  validarFormula,
  validarPresentacion,
  type LineaRecepcionInput,
} from "@/lib/logic";
import { sesionActual, tieneModulo } from "@/lib/session";
import type {
  DatosFabricacion,
  Formula,
  Insumo,
  LoteMateriaPrima,
  MateriaPrima,
  MovimientoContable,
  Presentacion,
  Producto,
  RecepcionFabrica,
  TipoMovimientoMateriaPrima,
} from "@/types";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SIN_ACCESO = { ok: false as const, error: "Tu perfil no tiene acceso a Fabricación" };

/** Categoría del egreso si el proveedor no trae una propia (ver proveedores.categoria_gasto). */
const CATEGORIA_GASTO_FABRICA = "Insumos de Lavado";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function loteFromRow(l: typeof lotesMateriaPrima.$inferSelect): LoteMateriaPrima {
  return {
    id: l.id,
    materiaPrimaId: l.materiaPrimaId,
    fecha: l.fecha,
    cantidad: l.cantidad,
    restante: l.restante,
    costoUnitario: l.costoUnitario,
    notas: l.notas || undefined,
  };
}

function materiaPrimaFromRow(m: typeof materiasPrimas.$inferSelect): MateriaPrima {
  return {
    id: m.id,
    nombre: m.nombre,
    unidad: m.unidad,
    precioFabrica: m.precioFabrica ?? undefined,
    stock: m.stock,
    stockMin: m.stockMin,
    activa: m.activa,
  };
}

function presentacionesFromRows(
  pres: (typeof presentaciones.$inferSelect)[],
  comps: (typeof presentacionComponentes.$inferSelect)[]
): Presentacion[] {
  return pres.map((p) => ({
    id: p.id,
    formulaId: p.formulaId,
    productoId: p.productoId || undefined,
    insumoId: p.insumoId || undefined,
    mlPorUnidad: p.mlPorUnidad,
    maquilaPorUnidad: p.maquilaPorUnidad,
    activa: p.activa,
    componentes: comps
      .filter((c) => c.presentacionId === p.id)
      .map((c) => ({ id: c.id, materiaPrimaId: c.materiaPrimaId, cantidadPorUnidad: c.cantidadPorUnidad })),
  }));
}

function formulasFromRows(fs: (typeof formulas.$inferSelect)[], comps: (typeof formulaComponentes.$inferSelect)[]): Formula[] {
  return fs.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    notas: f.notas || undefined,
    componentes: comps
      .filter((c) => c.formulaId === f.id)
      .map((c) => ({ id: c.id, materiaPrimaId: c.materiaPrimaId, porcentaje: c.porcentaje })),
  }));
}

/** Fuera de AppData a propósito: solo esta pantalla lo usa. */
export async function cargarFabricacion(): Promise<DatosFabricacion | { error: string }> {
  if (!(await tieneModulo("fabricacion"))) return { error: SIN_ACCESO.error };
  const db = getDb();
  try {
    const [mps, lotes, fs, fcomps, pres, pcomps, recs, movs] = await Promise.all([
      db.select().from(materiasPrimas).orderBy(asc(materiasPrimas.nombre)),
      db.select().from(lotesMateriaPrima).where(gt(lotesMateriaPrima.restante, 0)).orderBy(asc(lotesMateriaPrima.fecha), asc(lotesMateriaPrima.id)),
      db.select().from(formulas).orderBy(asc(formulas.nombre)),
      db.select().from(formulaComponentes),
      db.select().from(presentaciones),
      db.select().from(presentacionComponentes),
      db.select().from(recepcionesFabrica).orderBy(desc(recepcionesFabrica.fecha)).limit(200),
      db.select().from(movimientosMateriaPrima).orderBy(desc(movimientosMateriaPrima.fecha)).limit(1000),
    ]);
    const lineas = recs.length
      ? await db.select().from(recepcionFabricaLineas).where(inArray(recepcionFabricaLineas.recepcionId, recs.map((r) => r.id)))
      : [];
    return {
      materiasPrimas: mps.map(materiaPrimaFromRow),
      lotes: lotes.map(loteFromRow),
      formulas: formulasFromRows(fs, fcomps),
      presentaciones: presentacionesFromRows(pres, pcomps),
      recepciones: recs.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        proveedorId: r.proveedorId || undefined,
        numeroDocumento: r.numeroDocumento || undefined,
        totalMaquila: r.totalMaquila,
        totalMateriasFabrica: r.totalMateriasFabrica,
        totalPropias: r.totalPropias,
        movimientoContableId: r.movimientoContableId || undefined,
        notas: r.notas || undefined,
        creadoPor: r.creadoPor || undefined,
        lineas: lineas
          .filter((l) => l.recepcionId === r.id)
          .map((l) => ({
            presentacionId: l.presentacionId || undefined,
            productoId: l.productoId || undefined,
            insumoId: l.insumoId || undefined,
            nombre: l.nombre,
            unidades: l.unidades,
            maquila: l.maquila,
            materiasFabrica: l.materiasFabrica,
            propias: l.propias,
          })),
      })),
      movimientos: movs.map((m) => ({
        id: m.id,
        materiaPrimaId: m.materiaPrimaId,
        loteId: m.loteId || undefined,
        fecha: m.fecha,
        tipo: m.tipo as TipoMovimientoMateriaPrima,
        cantidad: m.cantidad,
        costoUnitario: m.costoUnitario,
        recepcionId: m.recepcionId || undefined,
        notas: m.notas || undefined,
        creadoPor: m.creadoPor || undefined,
      })),
    };
  } catch (error) {
    // Error explícito y no listas vacías: una pantalla "sin materias primas"
    // invita a crearlas de nuevo y duplicarlas.
    console.error("Error cargando fabricación", error);
    return { error: "No se pudieron cargar los datos de Fabricación. Revisa la conexión y vuelve a intentar." };
  }
}

/** Crea o edita la ficha. El stock NO se toca acá: solo cambia con compras,
 * ajustes o recepciones, para que todo quede en los lotes y el historial. */
export async function guardarMateriaPrima(mp: MateriaPrima): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  const nombre = mp.nombre.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre" };
  if (mp.precioFabrica !== undefined && mp.precioFabrica < 0) return { ok: false, error: "El precio de la fábrica no puede ser negativo" };
  const campos = {
    nombre,
    unidad: mp.unidad.trim() || "L",
    precioFabrica: mp.precioFabrica ?? null,
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
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  const db = getDb();
  const [enFormula, enPresentacion] = await Promise.all([
    db.select({ id: formulaComponentes.id }).from(formulaComponentes).where(eq(formulaComponentes.materiaPrimaId, id)).limit(1),
    db.select({ id: presentacionComponentes.id }).from(presentacionComponentes).where(eq(presentacionComponentes.materiaPrimaId, id)).limit(1),
  ]);
  if (enFormula.length || enPresentacion.length) {
    return { ok: false, error: "Esta materia prima se usa en una fórmula o presentación: sácala de ahí o desactívala" };
  }
  try {
    await db.delete(materiasPrimas).where(eq(materiasPrimas.id, id));
    return { ok: true };
  } catch (error) {
    console.error("Error eliminando materia prima", error);
    return { ok: false, error: "No se pudo eliminar la materia prima" };
  }
}

class OperacionInvalida extends Error {}

/** Mueve el stock de lo nuestro.
 * - compra: crea un lote nuevo a `costoUnitario` (neto). La factura de la
 *   compra se registra en Contabilidad como siempre: acá no se crea egreso,
 *   para no duplicar el gasto.
 * - ajuste positivo: lote nuevo al costo del último lote (o 0).
 * - ajuste negativo: sale FIFO de los lotes; no puede dejar stock negativo. */
export async function moverStockMateriaPrima(input: {
  materiaPrimaId: string;
  tipo: "compra" | "ajuste";
  cantidad: number;
  costoUnitario?: number;
  notas?: string;
}): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion?.modulos.includes("fabricacion")) return SIN_ACCESO;
  const cantidad = redondearCantidad(input.cantidad);
  if (!cantidad) return { ok: false, error: "Indica una cantidad distinta de 0" };
  if (input.tipo === "compra" && cantidad < 0) return { ok: false, error: "Una compra no puede ser negativa: usa un ajuste" };
  if (input.tipo === "compra" && !(input.costoUnitario !== undefined && input.costoUnitario >= 0)) {
    return { ok: false, error: "Indica el costo neto por unidad de la compra" };
  }
  const fecha = new Date().toISOString();
  const notas = input.notas?.trim() || null;

  try {
    await getDb().transaction(async (tx) => {
      const [mp] = await tx.select().from(materiasPrimas).where(eq(materiasPrimas.id, input.materiaPrimaId)).for("update");
      if (!mp) throw new OperacionInvalida("La materia prima ya no existe");
      if (cantidad > 0) {
        let costo = input.costoUnitario ?? 0;
        if (input.tipo === "ajuste") {
          const [ultimo] = await tx
            .select({ costo: lotesMateriaPrima.costoUnitario })
            .from(lotesMateriaPrima)
            .where(eq(lotesMateriaPrima.materiaPrimaId, mp.id))
            .orderBy(desc(lotesMateriaPrima.fecha))
            .limit(1);
          costo = ultimo?.costo ?? 0;
        }
        const loteId = uid();
        await tx
          .insert(lotesMateriaPrima)
          .values({ id: loteId, materiaPrimaId: mp.id, fecha, cantidad, restante: cantidad, costoUnitario: costo, notas, creadoPor: sesion.nombre });
        await tx
          .insert(movimientosMateriaPrima)
          .values({ id: `${loteId}-m`, materiaPrimaId: mp.id, loteId, fecha, tipo: input.tipo, cantidad, costoUnitario: costo, notas, creadoPor: sesion.nombre });
      } else {
        const lotes = (
          await tx
            .select()
            .from(lotesMateriaPrima)
            .where(eq(lotesMateriaPrima.materiaPrimaId, mp.id))
            .orderBy(asc(lotesMateriaPrima.fecha), asc(lotesMateriaPrima.id))
            .for("update")
        ).map(loteFromRow);
        const salidas = consumirFifo(lotes, -cantidad);
        if (!salidas) throw new OperacionInvalida(`No hay tanto stock: quedan ${mp.stock} ${mp.unidad}`);
        const movId = uid();
        for (const s of salidas) {
          await tx.update(lotesMateriaPrima).set({ restante: sql`${lotesMateriaPrima.restante} - ${s.cantidad}` }).where(eq(lotesMateriaPrima.id, s.loteId));
          await tx.insert(movimientosMateriaPrima).values({
            id: `${movId}-${s.loteId}`,
            materiaPrimaId: mp.id,
            loteId: s.loteId,
            fecha,
            tipo: "ajuste",
            cantidad: -s.cantidad,
            costoUnitario: s.costoUnitario,
            notas,
            creadoPor: sesion.nombre,
          });
        }
      }
      await tx.update(materiasPrimas).set({ stock: sql`${materiasPrimas.stock} + ${cantidad}` }).where(eq(materiasPrimas.id, mp.id));
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof OperacionInvalida) return { ok: false, error: error.message };
    console.error("Error moviendo stock de materia prima", error);
    return { ok: false, error: "No se pudo guardar el movimiento" };
  }
}

export async function guardarFormula(formula: Formula): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  const errores = validarFormula(formula);
  if (errores.length) return { ok: false, error: errores[0] };
  const id = formula.id || uid();
  try {
    await getDb().transaction(async (tx) => {
      const campos = { nombre: formula.nombre.trim(), notas: formula.notas?.trim() || null };
      await tx.insert(formulas).values({ id, ...campos }).onConflictDoUpdate({ target: formulas.id, set: campos });
      await tx.delete(formulaComponentes).where(eq(formulaComponentes.formulaId, id));
      if (formula.componentes.length) {
        await tx
          .insert(formulaComponentes)
          .values(formula.componentes.map((c, i) => ({ id: `${id}-${i}-${uid()}`, formulaId: id, materiaPrimaId: c.materiaPrimaId, porcentaje: c.porcentaje })));
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("Error guardando fórmula", error);
    return { ok: false, error: "No se pudo guardar la fórmula" };
  }
}

export async function eliminarFormula(id: string): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  try {
    await getDb().delete(formulas).where(eq(formulas.id, id));
    return { ok: true };
  } catch (error) {
    console.error("Error eliminando fórmula", error);
    return { ok: false, error: "No se pudo eliminar la fórmula" };
  }
}

export async function guardarPresentacion(p: Presentacion): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  const errores = validarPresentacion(p);
  if (errores.length) return { ok: false, error: errores[0] };
  const id = p.id || uid();
  try {
    await getDb().transaction(async (tx) => {
      const campos = {
        formulaId: p.formulaId,
        productoId: p.productoId || null,
        insumoId: p.insumoId || null,
        mlPorUnidad: p.mlPorUnidad,
        maquilaPorUnidad: p.maquilaPorUnidad,
        activa: p.activa,
      };
      await tx.insert(presentaciones).values({ id, ...campos }).onConflictDoUpdate({ target: presentaciones.id, set: campos });
      await tx.delete(presentacionComponentes).where(eq(presentacionComponentes.presentacionId, id));
      if (p.componentes.length) {
        await tx.insert(presentacionComponentes).values(
          p.componentes.map((c, i) => ({ id: `${id}-${i}-${uid()}`, presentacionId: id, materiaPrimaId: c.materiaPrimaId, cantidadPorUnidad: c.cantidadPorUnidad }))
        );
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("Error guardando presentación", error);
    // producto_id / insumo_id son unique: el caso típico es repetir el destino.
    return { ok: false, error: "No se pudo guardar la presentación (¿ese producto o insumo ya tiene una?)" };
  }
}

export async function eliminarPresentacion(id: string): Promise<Resultado> {
  if (!(await tieneModulo("fabricacion"))) return SIN_ACCESO;
  try {
    await getDb().delete(presentaciones).where(eq(presentaciones.id, id));
    return { ok: true };
  } catch (error) {
    console.error("Error eliminando presentación", error);
    return { ok: false, error: "No se pudo eliminar la presentación" };
  }
}

export interface RecepcionFabricaInput {
  proveedorId?: string;
  numeroDocumento?: string;
  notas?: string;
  lineas: LineaRecepcionInput[];
}

async function leerParaRecepcion(tx: Tx, presentacionIds: string[]) {
  // En serie a propósito: una transacción es UNA conexión, y queries
  // simultáneas sobre la misma conexión se cuelgan (ver src/db/index.ts).
  const presRows = await tx.select().from(presentaciones).where(inArray(presentaciones.id, presentacionIds));
  const pcomps = await tx.select().from(presentacionComponentes).where(inArray(presentacionComponentes.presentacionId, presentacionIds));
  const formulaIds = [...new Set(presRows.map((p) => p.formulaId))];
  const fs = formulaIds.length ? await tx.select().from(formulas).where(inArray(formulas.id, formulaIds)) : [];
  const fcomps = formulaIds.length ? await tx.select().from(formulaComponentes).where(inArray(formulaComponentes.formulaId, formulaIds)) : [];
  // FOR UPDATE: dos recepciones simultáneas no pueden consumir el mismo saldo.
  const mps = await tx.select().from(materiasPrimas).orderBy(asc(materiasPrimas.id)).for("update");
  const lotes = await tx
    .select()
    .from(lotesMateriaPrima)
    .where(gt(lotesMateriaPrima.restante, 0))
    .orderBy(asc(lotesMateriaPrima.fecha), asc(lotesMateriaPrima.id))
    .for("update");
  const productoIds = presRows.flatMap((p) => (p.productoId ? [p.productoId] : []));
  const insumoIds = presRows.flatMap((p) => (p.insumoId ? [p.insumoId] : []));
  const prods = productoIds.length
    ? await tx.select({ id: productos.id, detalle: productos.detalle }).from(productos).where(inArray(productos.id, productoIds))
    : [];
  const ins = insumoIds.length ? await tx.select({ id: insumos.id, nombre: insumos.nombre }).from(insumos).where(inArray(insumos.id, insumoIds)) : [];
  return {
    presentaciones: presentacionesFromRows(presRows, pcomps),
    formulas: formulasFromRows(fs, fcomps),
    materias: mps.map(materiaPrimaFromRow),
    lotes: lotes.map(loteFromRow),
    destinos: { productos: prods, insumos: ins },
  };
}

/** ÚNICO camino para recibir producto de la fábrica, en UNA transacción:
 * sube el stock de cada producto/insumo, consume lo nuestro FIFO de los
 * lotes, cobra a precio de fábrica lo que faltó (bloquea si la fábrica no lo
 * pone), y crea un egreso por pagar con maquila + materias de la fábrica + IVA. */
export async function registrarRecepcionFabrica(
  input: RecepcionFabricaInput
): Promise<Resultado<{ recepcion: RecepcionFabrica; productos: Producto[]; insumos: Insumo[]; movimiento: MovimientoContable | null }>> {
  const sesion = await sesionActual();
  if (!sesion?.modulos.includes("fabricacion")) return SIN_ACCESO;
  if (!input.lineas.length) return { ok: false, error: "Agrega al menos una presentación recibida" };

  const db = getDb();
  const fecha = new Date().toISOString();
  const recepcionId = uid();
  const presentacionIds = [...new Set(input.lineas.map((l) => l.presentacionId))];

  try {
    const resultado = await db.transaction(async (tx) => {
      const datos = await leerParaRecepcion(tx, presentacionIds);
      const calc = calcularRecepcion(input.lineas, datos.presentaciones, datos.formulas, datos.materias, datos.lotes, datos.destinos);
      if ("error" in calc) throw new OperacionInvalida(calc.error);
      if (calc.faltantes.length) {
        throw new OperacionInvalida(
          "Falta materia prima que la fábrica no pone: " + calc.faltantes.map((f) => `${f.nombre} (faltan ${f.falta} ${f.unidad})`).join("; ")
        );
      }

      const proveedor = input.proveedorId
        ? (await tx.select().from(proveedores).where(eq(proveedores.id, input.proveedorId)).limit(1))[0]
        : undefined;
      const { neto, iva, total } = totalesConIva(calc.totalMaquila, calc.totalMateriasFabrica);
      const detalle = calc.lineas.map((l) => `${l.nombre} × ${l.unidades}`).join(", ");
      const movimiento: MovimientoContable | null =
        neto > 0
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
              notas: `Maquila ${fmtCLP(calc.totalMaquila)} + materias primas de la fábrica ${fmtCLP(calc.totalMateriasFabrica)} = neto ${fmtCLP(neto)} + IVA ${fmtCLP(iva)}`,
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
        totalPropias: calc.totalPropias,
        movimientoContableId: movimiento?.id ?? null,
        notas: input.notas?.trim() || null,
        creadoPor: sesion.nombre,
      });
      await tx.insert(recepcionFabricaLineas).values(
        calc.lineas.map((l, i) => ({
          id: `${recepcionId}-${i}`,
          recepcionId,
          presentacionId: l.presentacionId ?? null,
          productoId: l.productoId ?? null,
          insumoId: l.insumoId ?? null,
          nombre: l.nombre,
          unidades: l.unidades,
          maquila: l.maquila,
          materiasFabrica: l.materiasFabrica,
          propias: l.propias,
        }))
      );
      for (const l of calc.lineas) {
        if (l.productoId) await tx.update(productos).set({ stock: sql`${productos.stock} + ${l.unidades}` }).where(eq(productos.id, l.productoId));
        else if (l.insumoId) await tx.update(insumos).set({ stock: sql`${insumos.stock} + ${l.unidades}` }).where(eq(insumos.id, l.insumoId));
      }
      for (const c of calc.consumos) {
        await tx.update(lotesMateriaPrima).set({ restante: sql`${lotesMateriaPrima.restante} - ${c.cantidad}` }).where(eq(lotesMateriaPrima.id, c.loteId));
        await tx.update(materiasPrimas).set({ stock: sql`${materiasPrimas.stock} - ${c.cantidad}` }).where(eq(materiasPrimas.id, c.materiaPrimaId));
        await tx.insert(movimientosMateriaPrima).values({
          id: `${recepcionId}-${c.loteId}`,
          materiaPrimaId: c.materiaPrimaId,
          loteId: c.loteId,
          fecha,
          tipo: "consumo",
          cantidad: -c.cantidad,
          costoUnitario: c.costoUnitario,
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
        totalPropias: calc.totalPropias,
        movimientoContableId: movimiento?.id,
        notas: input.notas?.trim() || undefined,
        creadoPor: sesion.nombre,
        lineas: calc.lineas,
      };
      return { recepcion, movimiento };
    });

    const prodIds = resultado.recepcion.lineas.flatMap((l) => (l.productoId ? [l.productoId] : []));
    const insIds = resultado.recepcion.lineas.flatMap((l) => (l.insumoId ? [l.insumoId] : []));
    const prods = prodIds.length ? await db.select().from(productos).where(inArray(productos.id, prodIds)) : [];
    const ins = insIds.length ? await db.select().from(insumos).where(inArray(insumos.id, insIds)) : [];
    return { ok: true, ...resultado, productos: prods.map(dataAccess.productoFromRow), insumos: ins.map(dataAccess.insumoFromRow) };
  } catch (error) {
    if (error instanceof OperacionInvalida) return { ok: false, error: error.message };
    console.error("Error registrando recepción de fábrica", error);
    return { ok: false, error: "No se pudo guardar la recepción. Revisa la conexión e inténtalo de nuevo." };
  }
}
