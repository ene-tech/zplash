"use client";

import { estadoCupon } from "@/lib/helpers";
import type { Cupon } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Trash2, Ticket } from "lucide-react";
import { valorCupon } from "./useCuponesList";

export default function CuponesTable({ filtrados, eliminar }: { filtrados: Cupon[]; eliminar: (c: Cupon) => void }) {
  return (
    <>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtrados.length === 0 ? (
          <div className="empty">Sin cupones</div>
        ) : (
          filtrados.map((c) => {
            const est = estadoCupon(c);
            return (
              <MobileRecordCard
                key={c.id}
                avatar={<MobileRecordAvatar icon={Ticket} tone={est.cls} />}
                title={<span className="plate-tag">{c.codigo}</span>}
                subtitle={c.nombreLote}
                menu={
                  !c.usado && (
                    <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(c) }]} />
                  )
                }
                meta={
                  <MobileRecordMeta
                    left={<span className={`status-pill ${est.cls}`}>{est.label}</span>}
                    right={
                      <>
                        <div className="font-medium">{valorCupon(c)}</div>
                        <div className="text-muted-foreground">Vence {new Date(c.fechaCaducidad).toLocaleDateString("es-CL")}</div>
                      </>
                    }
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
              <TableHead>Código</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>N°</TableHead>
              <TableHead className="max-w-[160px]">Lote</TableHead>
              <TableHead>Valor c/u</TableHead>
              <TableHead>Caducidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Patente</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="empty">Sin cupones</div>
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((c) => {
                const est = estadoCupon(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="plate-tag">{c.codigo}</TableCell>
                    <TableCell>{c.tipo === "descuento" ? "Descuento" : "Vale"}</TableCell>
                    <TableCell>
                      {c.numeroLote}/{c.totalLote}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate" title={c.nombreLote}>{c.nombreLote}</TableCell>
                    <TableCell>{valorCupon(c)}</TableCell>
                    <TableCell>{new Date(c.fechaCaducidad).toLocaleDateString("es-CL")}</TableCell>
                    <TableCell>
                      <span className={`status-pill ${est.cls}`}>{est.label}</span>
                    </TableCell>
                    <TableCell>{c.patenteUso || c.patenteAsignada || (c.tipo === "descuento" ? "Abierto" : "-")}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background">
                      {!c.usado && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => eliminar(c)}
                        >
                          <Trash2 />
                        </Button>
                      )}
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
