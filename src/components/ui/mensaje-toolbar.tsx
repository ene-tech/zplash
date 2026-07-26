"use client";

// Barras de inserción rápida arriba de las cajas de texto de
// plantillas/mensajes del bot de WhatsApp (ver WebSettingsWhatsappTab y
// WebSettingsWhatsappBotTab): una para emojis y otra para variables
// {{clave}} que la caja acepte, ambas insertando en la posición del cursor.

// Paleta acotada de emojis útiles para mensajes de WhatsApp (saludo, lavado
// de autos, tiempo/ubicación, dinero, confirmaciones).
export const EMOJIS_WHATSAPP = [
  "👋", "🙌", "😊", "🙏", "👍", "🎉", "🎁", "⭐", "❤️", "✅",
  "❌", "⚠️", "🔔", "⏰", "🕒", "📅", "📍", "📲", "📞", "💬",
  "🚗", "🚙", "🧼", "🧽", "💧", "✨", "💰", "💳", "🔧",
];

/** Inserta `texto` en la posición del cursor de `el` (o al final si no hay
 * cursor conocido) y deja el foco/cursor justo después de lo insertado.
 * `valorActual` es el string controlado por React; `setValor` es su setter. */
export function insertarEnCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  valorActual: string,
  texto: string,
  setValor: (v: string) => void
) {
  const start = el?.selectionStart ?? valorActual.length;
  const end = el?.selectionEnd ?? valorActual.length;
  setValor(valorActual.slice(0, start) + texto + valorActual.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const pos = start + texto.length;
    el.setSelectionRange(pos, pos);
  });
}

const botonBase: React.CSSProperties = {
  padding: "3px 7px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "none",
  cursor: "pointer",
};

export function EmojiBar({ onSeleccionar }: { onSeleccionar: (emoji: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
      {EMOJIS_WHATSAPP.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSeleccionar(emoji)}
          title={`Agregar ${emoji}`}
          style={{ ...botonBase, fontSize: 16, lineHeight: 1 }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Fila "Agregar variable" con un botón por cada variable disponible para
 * esa caja de texto (subconjunto propio de cada plantilla/campo del bot).
 * No se muestra si `variables` viene vacío. */
export function VariableBar({ variables, onSeleccionar }: { variables: string[]; onSeleccionar: (placeholder: string) => void }) {
  if (!variables.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 11.5, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Agregar variable:
      </span>
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSeleccionar(`{{${v}}}`)}
          title={`Insertar {{${v}}}`}
          style={{ ...botonBase, fontSize: 12, fontFamily: "monospace" }}
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}
