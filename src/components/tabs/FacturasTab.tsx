"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { facturasEmitidas, MODULOS_NOTA_CREDITO, MOTIVOS_NOTA_CREDITO, type FacturaEmitida, type MotivoNotaCredito } from "@/lib/logic";
import { fmtCLP, fmtFecha, formatRut } from "@/lib/helpers";
import { emitirNotaCredito } from "@/lib/serverActions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";

// Registro de las facturas emitidas, armado desde las ventas con
// factura_emitida (ver facturasEmitidas): no hay tabla propia. El PDF se pide
// a SimpleFactura al abrir el link (/api/facturas/[folio]/pdf); las marcadas a
// mano en el cierre no tienen folio ni PDF. Una factura con folio se puede
// anular con una nota de crédito (ver emitirNotaCreditoDeFactura).

// Mismo cálculo que armarFactura (@/lib/simplefactura): los precios traen IVA.
const neto = (total: number) => Math.round(total / 1.19);

const anulada = (f: FacturaEmitida) => !!f.notaCreditoFolio;

function coincide(f: FacturaEmitida, razonSocial: string, q: string): boolean {
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qRut = q.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    razonSocial.toLowerCase().includes(qLower) ||
    String(f.folio ?? "").includes(q) ||
    String(f.notaCreditoFolio || "").includes(q) ||
    (qRut.length > 0 && f.rut.replace(/[^0-9kK]/g, "").toUpperCase().includes(qRut))
  );
}

const detalle = (f: FacturaEmitida) => f.ventas.map((v) => [v.tipo, v.patente].filter(Boolean).join(" ")).join(", ");

function LinkPdf({ folio, notaCredito }: { folio?: number; notaCredito?: boolean }) {
  if (!folio) return <span className="text-muted-foreground">Marcada a mano</span>;
  return (
    <a
      href={`/api/facturas/${folio}/pdf${notaCredito ? "?tipo=61" : ""}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      onClick={(ev) => ev.stopPropagation()}
    >
      <FileText className="size-4" />
      {notaCredito ? `NC ${folio}` : "PDF"}
    </a>
  );
}

// PDF de la factura y, si se anuló, el de su nota de crédito o el botón para emitirla.
function Documentos({ f, puedeAnular, onAnular }: { f: FacturaEmitida; puedeAnular: boolean; onAnular: () => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <LinkPdf folio={f.folio} />
      {f.notaCreditoFolio ? (
        <LinkPdf folio={f.notaCreditoFolio} notaCredito />
      ) : f.notaCreditoFolio === 0 ? (
        <span className="text-muted-foreground" title="Se mandó al SII sin respuesta: revisarla en SimpleFactura">
          NC sin confirmar
        </span>
      ) : (
        f.folio &&
        puedeAnular && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(ev) => {
              ev.stopPropagation();
              onAnular();
            }}
          >
            Nota de crédito
          </Button>
        )
      )}
    </span>
  );
}

function NotaCreditoDialog({ factura, razonSocial, onCerrar, onEmitida }: { factura: FacturaEmitida; razonSocial: string; onCerrar: () => void; onEmitida: (folio: number) => void }) {
  const [motivo, setMotivo] = useState<MotivoNotaCredito>(1);
  const [glosa, setGlosa] = useState("");
  const [emitiendo, setEmitiendo] = useState(false);
  const [err, setErr] = useState("");

  const emitir = async () => {
    setEmitiendo(true);
    setErr("");
    const r = await emitirNotaCredito(factura.folio!, motivo, glosa).catch((x) => ({ ok: false as const, error: String(x) }));
    setEmitiendo(false);
    if (!r.ok) return setErr(`No se emitió la nota de crédito: ${r.error}`);
    onEmitida(r.folio);
    const correo = r.correo.ok ? `Enviada a ${r.correo.email}.` : `No se envió por correo: ${r.correo.error}.`;
    window.alert(`Nota de crédito N° ${r.folio} emitida: anula la factura N° ${factura.folio}. ${correo}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !emitiendo && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nota de crédito · Factura N° {factura.folio}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Anula completa la factura de <strong>{razonSocial || factura.rut}</strong> por <strong>{fmtCLP(factura.total)}</strong>. Se emite en el SII y no se puede
          deshacer. Las ventas no vuelven a quedar pendientes de factura.
        </p>
        <div className="field">
          <Label htmlFor="nc-motivo">Motivo</Label>
          <select id="nc-motivo" value={motivo} onChange={(e) => setMotivo(Number(e.target.value) as MotivoNotaCredito)}>
            {Object.entries(MOTIVOS_NOTA_CREDITO).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor="nc-glosa">Detalle (opcional, sale en el documento)</Label>
          <Textarea id="nc-glosa" maxLength={60} value={glosa} onChange={(e) => setGlosa(e.target.value)} placeholder="Ej: RUT del receptor equivocado" />
        </div>
        {err && <p className="err">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar} disabled={emitiendo}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={emitir} disabled={emitiendo}>
            {emitiendo ? "Emitiendo…" : "Emitir nota de crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FacturasTab() {
  const { data, ui, patchUi, aplicarLocal, loadingHistorial } = useApp();
  const [anulando, setAnulando] = useState<FacturaEmitida | null>(null);

  const puedeAnular = (ui.perfilActual?.modulos || []).some((m) => MODULOS_NOTA_CREDITO.includes(m));
  const empresaPorRut = useMemo(() => new Map(data.empresas.map((e) => [formatRut(e.rut), e])), [data.empresas]);
  const facturas = useMemo(() => facturasEmitidas(data.ventas, data.clientes), [data.ventas, data.clientes]);
  // La razón social registrada en Empresas manda sobre la de la venta o ficha.
  const razonSocialDe = (f: FacturaEmitida) => empresaPorRut.get(f.rut)?.razonSocial || f.razonSocial;

  const q = (ui.search || "").trim();
  const filtradas = facturas.filter((f) => coincide(f, razonSocialDe(f), q));
  // Las anuladas siguen en la lista pero no suman.
  const total = filtradas.reduce((s, f) => s + (anulada(f) ? 0 : f.total), 0);

  const verEmpresa = (f: FacturaEmitida) => {
    const empresa = empresaPorRut.get(f.rut);
    if (empresa) patchUi({ modal: { type: "empresaFicha", data: empresa } });
  };

  // El server ya la guardó: solo se refleja en pantalla.
  const marcarAnulada = (facturaFolio: number, notaCreditoFolio: number) => {
    aplicarLocal((actual) => ({ ventas: actual.ventas.map((v) => (v.facturaFolio === facturaFolio ? { ...v, notaCreditoFolio } : v)) }));
    setAnulando(null);
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
              title={`${f.folio ? `N° ${f.folio}` : "Sin folio"}${anulada(f) ? " (anulada)" : ""} · ${razonSocialDe(f) || "-"}`}
              subtitle={`${f.rut || "-"} · ${fmtFecha(f.fecha)}`}
              onClick={() => verEmpresa(f)}
              meta={
                <MobileRecordMeta
                  left={<Documentos f={f} puedeAnular={puedeAnular} onAnular={() => setAnulando(f)} />}
                  right={<span className={anulada(f) ? "line-through text-muted-foreground" : undefined}>{fmtCLP(f.total)}</span>}
                />
              }
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
                  className={[empresaPorRut.has(f.rut) && "cursor-pointer", anulada(f) && "text-muted-foreground"].filter(Boolean).join(" ") || undefined}
                  onClick={() => verEmpresa(f)}
                >
                  <TableCell className="font-medium">
                    {f.folio ?? "-"}
                    {anulada(f) && <span className="ml-1 text-xs font-normal">(anulada)</span>}
                  </TableCell>
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
                  <TableCell className={`text-right font-medium${anulada(f) ? " line-through" : ""}`}>{fmtCLP(f.total)}</TableCell>
                  <TableCell>
                    <Documentos f={f} puedeAnular={puedeAnular} onAnular={() => setAnulando(f)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {anulando?.folio && (
        <NotaCreditoDialog
          factura={anulando}
          razonSocial={razonSocialDe(anulando)}
          onCerrar={() => setAnulando(null)}
          onEmitida={(folio) => marcarAnulada(anulando.folio!, folio)}
        />
      )}
    </div>
  );
}
