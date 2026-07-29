import { fmtTelefono, planProgreso, planStatus, plateEstadoCls } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { ProgressBar } from "@/components/ui/progress-bar";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta } from "@/components/MobileRecordCard";
import { Info, Pencil, Trash2 } from "lucide-react";
import { IconoCambioPatentePendiente } from "./IconoCambioPatentePendiente";

// Mobile: lista compacta de 2-3 líneas por fila en vez de la tabla ancha (que
// en pantallas angostas obligaba a hacer scroll horizontal para llegar a las
// acciones) — así entran muchos más registros por pantalla.
export function ClientesMobileList({
  clientes,
  onInfo,
  onEditar,
  onEliminar,
}: {
  clientes: Cliente[];
  onInfo: (c: Cliente) => void;
  onEditar: (c: Cliente) => void;
  onEliminar: (c: Cliente) => void;
}) {
  return (
    <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
      {clientes.length === 0 ? (
        <div className="empty">No hay clientes que coincidan</div>
      ) : (
        clientes.map((c, idx) => {
          const st = planStatus(c);
          const prog = planProgreso(c);
          return (
            <MobileRecordCard
              key={`${c.id}-${c.patente}-${idx}`}
              title={<span className="mt-1.5 ml-1 block">{c.nombre}</span>}
              subtitle={
                <>
                  <span className={`plate-tag ${plateEstadoCls(c)}`}>{c.patente}</span>{" "}
                  {c.patentePendiente && <IconoCambioPatentePendiente patentePendiente={c.patentePendiente} />} ·{" "}
                  {c.telefono ? fmtTelefono(c.telefono) : "Sin teléfono"}
                </>
              }
              menu={
                <MobileRowMenu
                  actions={[
                    { label: "Información adicional", icon: <Info />, onClick: () => onInfo(c) },
                    { label: "Editar", icon: <Pencil />, onClick: () => onEditar(c) },
                    { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => onEliminar(c) },
                  ]}
                />
              }
              meta={
                <MobileRecordMeta
                  left={<span className={`status-pill ${st.cls}`}>{st.label}</span>}
                  right={
                    <>
                      <div className="font-medium">{c.plan || "Sin plan"}</div>
                      <div className="text-muted-foreground">
                        {c.visitas || 0} visita{c.visitas === 1 ? "" : "s"}
                      </div>
                    </>
                  }
                />
              }
            >
              {prog !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">Plan</span>
                  <ProgressBar value={prog} tone={st.cls} className="flex-1" />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{prog}%</span>
                </div>
              )}
            </MobileRecordCard>
          );
        })
      )}
    </div>
  );
}
