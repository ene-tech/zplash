"use client";

import { fmtFecha } from "@/lib/helpers";
import type { AlertaMantencion } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { CalendarClock, Trash2 } from "lucide-react";

export function HistorialAlertasTabla({
  historial,
  maquinariaNombre,
  puedeBorrar,
  eliminarAlerta,
}: {
  historial: AlertaMantencion[];
  maquinariaNombre: (id: string) => string;
  puedeBorrar: boolean;
  eliminarAlerta: (a: AlertaMantencion) => void;
}) {
  if (historial.length === 0) return null;
  return (
    <>
      <h3 style={{ marginTop: 28 }}>Historial de alertas</h3>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {historial.map((a) => (
          <MobileRecordCard
            key={a.id}
            avatar={<MobileRecordAvatar icon={CalendarClock} tone={a.estado === "completada" ? "ok" : "neutral"} />}
            title={a.descripcion}
            subtitle={maquinariaNombre(a.maquinariaId)}
            menu={
              puedeBorrar && (
                <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarAlerta(a) }]} />
              )
            }
            meta={<MobileRecordMeta left={fmtFecha(a.fechaObjetivo)} right={a.estado === "completada" ? "Completada" : "Cancelada"} />}
          />
        ))}
      </div>
      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha objetivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead className="max-w-[220px]">Descripción</TableHead>
              {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{fmtFecha(a.fechaObjetivo)}</TableCell>
                <TableCell>{a.estado === "completada" ? "Completada" : "Cancelada"}</TableCell>
                <TableCell>{maquinariaNombre(a.maquinariaId)}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={a.descripcion}>
                  {a.descripcion}
                </TableCell>
                {puedeBorrar && (
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Eliminar"
                      aria-label="Eliminar"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => eliminarAlerta(a)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
