import Link from "next/link";
import { PreferenciasCookiesLink } from "@/components/cliente/AvisoCookies";

/** Pie mínimo del sitio público: políticas y el link para cambiar la
 * decisión del aviso de cookies. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/politicas" className="site-footer-link">
        Políticas de Funcionamiento y Garantía
      </Link>
      <PreferenciasCookiesLink />
    </footer>
  );
}
