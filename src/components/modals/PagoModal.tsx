"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import DatosTransferencia from "@/components/DatosTransferencia";
import { fmtCLP } from "@/lib/helpers";
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
}: {
  monto: number;
  descripcion: string;
  onConfirm: (pago: PagoInfo) => void;
  cliente?: Cliente;
}) {
  const { data, patchUi } = useAppData();
  const [metodo, setMetodo] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [err, setErr] = useState("");
  // Boleta o factura se pregunta en cada venta; parte de lo que dice la ficha.
  const fichaConFactura = cliente?.tipoDocumento === "Factura" && !!cliente.rut;
  const [documento, setDocumento] = useState<"Boleta" | "Factura" | null>(fichaConFactura ? "Factura" : null);
  const [empresaId, setEmpresaId] = useState(fichaConFactura ? FICHA : "");

  const cerrar = () => patchUi({ modal: null });

  const seleccionar = (m: "efectivo" | "tarjeta" | "transferencia") => {
    setMetodo(m);
    setErr("");
  };

  const confirmar = () => {
    if (!metodo) {
      setErr("Selecciona una forma de pago");
      return;
    }
    if (cliente && !documento) {
      setErr("Elige boleta o factura");
      return;
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
        return;
      }
    }
    onConfirm({ metodo, ...(doc && { documento: doc }) });
    cerrar();
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
            <Button variant={metodo === "efectivo" ? "default" : "outline"} className="flex-1" onClick={() => seleccionar("efectivo")}>
              Efectivo
            </Button>
            <Button variant={metodo === "tarjeta" ? "default" : "outline"} className="flex-1" onClick={() => seleccionar("tarjeta")}>
              Tarjeta
            </Button>
            <Button
              variant={metodo === "transferencia" ? "default" : "outline"}
              className="flex-1"
              onClick={() => seleccionar("transferencia")}
            >
              Transferencia bancaria
            </Button>
          </div>
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
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
