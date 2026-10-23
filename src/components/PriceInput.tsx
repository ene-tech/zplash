"use client";

/** `decimales`: acepta hasta 2 decimales con coma (el neto de un producto,
 * que sale de dividir el precio con IVA por 1,19). El valor que entrega usa
 * punto decimal, listo para Number(). */
export default function PriceInput({
  value,
  onChange,
  placeholder = "$0",
  style,
  className,
  decimales = false,
}: {
  value: string;
  onChange: (digitos: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  decimales?: boolean;
}) {
  const [entero, dec] = value.split(".");
  const formateado = value
    ? "$" + Number(entero || 0).toLocaleString("es-CL") + (decimales && dec !== undefined ? "," + dec : "")
    : "";
  const leer = (texto: string) => {
    if (!decimales) return texto.replace(/\D/g, "");
    const coma = texto.indexOf(",");
    if (coma < 0) return texto.replace(/\D/g, "");
    return texto.slice(0, coma).replace(/\D/g, "") + "." + texto.slice(coma + 1).replace(/\D/g, "").slice(0, 2);
  };
  return (
    <input
      inputMode={decimales ? "decimal" : "numeric"}
      value={formateado}
      onChange={(e) => onChange(leer(e.target.value))}
      placeholder={placeholder}
      style={style}
      className={className}
    />
  );
}
