"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import DatosTransferencia from "@/components/DatosTransferencia";
import { fmtCLP } from "@/lib/helpers";
import { conectarPosIntegrado, posIntegradoConectado, ventaPosIntegrado } from "@/lib/posIntegrado";
import type { Cliente, DatosFacturacion, PagoInfo } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Valor del selector de empresa que usa los datos de la ficha del cliente.
const FICHA = "__ficha__";

export default function PagoModal({
  monto,
  descripcion,
  onConfirm,
  cliente,
  terminal,
}: {
  monto: number;
  descripcion: string;
  onConfirm: (pago: PagoInfo) => void;
  cliente?: Cliente;
  terminal?: boolean;
}) {
  const { data, patchUi } = useAppData();
  const [metodo, setMetodo] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [err, setErr] = useState("");
  // Cobro por terminal Transbank en curso: bloquea el modal (no se puede
  // cancelar un cobro que el terminal ya está esperando) y muestra los
  // mensajes intermedios ("Acerque su tarjeta…").
  const [cobrandoTerminal, setCobrandoTerminal] = useState(false);
  const [estadoTerminal, setEstadoTerminal] = useState("");
  // Voucher a mano de "Tarjeta (manual)" (solo donde hay terminal: si el
  // terminal aprobó pero la venta no se guardó, se reintenta por acá con el
  // mismo voucher, sin volver a pasar la tarjeta).
  const [voucher, setVoucher] = useState("");
  // Boleta o factura se pregunta en cada venta; parte de lo que dice la ficha.
  const fichaConFactura = cliente?.tipoDocumento === "Factura" && !!cliente.rut;
  const [documento, setDocumento] = useState<"Boleta" | "Factura" | null>(fichaConFactura ? "Factura" : null);
  const [empresaId, setEmpresaId] = useState(fichaConFactura ? FICHA : "");

  const cerrar = () => {
    if (!cobrandoTerminal) patchUi({ modal: null });
  };

  const seleccionar = (m: "efectivo" | "tarjeta" | "transferencia") => {
    setMetodo(m);
    setErr("");
  };

  /** Documento elegido, o null (con el error ya pintado) si falta algo. */
  const documentoElegido = (): DatosFacturacion | undefined | null => {
    if (cliente && !documento) {
      setErr("Elige boleta o factura");
      return null;
    }
    let doc: DatosFacturacion | undefined;
    if (documento === "Boleta") doc = { tipoDocumento: "Boleta" };
    else if (documento === "Factura") {
      const empresa = data.empresas.find((e) => e.id === empresaId);
      if (empresaId === FICHA) doc = { tipoDocumento: "Factura" };
      else if (empresa)
        doc = { tipoDocumento: "Factura", razonSocial: empresa.razonSocial, rut: empresa.rut, direccion: empresa.direccion, giro: empresa.giro };
      else {
        setErr("Elige la empresa de la factura");
        return null;
      }
    }
    return doc;
  };

  const confirmar = () => {
    if (!metodo) {
      setErr("Selecciona una forma de pago");
      return;
    }
    const doc = documentoElegido();
    if (doc === null) return;
    const voucherManual = terminal && metodo === "tarjeta" ? voucher.trim() || undefined : undefined;
    onConfirm({ metodo, ...(voucherManual && { voucher: voucherManual }), ...(doc && { documento: doc }) });
    cerrar();
  };

  // "Tarjeta (terminal)": manda el monto al POS Integrado y SOLO si el
  // terminal aprueba se confirma el pago (y con eso se graba la venta), con
  // el voucher armado solo (operación, autorización, últimos 4). Si el agente
  // no está o el terminal rechaza, el modal sigue abierto y el cajero puede
  // reintentar o elegir "Tarjeta (manual)" como siempre.
  const cobrarEnTerminal = async () => {
    if (cobrandoTerminal) return;
    const doc = documentoElegido();
    if (doc === null) return;
    setCobrandoTerminal(true);
    setErr("");
    try {
      if (!posIntegradoConectado()) {
        setEstadoTerminal("Conectando con el terminal…");
        const c = await conectarPosIntegrado();
        if (!c.ok) {
          setErr(`${c.error} Puedes cobrar con Tarjeta (manual).`);
          return;
        }
      }
      setEstadoTerminal("Enviando el monto al terminal…");
      const r = await ventaPosIntegrado(monto, "ZPLASH", setEstadoTerminal);
      if (!r.aprobada) {
        setErr(r.error);
        return;
      }
      onConfirm({ metodo: "tarjeta", voucher: r.voucher, viaTerminal: true, ...(doc && { documento: doc }) });
      patchUi({ modal: null });
    } finally {
      setCobrandoTerminal(false);
      setEstadoTerminal("");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forma de pago</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <p className="text-sm">{descripcion}</p>
          <p className="text-2xl font-bold text-primary">{fmtCLP(monto)}</p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant={metodo === "efectivo" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("efectivo")}
            >
              Efectivo
            </Button>
            {terminal && (
              <Button variant="outline" className="flex-1" disabled={cobrandoTerminal} onClick={cobrarEnTerminal}>
                {cobrandoTerminal ? "Esperando el terminal…" : "Tarjeta (terminal)"}
              </Button>
            )}
            <Button
              variant={metodo === "tarjeta" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("tarjeta")}
            >
              {terminal ? "Tarjeta (manual)" : "Tarjeta"}
            </Button>
            <Button
              variant={metodo === "transferencia" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("transferencia")}
            >
              Transferencia bancaria
            </Button>
          </div>
          {cobrandoTerminal && estadoTerminal && <p className="text-sm text-muted-foreground">{estadoTerminal}</p>}
          {terminal && metodo === "tarjeta" && (
            <input
              placeholder="N° de voucher / operación (opcional)"
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
            />
          )}
          {metodo === "transferencia" && <DatosTransferencia />}

          {cliente && (
            <>
              <p className="text-sm font-medium">Documento</p>
              <div className="flex gap-2.5">
                {(["Boleta", "Factura"] as const).map((d) => (
                  <Button
                    key={d}
                    variant={documento === d ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => {
                      setDocumento(d);
                      setErr("");
                    }}
                  >
                    {d}
                  </Button>
                ))}
              </div>
              {documento === "Factura" && (
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={empresaId}
                  onChange={(e) => {
                    setEmpresaId(e.target.value);
                    setErr("");
                  }}
                >
                  <option value="">Elegir empresa…</option>
                  {fichaConFactura && (
                    <option value={FICHA}>
                      {cliente.razonSocial || cliente.nombre} · {cliente.rut} (ficha del cliente)
                    </option>
                  )}
                  {[...data.empresas]
                    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.razonSocial} · {e.rut}
                      </option>
                    ))}
                </select>
              )}
            </>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={cobrandoTerminal} onClick={cerrar}>
            Cancelar
          </Button>
          <Button disabled={cobrandoTerminal} onClick={confirmar}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
