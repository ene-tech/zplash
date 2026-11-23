"use client";

import { useEffect } from "react";

// El panel (mesón y admin) se queda con el tema oscuro: más contraste al sol y
// menos batería en los celulares del local. El layout raíz pone "tema-claro"
// en <html> para el sitio público; acá se saca mientras el panel esté
// montado. El <script> de admin/layout.tsx lo hace antes del primer pintado
// (carga directa); este efecto cubre la navegación del lado del cliente.
export default function TemaOscuroAdmin() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("tema-claro");
    return () => html.classList.add("tema-claro");
  }, []);
  return null;
}
