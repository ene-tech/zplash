import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Lista de filas "etiqueta ... valor" dentro de un contenedor con borde, una
// fila por dato — el mismo patrón de tarjeta de detalle que se ve en apps
// mobile de billetera/trading (ver referencia del módulo Operador). Pensado
// para reemplazar grids de 2 columnas en pantallas angostas, donde una fila
// por dato lee mejor que celdas lado a lado.
export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border rounded-lg border border-border", className)}>{children}</div>;
}

export function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 font-medium", valueClassName)}>{value}</span>
    </div>
  );
}
