import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Estructura común para una fila de la lista mobile de las tablas admin: fila
// superior con avatar + título/subtítulo + menú de acciones, fila inferior
// con un dato a la izquierda (típicamente estado) y otro a la derecha
// (típicamente monto/fecha) — mismo patrón "avatar | texto | acción" y
// "etiqueta ... valor alineado a la derecha" que una lista de proyectos o
// transacciones en una app mobile, para que la información use todo el
// ancho de la tarjeta en vez de apilarse en líneas sueltas.
export function MobileRecordCard({
  avatar,
  title,
  subtitle,
  menu,
  meta,
  children,
  className,
  hint,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  menu?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn("p-3", className)} title={hint}>
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate leading-tight font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {menu}
      </div>
      {meta}
      {children}
    </div>
  );
}

export function MobileRecordMeta({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0 text-xs">{left}</div>
      {right && <div className="shrink-0 text-right text-xs">{right}</div>}
    </div>
  );
}

const AVATAR_TONE: Record<"ok" | "warn" | "bad" | "info" | "neutral", string> = {
  ok: "bg-[color:var(--green)]/15 text-[color:var(--green)]",
  warn: "bg-[color:var(--gold)]/15 text-[color:var(--gold)]",
  bad: "bg-[color:var(--red)]/15 text-[color:var(--red)]",
  info: "bg-[color:var(--blue)]/15 text-[color:var(--blue)]",
  neutral: "bg-muted text-muted-foreground",
};

export function MobileRecordAvatar({
  icon: Icon,
  tone = "neutral",
}: {
  icon: LucideIcon;
  tone?: keyof typeof AVATAR_TONE;
}) {
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", AVATAR_TONE[tone])}>
      <Icon className="size-5" />
    </div>
  );
}
