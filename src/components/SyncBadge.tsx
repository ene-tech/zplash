"use client";

// En el celular (≤640px) solo se ve el ícono: el texto completo no cabía al
// lado de "OPERADOR · <perfil>" y los dos se montaban. El texto queda en
// title/aria-label para quien lo necesite.
export default function SyncBadge({ storageReady }: { storageReady: boolean }) {
  const texto = storageReady ? "Sincronizado" : "Sin guardado permanente";
  return (
    <span className={`sync-badge ${storageReady ? "cloud" : "local"}`} title={texto} aria-label={texto}>
      {storageReady ? "☁️" : "⚠️"}
      <span className="sync-badge-texto"> {texto}</span>
    </span>
  );
}
