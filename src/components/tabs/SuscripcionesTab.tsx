"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  cancelarSuscripcionOneclick,
  cobrarSuscripcionManual,
  listarSuscripcionesOneclick,
  reactivarSuscripcionOneclick,
  suspenderSuscripcionOneclick,
} from "@/lib/db";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import { fmtDate, normPlate } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu, { type MobileRowAction } from "@/components/tabs/MobileRowMenu";

const ESTADO_LABEL: Record<string, string> = {
  activa: "Activa",
  suspendida: "Suspendida",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
};

const ESTADO_CLASE: Record<string, string> = {
  activa: "ok",
  suspendida: "warn",
  pendiente: "warn",
  cancelada: "bad",
};

// A diferencia de ClientesTab, esta lista no vive en AppData/commit(): se
// pide a demanda con listarSuscripcionesOneclick() y se recarga después de
// cada acción, mismo criterio que ya usa ClienteInfoModal para esta misma
// tabla (suscripciones_oneclick).
export default function SuscripcionesTab() {
  const { ui, patchUi } = useApp();
  const [suscripciones, setSuscripciones] = useState<SuscripcionOneclickInfo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const cargar = () => {
    setCargando(true);
    listarSuscripcionesOneclick()
      .then(setSuscripciones)
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    listarSuscripcionesOneclick()
      .then(setSuscripciones)
      .finally(() => setCargando(false));
  }, []);

  const qPatente = normPlate(ui.search || "");
  const qNombre = (ui.search || "").toLowerCase().trim();
  let filtered = suscripciones.filter(
    (s) => !ui.search || normPlate(s.patente).includes(qPatente) || s.clienteNombre.toLowerCase().includes(qNombre)
  );
  if (filtroEstado !== "todos") {
    filtered = filtered.filter((s) => s.estado === filtroEstado);
  }

  const ejecutar = async (id: string, accion: () => Promise<unknown>) => {
    setProcesandoId(id);
    try {
      await accion();
      cargar();
    } finally {
      setProcesandoId(null);
    }
  };

  const cancelar = (s: SuscripcionOneclickInfo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la renovación automática de ${s.clienteNombre} (${s.patente})? Se elimina la tarjeta inscrita en Transbank y no se puede reactivar después.`,
        confirmLabel: "Cancelar suscripción",
        danger: true,
        onConfirm: () => ejecutar(s.id, () => cancelarSuscripcionOneclick(s.id)),
      },
    });
  };

  const suspender = (s: SuscripcionOneclickInfo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Suspender la renovación automática de ${s.clienteNombre} (${s.patente})? Se pausan los cobros, pero la tarjeta queda inscrita y se puede reactivar después.`,
        confirmLabel: "Suspender",
        danger: false,
        onConfirm: () => ejecutar(s.id, () => suspenderSuscripcionOneclick(s.id)),
      },
    });
  };

  const accionesDe = (s: SuscripcionOneclickInfo): MobileRowAction[] => {
    const acciones: MobileRowAction[] = [];
    if (s.estado === "activa") {
      if (s.ultimoCobro?.estado === "rechazada") {
        acciones.push({
          label: "Reintentar cobro",
          disabled: procesandoId === s.id,
          onClick: () => ejecutar(s.id, () => cobrarSuscripcionManual(s.id)),
        });
      }
      acciones.push({ label: "Suspender", disabled: procesandoId === s.id, onClick: () => suspender(s) });
      acciones.push({ label: "Cancelar", destructive: true, disabled: procesandoId === s.id, onClick: () => cancelar(s) });
    } else if (s.estado === "suspendida") {
      acciones.push({
        label: "Reactivar",
        disabled: procesandoId === s.id,
        onClick: () => ejecutar(s.id, () => reactivarSuscripcionOneclick(s.id)),
      });
      acciones.push({ label: "Cancelar", destructive: true, disabled: procesandoId === s.id, onClick: () => cancelar(s) });
    }
    return acciones;
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre o patente..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <select style={{ maxWidth: 170 }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="suspendida">Suspendida</option>
          <option value="pendiente">Pendiente</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {cargando ? (
          <div className="empty">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No hay suscripciones que coincidan</div>
        ) : (
          filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="plate-tag truncate">{s.patente}</span>
                  <span className="truncate text-xs text-muted-foreground">{ESTADO_LABEL[s.estado] || s.estado}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.clienteNombre}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.cardUltimosDigitos ? `${s.cardTipo || ""} ${s.cardUltimosDigitos}` : "Sin tarjeta"}
                  {s.proximoCobro ? ` · Próximo: ${fmtDate(s.proximoCobro)}` : ""}
                </div>
              </div>
              <MobileRowMenu actions={accionesDe(s)} />
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patente</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tarjeta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Próximo cobro</TableHead>
              <TableHead>Último cobro</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargando ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">Cargando...</div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">No hay suscripciones que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="plate-tag">{s.patente}</TableCell>
                  <TableCell>{s.clienteNombre}</TableCell>
                  <TableCell>{s.cardUltimosDigitos ? `${s.cardTipo || ""} ${s.cardUltimosDigitos}` : "-"}</TableCell>
                  <TableCell>
                    <span className={`status-pill ${ESTADO_CLASE[s.estado] || "warn"}`}>{ESTADO_LABEL[s.estado] || s.estado}</span>
                  </TableCell>
                  <TableCell>{s.proximoCobro ? fmtDate(s.proximoCobro) : "-"}</TableCell>
                  <TableCell>
                    {s.ultimoCobro ? `${s.ultimoCobro.estado === "aprobada" ? "Aprobado" : "Rechazado"} — ${fmtDate(s.ultimoCobro.fecha)}` : "-"}
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex flex-wrap items-center gap-1">
                      {s.estado === "activa" && (
                        <>
                          {s.ultimoCobro?.estado === "rechazada" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={procesandoId === s.id}
                              onClick={() => ejecutar(s.id, () => cobrarSuscripcionManual(s.id))}
                            >
                              Reintentar cobro
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" disabled={procesandoId === s.id} onClick={() => suspender(s)}>
                            Suspender
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={procesandoId === s.id}
                            onClick={() => cancelar(s)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                      {s.estado === "suspendida" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={procesandoId === s.id}
                            onClick={() => ejecutar(s.id, () => reactivarSuscripcionOneclick(s.id))}
                          >
                            Reactivar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={procesandoId === s.id}
                            onClick={() => cancelar(s)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
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
