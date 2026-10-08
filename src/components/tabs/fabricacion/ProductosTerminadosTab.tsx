"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { filasProductosTerminados, type FilaProductoTerminado } from "@/lib/logic";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { fmtCantidad, fmtFormato, type FabricacionTabProps } from "./shared";

const pct = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;

/** Color del margen: rojo si se pierde, amarillo bajo 30%, verde desde ahí. */
function claseMargen(f: FilaProductoTerminado) {
  if (f.margenPct === undefined) return "";
  if (f.margenPct < 0) return "text-destructive font-semibold";
  if (f.margenPct < 30) return "text-amber-500";
  return "text-emerald-500";
}

export default function ProductosTerminadosTab({ datos }: FabricacionTabProps) {
  const { data } = useApp();
  const [q, setQ] = useState("");
  const [destino, setDestino] = useState<"todos" | "tienda" | "insumo">("todos");

  const filas = useMemo(
    () =>
      filasProductosTerminados({
        presentaciones: datos.presentaciones,
        formulas: datos.formulas,
        materias: datos.materiasPrimas,
        lotes: datos.lotes,
        recepciones: datos.recepciones,
        productos: data.productos,
        insumos: data.insumos,
      }),
    [datos, data.productos, data.insumos]
  );

  const busqueda = q.trim().toLowerCase();
  const visibles = filas.filter(
    (f) =>
      (destino === "todos" || f.destino === destino) &&
      (!busqueda || [f.nombre, f.formula, f.categoria].some((t) => t.toLowerCase().includes(busqueda)))
  );
  // Los indicadores miran solo lo que se sigue fabricando: una presentación
  // desactivada se ve en la tabla (atenuada) pero no mueve los números.
  const activas = visibles.filter((f) => f.activa);
  const conMargen = activas.filter((f) => f.margenPct !== undefined);
  const margenPromedio = conMargen.length ? conMargen.reduce((s, f) => s + f.margenPct!, 0) / conMargen.length : undefined;
  const conPerdida = conMargen.filter((f) => f.margen! < 0).length;
  const sinPrecio = activas.filter((f) => f.sinPrecio).length;

  const exportarExcel = () => {
    import("xlsx").then((XLSX) => {
      const hoja = visibles.map((f) => ({
        Categoría: f.categoria,
        Producto: f.nombre,
        Fórmula: f.formula,
        Formato: fmtFormato(f.mlPorUnidad),
        Tipo: f.destino === "tienda" ? "Tienda" : "Insumo",
        Stock: f.stock,
        "Mezcla (neto)": f.mezcla,
        "Envases (neto)": f.envases,
        "Maquila (neto)": f.maquila,
        "Costo unitario (neto)": f.costo,
        "Falta costo de alguna materia prima": f.sinPrecio ? "Sí" : "",
        "Último costo real (neto)": f.ultimoCostoReal ?? "",
        "Última recepción": f.ultimaRecepcion ? fmtFecha(f.ultimaRecepcion) : "",
        "Precio venta (IVA incl.)": f.precioVenta ?? "",
        "Precio venta neto": f.precioNeto ?? "",
        "Margen $": f.margen ?? "",
        "Margen %": f.margenPct ?? "",
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja), "Productos terminados");
      XLSX.writeFile(wb, `productos-terminados-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }).catch(() => toast.error("No se pudo generar el Excel. Recarga la página e inténtalo de nuevo."));
  };

  const grupos: { categoria: string; filas: FilaProductoTerminado[] }[] = [];
  for (const f of visibles) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.categoria === f.categoria) ultimo.filas.push(f);
    else grupos.push({ categoria: f.categoria, filas: [f] });
  }

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="num">{activas.length}</div>
          <div className="lbl">Presentaciones activas</div>
        </div>
        <div className="stat-card">
          <div className="num">{margenPromedio === undefined ? "-" : pct(margenPromedio)}</div>
          <div className="lbl">Margen promedio (tienda)</div>
        </div>
        <div className={`stat-card ${conPerdida > 0 ? "warn" : ""}`}>
          <div className="num">{conPerdida}</div>
          <div className="lbl">Se venden bajo el costo</div>
        </div>
        <div className={`stat-card ${sinPrecio > 0 ? "warn" : ""}`}>
          <div className="num">{sinPrecio}</div>
          <div className="lbl">Con costo incompleto</div>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Buscar producto, fórmula o categoría..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {(
            [
              ["todos", "Todos"],
              ["tienda", "Tienda"],
              ["insumo", "Insumos"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={`btn ${destino === v ? "" : "ghost"}`} onClick={() => setDestino(v)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn" onClick={exportarExcel} disabled={!visibles.length}>
          Exportar Excel
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Valores netos por unidad. El costo es el de hoy: lo nuestro al costo del lote más antiguo con saldo (FIFO) y lo que pone la fábrica a su
        precio. El margen se calcula sobre el precio de venta sin IVA.
      </p>

      {visibles.length === 0 ? (
        <div className="empty">{filas.length ? "Nada coincide con el filtro" : "Todavía no hay presentaciones: créalas en la pestaña Fórmulas"}</div>
      ) : (
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Mezcla</TableHead>
                <TableHead className="text-right">Envases</TableHead>
                <TableHead className="text-right">Maquila</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Último real</TableHead>
                <TableHead className="text-right">Venta (IVA)</TableHead>
                <TableHead className="text-right">Venta neta</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">Margen %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <Fragment key={g.categoria}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={12} className="font-semibold">
                      {g.categoria} <span className="font-normal text-muted-foreground">({g.filas.length})</span>
                    </TableCell>
                  </TableRow>
                  {g.filas.map((f) => (
                    <TableRow key={f.presentacionId} className={f.activa ? undefined : "opacity-50"}>
                      <TableCell>
                        <div>{f.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.formula} · {f.destino === "tienda" ? "tienda" : "insumo"}
                        </div>
                      </TableCell>
                      <TableCell>{fmtFormato(f.mlPorUnidad)}</TableCell>
                      <TableCell className="text-right">{fmtCantidad(f.stock)}</TableCell>
                      <TableCell className="text-right">{fmtCLP(f.mezcla)}</TableCell>
                      <TableCell className="text-right">{fmtCLP(f.envases)}</TableCell>
                      <TableCell className="text-right">{fmtCLP(f.maquila)}</TableCell>
                      <TableCell className="text-right font-semibold" title={f.sinPrecio ? "Falta el costo de alguna materia prima: el valor está incompleto" : undefined}>
                        {fmtCLP(f.costo)}
                        {f.sinPrecio && <span className="text-destructive"> *</span>}
                      </TableCell>
                      <TableCell className="text-right" title={f.ultimaRecepcion ? `Recepción del ${fmtFecha(f.ultimaRecepcion)}` : undefined}>
                        {f.ultimoCostoReal !== undefined ? fmtCLP(f.ultimoCostoReal) : "-"}
                      </TableCell>
                      <TableCell className="text-right">{f.precioVenta !== undefined ? fmtCLP(f.precioVenta) : "-"}</TableCell>
                      <TableCell className="text-right">{f.precioNeto !== undefined ? fmtCLP(f.precioNeto) : "-"}</TableCell>
                      <TableCell className={`text-right ${claseMargen(f)}`}>{f.margen !== undefined ? fmtCLP(f.margen) : "-"}</TableCell>
                      <TableCell className={`text-right ${claseMargen(f)}`}>{f.margenPct !== undefined ? pct(f.margenPct) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {sinPrecio > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Falta el costo de alguna materia prima (no alcanza lo nuestro y la fábrica no la pone): el
          costo está incompleto y no se calcula margen.
        </p>
      )}
    </div>
  );
}
