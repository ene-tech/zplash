"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { useGuiaTraspaso } from "./useGuiaTraspaso";

type Props = Pick<
  ReturnType<typeof useGuiaTraspaso>,
  | "ui"
  | "patchUi"
  | "destinosActivos"
  | "origenId"
  | "destinoId"
  | "notas"
  | "setNotas"
  | "err"
  | "disponibleEnOrigen"
  | "productos"
  | "cantidades"
  | "setCantidad"
  | "cambiarOrigen"
  | "cambiarDestino"
  | "lineas"
  | "totalUnidades"
  | "limpiar"
  | "guardar"
>;

export function GuiaTraspasoForm(p: Props) {
  return (
    <>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Selecciona un origen y un destino: la lista solo muestra los productos con stock en el origen y que tienen
        ese destino permitido en su ficha. Luego ingresa la cantidad a traspasar de cada producto — al guardar se
        registra un traspaso por cada producto con cantidad ingresada, como una sola guía.
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Origen</label>
          <select value={p.origenId} onChange={(e) => p.cambiarOrigen(e.target.value)}>
            {p.destinosActivos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Destino</label>
          <select value={p.destinoId} onChange={(e) => p.cambiarDestino(e.target.value)}>
            <option value="" disabled>
              Selecciona un destino
            </option>
            {p.destinosActivos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Notas (opcional)</label>
          <input value={p.notas} onChange={(e) => p.setNotas(e.target.value)} placeholder="Ej: guía N° 123" />
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por SKU o detalle..."
          value={p.ui.search || ""}
          onChange={(e) => p.patchUi({ search: e.target.value })}
        />
      </div>

      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="max-w-[180px]">Detalle</TableHead>
              <TableHead>Disponible en origen</TableHead>
              <TableHead>Cantidad a traspasar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.productos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="empty">No hay productos disponibles para traspasar entre este origen y destino</div>
                </TableCell>
              </TableRow>
            ) : (
              p.productos.map((prod) => {
                const disponible = p.disponibleEnOrigen(prod.id);
                return (
                  <TableRow key={prod.id}>
                    <TableCell>{prod.sku}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={prod.detalle}>{prod.detalle}</TableCell>
                    <TableCell>{disponible}</TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min={0}
                        max={disponible}
                        placeholder="0"
                        value={p.cantidades[prod.id] || ""}
                        onChange={(e) => p.setCantidad(prod.id, Number(e.target.value) || 0)}
                        style={{ width: 90 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ color: "var(--gray)", fontSize: 13 }}>
          {p.lineas.length} producto(s) seleccionado(s), {p.totalUnidades} unidad(es) en total
        </div>
        <button className="btn ghost" onClick={p.limpiar}>
          Limpiar
        </button>
        <button className="btn" onClick={p.guardar}>
          Guardar guía de traspaso
        </button>
      </div>
      <div className="err" style={{ color: p.err?.ok ? "var(--green)" : undefined }}>
        {p.err?.msg || ""}
      </div>
    </>
  );
}
