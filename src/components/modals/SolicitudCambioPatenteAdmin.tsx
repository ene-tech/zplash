"use client";

import { useState } from "react";
import { cancelarCambioPatente, solicitarCambioPatente } from "@/lib/db";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Solicitud de cambio de patente diferido, para un cliente con plan (ver
// ClientModal): a diferencia del campo "Patente" del modal (edición
// inmediata, para corregir errores de tipeo), esto no se aplica al toque —
// queda guardado en clientes.patente_pendiente hasta que el plan renueve a
// un período nuevo (ver resolverPatentePendiente en @/lib/helpers y su uso en
// @/lib/db/clientes.ts::upsertClientes / @/lib/pagos/aplicarPagoAprobado).
// Llama a los Server Actions directo (no pasa por AppContext.commit ni por
// el array `data.clientes` en memoria), mismo patrón que la suscripción
// Oneclick en ClienteInfoModal.tsx.
export default function SolicitudCambioPatenteAdmin({
  cliente,
  onActualizado,
}: {
  cliente: Cliente;
  onActualizado: (c: Cliente) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");

  const solicitar = async () => {
    const patente = normPlate(nueva);
    if (!patente || !isValidPatente(patente)) {
      setErr(PATENTE_FORMATO_MSG);
      return;
    }
    setEnviando(true);
    const ok = await solicitarCambioPatente(cliente.id, patente);
    setEnviando(false);
    if (!ok) {
      setErr("No se pudo guardar la solicitud (revisa que la patente no esté en uso por otro cliente)");
      return;
    }
    setErr("");
    setAbierto(false);
    setNueva("");
    onActualizado({ ...cliente, patentePendiente: patente, patentePendienteDesde: new Date().toISOString() });
  };

  const cancelar = async () => {
    setEnviando(true);
    const ok = await cancelarCambioPatente(cliente.id);
    setEnviando(false);
    if (!ok) {
      setErr("No se pudo cancelar la solicitud");
      return;
    }
    setErr("");
    onActualizado({ ...cliente, patentePendiente: undefined, patentePendienteDesde: undefined });
  };

  if (cliente.patentePendiente) {
    return (
      <div className="grid gap-1.5 rounded-lg border border-input bg-transparent px-3 py-2 text-sm">
        <p>
          Cambio pendiente a <strong className="uppercase">{cliente.patentePendiente}</strong> — se aplicará cuando se
          renueve el plan
          {cliente.patentePendienteDesde
            ? ` (solicitado el ${new Date(cliente.patentePendienteDesde).toLocaleDateString("es-CL")})`
            : ""}
          .
        </p>
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" disabled={enviando} onClick={cancelar}>
          Cancelar solicitud
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    );
  }

  if (!abierto) {
    return (
      <Button type="button" variant="link" className="h-auto justify-start px-0" onClick={() => setAbierto(true)}>
        Solicitar cambio de patente
      </Button>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="cli-nueva-patente">Nueva patente (se aplica en el próximo período)</Label>
      <div className="flex gap-2">
        <Input
          id="cli-nueva-patente"
          className="uppercase"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          autoFocus
        />
        <Button type="button" onClick={solicitar} disabled={enviando}>
          Confirmar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setAbierto(false);
            setNueva("");
            setErr("");
          }}
        >
          Cancelar
        </Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
