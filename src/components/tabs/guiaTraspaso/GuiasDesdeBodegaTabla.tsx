"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Trash2, ClipboardList } from "lucide-react";
import type { GuiaDesdeBodega } from "./useGuiaTraspaso";

export function GuiasDesdeBodegaTabla({
  guiasDesdeBodega,
  destinoNombre,
  productoNombre,
  puedeBorrar,
  eliminarGuia,
}: {
  guiasDesdeBodega: GuiaDesdeBodega[];
  destinoNombre: (id: string) => string;
  productoNombre: (id: string) => string;
  puedeBorrar: boolean;
  eliminarGuia: (g: GuiaDesdeBodega) => void;
}) {
  return (
    <>
      <h3 style={{ marginTop: 28 }}>Guías de traslado desde Bodega</h3>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {guiasDesdeBodega.length === 0 ? (
          <div className="empty">Todavía no hay guías de traslado registradas desde Bodega</div>
        ) : (
          guiasDesdeBodega.map((guia) => (
            <MobileRecordCard
              key={guia.folio}
              avatar={<MobileRecordAvatar icon={ClipboardList} />}
              title={`Folio ${guia.folio}`}
              subtitle={guia.lineas.map((l) => `${productoNombre(l.productoId)} ×${l.cantidad}`).join(" · ")}
              menu={
                puedeBorrar && (
                  <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarGuia(guia) }]} />
                )
              }
              meta={<MobileRecordMeta left={`→ ${destinoNombre(guia.destinoId)}`} right={new Date(guia.fecha).toLocaleDateString("es-CL")} />}
            />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Registrado por</TableHead>
              {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {guiasDesdeBodega.length === 0 ? (
              <TableRow>
                <TableCell colSpan={puedeBorrar ? 7 : 6}>
                  <div className="empty">Todavía no hay guías de traslado registradas desde Bodega</div>
                </TableCell>
              </TableRow>
            ) : (
              guiasDesdeBodega.map((guia) => (
                <TableRow key={guia.folio}>
                  <TableCell>{guia.folio}</TableCell>
                  <TableCell>{new Date(guia.fecha).toLocaleString("es-CL")}</TableCell>
                  <TableCell>{destinoNombre(guia.destinoId)}</TableCell>
                  <TableCell>
                    {guia.lineas.map((l, i) => (
                      <div key={i}>
                        {productoNombre(l.productoId)} × {l.cantidad}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>{guia.notas || "-"}</TableCell>
                  <TableCell>{guia.creadoPor || "-"}</TableCell>
                  {puedeBorrar && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminarGuia(guia)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
