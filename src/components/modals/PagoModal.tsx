"use client";

import { useState } from "react";
import { useAppAcciones } from "@/context/AppContext";
import DatosTransferencia from "@/components/DatosTransferencia";
import { fmtCLP } from "@/lib/helpers";
import type { PagoInfo } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function PagoModal({
  monto,
  descripcion,
  onConfirm,
}: {
  monto: number;
  descripcion: string;
  onConfirm: (pago: PagoInfo) => void;
}) {
  const { patchUi } = useAppAcciones();
  const [metodo, setMetodo] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [err, setErr] = useState("");

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
    onConfirm({ metodo });
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
