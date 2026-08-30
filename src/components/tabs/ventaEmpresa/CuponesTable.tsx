"use client";

import { estadoCupon } from "@/lib/helpers";
import type { Cupon } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Trash2, Ticket } from "lucide-react";
import { valorCupon } from "./useCuponesList";

/** Qué patente mostrar en la columna "Patente".
 *
 * Para un "vale" lo que restringe el canje es `patentesAutorizadas` (ver
 * patenteAutorizadaParaCupon, que es lo que valida el mesón), NO
 * `patenteAsignada`: en el ticket de cortesía de la promo de reactivación esa
 * última solo deja anotado qué patente se ganó el lavado (ver
 * otorgarTicketReactivacion), y pintarla acá hacía leer un ticket abierto
 * —regalable, canjeable en cualquier auto— como si fuera de un solo vehículo.
 * En un "descuento", en cambio, `patenteAsignada` sí restringe (ver
 * resolverDescuento) y por eso se sigue mostrando. */
function patenteCupon(c: Cupon): string {
  if (c.unUsoPorPatente) return (c.patentesUsadas || []).join(", ") || "Abierto";
  if (c.patenteUso) return c.patenteUso;
  if (c.tipo === "vale") return (c.patentesAutorizadas || []).join(", ") || "Abierto";
  return c.patenteAsignada || "Abierto";
}

/** Etiquetas cortas de las reglas del cupón, para no repetirlas en la tarjeta
 * mobile y en la fila de escritorio. */
function reglasCupon(c: Cupon): string[] {
  return [
    c.unCuponPorPatente && "1 por patente",
    c.unUsoPorPatente && `1 uso por patente${c.patentesUsadas?.length ? ` · ${c.patentesUsadas.length} usos` : ""}`,
    c.soloClientesNuevos && "solo clientes nuevos",
    c.tipo === "descuento" && c.canal === "web" && "solo web",
    c.tipo === "descuento" && c.canal === "local" && "solo local",
  ].filter((x): x is string => !!x);
}

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
                subtitle={[c.nombreLote, ...reglasCupon(c)].join(" · ")}
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
                        <div className="text-muted-foreground">
                          {c.usado && c.fechaUso
                            ? `Usado ${new Date(c.fechaUso).toLocaleDateString("es-CL")}`
                            : `Vence ${new Date(c.fechaCaducidad).toLocaleDateString("es-CL")}`}
                        </div>
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
              <TableHead>Fecha de uso</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10}>
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
                    <TableCell className="max-w-[160px]" title={c.nombreLote}>
                      <div className="truncate">{c.nombreLote}</div>
                      {reglasCupon(c).map((r) => (
                        <div key={r} className="text-xs text-muted-foreground">
                          {r}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>{valorCupon(c)}</TableCell>
                    <TableCell>{new Date(c.fechaCaducidad).toLocaleDateString("es-CL")}</TableCell>
                    <TableCell>
                      <span className={`status-pill ${est.cls}`}>{est.label}</span>
                    </TableCell>
                    <TableCell>{patenteCupon(c)}</TableCell>
                    <TableCell>{c.usado && c.fechaUso ? new Date(c.fechaUso).toLocaleDateString("es-CL") : "-"}</TableCell>
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
