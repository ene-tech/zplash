import { cn } from "@/lib/utils";
import type { PlanStatusCls } from "@/types";

const TONE_BG: Record<PlanStatusCls, string> = {
  ok: "bg-[color:var(--green)]",
  warn: "bg-[color:var(--gold)]",
  bad: "bg-[color:var(--red)]",
};

/**
 * Barra de progreso con textura a rayas (estilo "asistencia" de apps
 * escolares) usada para el % de días que le quedan al plan de un cliente.
 * Reutiliza el mismo criterio de color ok/warn/bad que .status-pill.
 */
export function ProgressBar({
  value,
  tone = "ok",
  className,
}: {
  value: number;
  tone?: PlanStatusCls;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full bg-[length:8px_8px]", TONE_BG[tone])}
        style={{
          width: `${pct}%`,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0, rgba(255,255,255,.35) 2px, transparent 2px, transparent 5px)",
        }}
      />
    </div>
  );
}
