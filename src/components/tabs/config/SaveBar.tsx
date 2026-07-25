"use client";

import { Button } from "@/components/ui/button";

export default function SaveBar({
  saving,
  msg,
  onSave,
  label = "Guardar",
}: {
  saving: boolean;
  msg: { texto: string; ok: boolean } | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={onSave} disabled={saving}>
        {saving ? "Guardando…" : label}
      </Button>
      {msg && (
        <div className="err" style={{ color: msg.ok ? "var(--green)" : undefined }}>
          {msg.texto}
        </div>
      )}
    </div>
  );
}
