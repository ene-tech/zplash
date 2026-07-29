import { fmtTelefono, planProgreso, planStatus, plateEstadoCls } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Info, Pencil, Trash2 } from "lucide-react";
import { IconoCambioPatentePendiente } from "./IconoCambioPatentePendiente";

export function ClientesTable({
  clientes,
  onSortHeader,
  flecha,
  onInfo,
  onEditar,
  onEliminar,
}: {
  clientes: Cliente[];
  onSortHeader: (campo: "vencimiento" | "visitas") => void;
  flecha: (campo: "vencimiento" | "visitas") => string;
  onInfo: (c: Cliente) => void;
  onEditar: (c: Cliente) => void;
  onEliminar: (c: Cliente) => void;
}) {
  return (
    <div className="table-scroll hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patente</TableHead>
            <TableHead className="max-w-[140px]">Nombre</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead className="col-mail">Mail</TableHead>
            <TableHead>Vehículo</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => onSortHeader("vencimiento")}>
              Vencimiento{flecha("vencimiento")}
            </TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => onSortHeader("visitas")}>
              Visitas{flecha("visitas")}
            </TableHead>
            <TableHead className="sticky right-0 z-10 w-0 bg-background" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11}>
                <div className="empty">No hay clientes que coincidan</div>
              </TableCell>
            </TableRow>
          ) : (
            clientes.map((c, idx) => {
              const st = planStatus(c);
              const prog = planProgreso(c);
              return (
                <TableRow key={`${c.id}-${c.patente}-${idx}`}>
                  <TableCell className={`plate-tag ${plateEstadoCls(c)}`}>
                    <span className="inline-flex items-center gap-1">
                      {c.patente}
                      {c.patentePendiente && <IconoCambioPatentePendiente patentePendiente={c.patentePendiente} />}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate" title={c.nombre}>{c.nombre}</TableCell>
                  <TableCell>{c.telefono ? fmtTelefono(c.telefono) : "-"}</TableCell>
                  <TableCell className="col-mail" title={c.email || ""}>{c.email || "-"}</TableCell>
                  <TableCell>{c.vehiculo || "-"}</TableCell>
                  <TableCell>{c.origen || "LOCAL"}</TableCell>
                  <TableCell>{c.plan || "-"}</TableCell>
                  <TableCell>
                    <div>{c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"}</div>
                    {prog !== null && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <ProgressBar value={prog} tone={st.cls} className="w-16" />
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{prog}%</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
                  </TableCell>
                  <TableCell>{c.visitas || 0}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Información adicional"
                        aria-label="Información adicional"
                        onClick={() => onInfo(c)}
                      >
                        <Info />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(c)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onEliminar(c)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
