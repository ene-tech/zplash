"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUpCircle,
  Clock,
  Droplets,
  Globe,
  KeyRound,
  ListPlus,
  Lock,
  Mail,
  RefreshCw,
  Tag,
  Wind,
  type LucideIcon,
} from "lucide-react";
import {
  AspiradoSection,
  BloqueoSection,
  CorreoFirmaSection,
  CuentaSection,
  HorarioSection,
  LavadoSection,
  PagosWebSection,
  PlanesSection,
  ReactivacionSection,
  ServiciosSection,
  UpgradeSection,
} from "@/components/tabs/config";

const SECCIONES: { id: string; label: string; icon: LucideIcon; Componente: React.ComponentType }[] = [
  { id: "cuenta", label: "Mi cuenta", icon: KeyRound, Componente: CuentaSection },
  { id: "horario", label: "Horario de operador", icon: Clock, Componente: HorarioSection },
  { id: "planes", label: "Precios de planes", icon: Tag, Componente: PlanesSection },
  { id: "reactivacion", label: "Reactivación de vencidos", icon: RefreshCw, Componente: ReactivacionSection },
  { id: "lavado", label: "Lavado túnel", icon: Droplets, Componente: LavadoSection },
  { id: "bloqueo", label: "Bloqueo de reingreso", icon: Lock, Componente: BloqueoSection },
  { id: "aspirado", label: "Zona aspirado", icon: Wind, Componente: AspiradoSection },
  { id: "upgrade", label: "Upgrade a plan", icon: ArrowUpCircle, Componente: UpgradeSection },
  { id: "web", label: "Precios de Lavados en Pagina Web", icon: Globe, Componente: PagosWebSection },
  { id: "servicios", label: "Servicios adicionales", icon: ListPlus, Componente: ServiciosSection },
  { id: "correo", label: "Firma de correo", icon: Mail, Componente: CorreoFirmaSection },
];

export default function ConfigTab() {
  const [seccion, setSeccion] = useState(SECCIONES[0].id);
  const actual = SECCIONES.find((s) => s.id === seccion) || SECCIONES[0];

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav className="flex shrink-0 gap-1 overflow-x-auto pb-1 md:sticky md:top-6 md:w-64 md:flex-col md:overflow-visible md:pb-0">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeccion(s.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              seccion === s.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <s.icon className="size-4 shrink-0" />
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <actual.Componente />
      </div>
    </div>
  );
}
