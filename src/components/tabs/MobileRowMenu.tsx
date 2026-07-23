"use client";

import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface MobileRowAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

// Menú "⋮" compacto para las acciones de fila en la vista de lista mobile de
// las tablas admin — evita repetir varios botones de ícono uno al lado del
// otro en una fila angosta (ver ClientesTab, primera tabla migrada a este patrón).
export default function MobileRowMenu({ actions }: { actions: MobileRowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Más acciones" className="shrink-0" />}>
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a, i) => (
          <DropdownMenuItem key={i} variant={a.destructive ? "destructive" : "default"} disabled={a.disabled} onClick={a.onClick}>
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
