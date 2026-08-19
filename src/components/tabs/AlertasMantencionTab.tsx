"use client";

import { useAlertasMantencion } from "@/components/tabs/alertasMantencion/useAlertasMantencion";
import { AgendarAlertaForm } from "@/components/tabs/alertasMantencion/AgendarAlertaForm";
import { CompletarMantencionForm } from "@/components/tabs/alertasMantencion/CompletarMantencionForm";
import { AlertasPendientesTabla } from "@/components/tabs/alertasMantencion/AlertasPendientesTabla";
import { HistorialAlertasTabla } from "@/components/tabs/alertasMantencion/HistorialAlertasTabla";
import { PlanesPorVencerTabla } from "@/components/tabs/alertasMantencion/PlanesPorVencerTabla";

export default function AlertasMantencionTab() {
  const r = useAlertasMantencion();

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Agenda avisos de mantenciones futuras aunque la máquina no tenga periodicidad configurada (ej. &quot;Aseo
        general aire acondicionado&quot; en 8 meses). Cuando se realice, márcala como realizada para que quede en el
        historial de la máquina.
      </div>

      <PlanesPorVencerTabla />

      <AgendarAlertaForm
        maquinariasActivas={r.maquinariasActivas}
        maquinariaId={r.maquinariaId}
        setMaquinariaId={r.setMaquinariaId}
        descripcion={r.descripcion}
        setDescripcion={r.setDescripcion}
        fechaObjetivo={r.fechaObjetivo}
        setFechaObjetivo={r.setFechaObjetivo}
        notas={r.notas}
        setNotas={r.setNotas}
        err={r.err}
        limpiar={r.limpiar}
        agendar={r.agendar}
      />

      {r.completando && (
        <CompletarMantencionForm
          completando={r.completando}
          maquinariaNombre={r.maquinariaNombre}
          responsableCompletar={r.responsableCompletar}
          setResponsableCompletar={r.setResponsableCompletar}
          costoCompletarTexto={r.costoCompletarTexto}
          setCostoCompletarTexto={r.setCostoCompletarTexto}
          onCancelar={() => r.setCompletandoId(null)}
          onConfirmar={r.confirmarCompletar}
        />
      )}

      <AlertasPendientesTabla
        pendientes={r.pendientes}
        maquinariaNombre={r.maquinariaNombre}
        iniciarCompletar={r.iniciarCompletar}
        cancelarAlerta={r.cancelarAlerta}
      />

      <HistorialAlertasTabla
        historial={r.historial}
        maquinariaNombre={r.maquinariaNombre}
        puedeBorrar={r.puedeBorrar}
        eliminarAlerta={r.eliminarAlerta}
      />
    </div>
  );
}
