"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  cancelarSuscripcionOneclick,
  cobrarSuscripcionManual,
  obtenerSuscripcionOneclick,
  reactivarSuscripcionOneclick,
  suspenderSuscripcionOneclick,
} from "@/lib/db";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import {
  fmtDate,
  fmtFecha,
  inicioPeriodoPlan,
  visitasDesdeContratacion,
  visitasPeriodoPlan,
  visitasUltimos30Dias,
} from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function ClienteInfoModal({ data: c }: { data: Cliente }) {
  const { data: appData, patchUi } = useApp();
  const inicioPeriodo = inicioPeriodoPlan(c.fechaContratacion);
  const finPeriodo = new Date(inicioPeriodo);
  finPeriodo.setDate(finPeriodo.getDate() + 29);
  const visitasPeriodo = visitasPeriodoPlan(appData.ingresos, c);
  const tienePlan = !!c.vencimiento;
  const visitasPlan = tienePlan ? visitasDesdeContratacion(appData.ingresos, c) : visitasUltimos30Dias(appData.ingresos, c.id);
  const [suscripcion, setSuscripcion] = useState<SuscripcionOneclickInfo | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [errSuscripcion, setErrSuscripcion] = useState("");

  const cerrar = () => patchUi({ modal: null });

  useEffect(() => {
    obtenerSuscripcionOneclick(c.patente)
      .then(setSuscripcion)
      .catch(() => setSuscripcion(null));
  }, [c.patente]);

  async function reintentarCobro() {
    if (!suscripcion) return;
    setCobrando(true);
    setErrSuscripcion("");
    try {
      const resultado = await cobrarSuscripcionManual(suscripcion.id);
      if (!resultado) {
        setErrSuscripcion("No se pudo reintentar el cobro.");
        return;
      }
      const actualizada = await obtenerSuscripcionOneclick(c.patente);
      setSuscripcion(actualizada);
      if (resultado.estado === "rechazada") setErrSuscripcion("El cobro fue rechazado nuevamente.");
    } catch {
      setErrSuscripcion("Este ciclo ya fue cobrado o hubo un error.");
    } finally {
      setCobrando(false);
    }
  }

  async function reactivar() {
    if (!suscripcion) return;
    setCobrando(true);
    setErrSuscripcion("");
    try {
      await reactivarSuscripcionOneclick(suscripcion.id);
      const actualizada = await obtenerSuscripcionOneclick(c.patente);
      setSuscripcion(actualizada);
    } catch {
      setErrSuscripcion("No se pudo reactivar la suscripción.");
    } finally {
      setCobrando(false);
    }
  }

  function suspender() {
    if (!suscripcion) return;
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Suspender la renovación automática de ${c.nombre}? Se pausan los cobros, pero la tarjeta queda inscrita y se puede reactivar después.`,
        confirmLabel: "Suspender",
        danger: false,
        onConfirm: () => suspenderSuscripcionOneclick(suscripcion.id),
      },
    });
  }

  function cancelar() {
    if (!suscripcion) return;
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la renovación automática de ${c.nombre}? Se elimina la tarjeta inscrita en Transbank y no se puede reactivar después.`,
        confirmLabel: "Cancelar suscripción",
        danger: true,
        onConfirm: () => cancelarSuscripcionOneclick(suscripcion.id),
      },
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Información adicional</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="font-medium">{c.nombre}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Patente</div>
            <div className="font-medium">{c.patente}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Creado por</div>
            <div className="font-medium">{c.creadoPor || "No disponible"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de creación</div>
            <div className="font-medium">{c.creadoEn ? fmtDate(c.creadoEn) : "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas último período</div>
            <div className="font-medium">
              {visitasPeriodo} ({fmtFecha(inicioPeriodo.toISOString())} - {fmtFecha(finPeriodo.toISOString())})
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas totales</div>
            <div className="font-medium">{c.visitas || 0}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {tienePlan ? "Visitas desde que contrató el plan" : "Visitas últimos 30 días"}
            </div>
            <div className="font-medium">{visitasPlan}</div>
          </div>
        </div>

        {suscripcion && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-3.5 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Renovación automática</div>
              <div className="font-medium">
                {suscripcion.estado === "activa"
                  ? "Activa"
                  : suscripcion.estado === "suspendida"
                    ? "Suspendida"
                    : suscripcion.estado === "cancelada"
                      ? "Cancelada"
                      : "Pendiente"}
                {suscripcion.cardUltimosDigitos ? ` (tarjeta ${suscripcion.cardUltimosDigitos})` : ""}
              </div>
            </div>
            {suscripcion.proximoCobro && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Próximo cobro</div>
                <div className="font-medium">{fmtDate(suscripcion.proximoCobro)}</div>
              </div>
            )}
            {suscripcion.ultimoCobro && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Último intento</div>
                <div className="font-medium">
                  {suscripcion.ultimoCobro.estado === "aprobada" ? "Aprobado" : "Rechazado"} — {fmtDate(suscripcion.ultimoCobro.fecha)}
                </div>
              </div>
            )}
            {(suscripcion.estado === "activa" || suscripcion.estado === "suspendida") && (
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                {suscripcion.ultimoCobro?.estado === "rechazada" && suscripcion.estado === "activa" && (
                  <Button variant="secondary" onClick={reintentarCobro} disabled={cobrando}>
                    {cobrando ? "Cobrando..." : "Reintentar cobro ahora"}
                  </Button>
                )}
                {suscripcion.estado === "activa" && (
                  <Button variant="secondary" onClick={suspender} disabled={cobrando}>
                    Suspender
                  </Button>
                )}
                {suscripcion.estado === "suspendida" && (
                  <Button variant="secondary" onClick={reactivar} disabled={cobrando}>
                    {cobrando ? "Reactivando..." : "Reactivar"}
                  </Button>
                )}
                <Button variant="destructive" onClick={cancelar} disabled={cobrando}>
                  Cancelar suscripción
                </Button>
                {errSuscripcion && <p className="w-full text-sm text-destructive">{errSuscripcion}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
