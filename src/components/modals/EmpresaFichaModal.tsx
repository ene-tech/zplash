"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha, fmtTelefono } from "@/lib/helpers";
import { facturasDeEmpresa } from "@/lib/logic";
import { reenviarFacturaPorCorreo } from "@/lib/serverActions";
import type { Empresa } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Ficha de solo lectura: datos de la empresa, su persona de contacto y las
// facturas emitidas. Editar se hace con el lápiz (EmpresaModal). Lee la
// empresa en vivo del contexto, igual que MaquinariaFichaModal, para reflejar
// una edición recién guardada.
export default function EmpresaFichaModal({ data: empresaInicial }: { data: Empresa }) {
  const { data, patchUi, loadingHistorial } = useApp();
  const empresa = data.empresas.find((x) => x.id === empresaInicial.id) || empresaInicial;
  const contacto = empresa.contactoClienteId ? data.clientes.find((c) => c.id === empresa.contactoClienteId) : undefined;

  const [enviando, setEnviando] = useState<number | null>(null);
  const [avisoCorreo, setAvisoCorreo] = useState("");

  const cerrar = () => patchUi({ modal: null });

  const facturas = useMemo(() => facturasDeEmpresa(empresa, data.ventas, data.clientes), [empresa, data.ventas, data.clientes]);
  const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);

  const reenviar = async (folio: number) => {
    setEnviando(folio);
    setAvisoCorreo("");
    const r = await reenviarFacturaPorCorreo(folio).catch((x) => ({ ok: false as const, error: String(x) }));
    setEnviando(null);
    setAvisoCorreo(r.ok ? `Factura N° ${folio} enviada a ${r.email}` : `No se envió la factura N° ${folio}: ${r.error}`);
  };

  const dato = (label: string, valor?: string) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{valor || "-"}</dd>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {empresa.razonSocial}
            <span className="text-sm font-normal text-muted-foreground"> — {empresa.rut}</span>
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {dato("Giro", empresa.giro)}
          {dato("Dirección", empresa.direccion)}
          {dato("Comuna", empresa.comuna)}
          {dato("Ciudad", empresa.ciudad)}
          {dato("Teléfono", empresa.telefono ? fmtTelefono(empresa.telefono) : undefined)}
        </dl>

        <div className="border-t border-border pt-3.5">
          <h4 className="mb-2 text-sm font-semibold">Persona de contacto</h4>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {dato("Nombre", contacto?.nombre || empresa.contactoNombre)}
            {dato("Correo", contacto?.email)}
            {dato("Teléfono", contacto?.telefono ? fmtTelefono(contacto.telefono) : undefined)}
          </dl>
        </div>

        <div className="border-t border-border pt-3.5">
          <h4 className="mb-2 flex justify-between text-sm font-semibold">
            <span>Facturas emitidas{facturas.length > 0 && ` (${facturas.length})`}</span>
            {facturas.length > 0 && <span>{fmtCLP(totalFacturado)}</span>}
          </h4>
          {loadingHistorial ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : facturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin facturas emitidas</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-md border text-sm">
              {facturas.map((f) => (
                <li key={f.folio ?? f.ventas[0].id} className="flex items-center justify-between gap-2 border-b px-2 py-1.5 last:border-b-0">
                  <span>
                    {f.folio ? `N° ${f.folio}` : "Sin folio (marcada a mano)"} · {fmtFecha(f.fecha)}
                    <span className="block text-xs text-muted-foreground">
                      {f.ventas.map((v) => [v.tipo, v.patente].filter(Boolean).join(" ")).join(", ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap font-medium">{fmtCLP(f.total)}</span>
                    {f.folio && (
                      <Button variant="outline" size="xs" disabled={enviando !== null} onClick={() => reenviar(f.folio!)}>
                        {enviando === f.folio ? "Enviando…" : "Reenviar por mail"}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {avisoCorreo && <p className="mt-2 text-sm text-muted-foreground">{avisoCorreo}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cerrar
          </Button>
          <Button variant="outline" onClick={() => patchUi({ modal: { type: "empresa", data: empresa } })}>
            Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
