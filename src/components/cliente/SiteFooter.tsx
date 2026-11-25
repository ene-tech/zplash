import Link from "next/link";
import { PreferenciasCookiesLink } from "@/components/cliente/AvisoCookies";
import RedesSociales from "@/components/cliente/RedesSociales";

/** Pie mínimo del sitio público: redes sociales, políticas y el link para
 * cambiar la decisión del aviso de cookies. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <RedesSociales className="redes-sociales site-footer-redes" />
      <Link href="/politicas" className="site-footer-link">
        Políticas de Funcionamiento y Garantía
      </Link>
      <Link href="/privacidad" className="site-footer-link">
        Privacidad
      </Link>
      <PreferenciasCookiesLink />
    </footer>
  );
}
