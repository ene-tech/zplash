import type { Cliente } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ClienteRow } from "./ClienteRow";

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
            clientes.map((c) => (
              <ClienteRow key={c.id} cliente={c} onInfo={onInfo} onEditar={onEditar} onEliminar={onEliminar} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
