"use client";

import { alertaMantencionStatus, fmtFecha } from "@/lib/helpers";
import type { AlertaMantencion } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

export function AlertasPendientesTabla({
  pendientes,
  maquinariaNombre,
  iniciarCompletar,
  cancelarAlerta,
}: {
  pendientes: AlertaMantencion[];
  maquinariaNombre: (id: string) => string;
  iniciarCompletar: (a: AlertaMantencion) => void;
  cancelarAlerta: (a: AlertaMantencion) => void;
}) {
  return (
    <>
      <h3 style={{ marginTop: 28 }}>Próximas alertas</h3>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {pendientes.length === 0 ? (
          <div className="empty">No hay alertas de mantención pendientes</div>
        ) : (
          pendientes.map((a) => {
            const status = alertaMantencionStatus(a);
            return (
              <MobileRecordCard
                key={a.id}
                avatar={<MobileRecordAvatar icon={CalendarClock} tone={status.cls} />}
                title={a.descripcion}
                subtitle={maquinariaNombre(a.maquinariaId)}
                menu={
                  <MobileRowMenu
                    actions={[
                      { label: "Marcar realizada", icon: <CheckCircle2 />, onClick: () => iniciarCompletar(a) },
                      { label: "Cancelar alerta", icon: <XCircle />, destructive: true, onClick: () => cancelarAlerta(a) },
                    ]}
                  />
                }
                meta={
                  <MobileRecordMeta
                    left={fmtFecha(a.fechaObjetivo)}
                    right={<span className={`status-pill ${status.cls}`}>{status.label}</span>}
                  />
                }
              />
            );
          })
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha objetivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead className="max-w-[220px]">Descripción</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="empty">No hay alertas de mantención pendientes</div>
                </TableCell>
              </TableRow>
            ) : (
              pendientes.map((a) => {
                const status = alertaMantencionStatus(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{fmtFecha(a.fechaObjetivo)}</TableCell>
                    <TableCell>
                      <span className={`status-pill ${status.cls}`}>{status.label}</span>
                    </TableCell>
                    <TableCell>{maquinariaNombre(a.maquinariaId)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={a.descripcion}>
                      {a.descripcion}
                    </TableCell>
                    <TableCell>{a.notas || "-"}</TableCell>
                    <TableCell className="sticky right-0 z-10 flex gap-1 bg-background">
                      <Button variant="ghost" size="icon-sm" title="Marcar realizada" aria-label="Marcar realizada" onClick={() => iniciarCompletar(a)}>
                        <CheckCircle2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Cancelar alerta"
                        aria-label="Cancelar alerta"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => cancelarAlerta(a)}
                      >
                        <XCircle />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
