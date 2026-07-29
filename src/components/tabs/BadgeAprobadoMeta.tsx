export function BadgeAprobadoMeta({ aprobado }: { aprobado: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: aprobado ? "var(--green)" : "var(--gray)",
      }}
    >
      {aprobado ? "Aprobado en Meta" : "Pendiente en Meta"}
    </span>
  );
}
