"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { facturasEmitidas, type FacturaEmitida } from "@/lib/logic";
import { fmtCLP, fmtFecha, formatRut } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { FileText } from "lucide-react";

// Registro de las facturas emitidas, armado desde las ventas con
// factura_emitida (ver facturasEmitidas): no hay tabla propia. El PDF se pide
// a SimpleFactura al abrir el link (/api/facturas/[folio]/pdf); las marcadas a
// mano en el cierre no tienen folio ni PDF.

// Mismo cálculo que armarFactura (@/lib/simplefactura): los precios traen IVA.
const neto = (total: number) => Math.round(total / 1.19);

function coincide(f: FacturaEmitida, razonSocial: string, q: string): boolean {
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qRut = q.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    razonSocial.toLowerCase().includes(qLower) ||
    String(f.folio ?? "").includes(q) ||
    (qRut.length > 0 && f.rut.replace(/[^0-9kK]/g, "").toUpperCase().includes(qRut))
  );
}

const detalle = (f: FacturaEmitida) => f.ventas.map((v) => [v.tipo, v.patente].filter(Boolean).join(" ")).join(", ");

function LinkPdf({ folio }: { folio?: number }) {
  if (!folio) return <span className="text-muted-foreground">Marcada a mano</span>;
  return (
    <a
      href={`/api/facturas/${folio}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      onClick={(ev) => ev.stopPropagation()}
    >
      <FileText className="size-4" />
      PDF
    </a>
  );
}

export default function FacturasTab() {
  const { data, ui, patchUi, loadingHistorial } = useApp();

  const empresaPorRut = useMemo(() => new Map(data.empresas.map((e) => [formatRut(e.rut), e])), [data.empresas]);
  const facturas = useMemo(() => facturasEmitidas(data.ventas, data.clientes), [data.ventas, data.clientes]);
  // La razón social registrada en Empresas manda sobre la de la venta o ficha.
  const razonSocialDe = (f: FacturaEmitida) => empresaPorRut.get(f.rut)?.razonSocial || f.razonSocial;

  const q = (ui.search || "").trim();
  const filtradas = facturas.filter((f) => coincide(f, razonSocialDe(f), q));
  const total = filtradas.reduce((s, f) => s + f.total, 0);

  const verEmpresa = (f: FacturaEmitida) => {
    const empresa = empresaPorRut.get(f.rut);
    if (empresa) patchUi({ modal: { type: "empresaFicha", data: empresa } });
  };

  const vacio = loadingHistorial ? "Cargando…" : facturas.length === 0 ? "Todavía no hay facturas emitidas" : "No hay facturas que coincidan";

  return (
    <div>
      <div className="toolbar">
        <input placeholder="Buscar por folio, razón social o RUT..." value={ui.search || ""} onChange={(e) => patchUi({ search: e.target.value })} />
        {filtradas.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {filtradas.length} factura(s) · {fmtCLP(total)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtradas.length === 0 ? (
          <div className="empty">{vacio}</div>
        ) : (
          filtradas.map((f) => (
            <MobileRecordCard
              key={f.folio ?? f.ventas[0].id}
              avatar={<MobileRecordAvatar icon={FileText} />}
              title={`${f.folio ? `N° ${f.folio}` : "Sin folio"} · ${razonSocialDe(f) || "-"}`}
              subtitle={`${f.rut || "-"} · ${fmtFecha(f.fecha)}`}
              onClick={() => verEmpresa(f)}
              meta={<MobileRecordMeta left={<LinkPdf folio={f.folio} />} right={fmtCLP(f.total)} />}
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
              <TableHead>RUT</TableHead>
              <TableHead className="max-w-[200px]">Razón Social</TableHead>
              <TableHead className="max-w-[260px]">Detalle</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Documento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="empty">{vacio}</div>
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow
                  key={f.folio ?? f.ventas[0].id}
                  className={empresaPorRut.has(f.rut) ? "cursor-pointer" : undefined}
                  onClick={() => verEmpresa(f)}
                >
                  <TableCell className="font-medium">{f.folio ?? "-"}</TableCell>
                  <TableCell>{fmtFecha(f.fecha)}</TableCell>
                  <TableCell>{f.rut || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={razonSocialDe(f)}>
                    {razonSocialDe(f) || "-"}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate" title={detalle(f)}>
                    {detalle(f)}
                  </TableCell>
                  <TableCell className="text-right">{fmtCLP(neto(f.total))}</TableCell>
                  <TableCell className="text-right">{fmtCLP(f.total - neto(f.total))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtCLP(f.total)}</TableCell>
                  <TableCell>
                    <LinkPdf folio={f.folio} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
