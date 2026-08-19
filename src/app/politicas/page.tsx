import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/cliente/SiteNav";
import { POLITICAS, POLITICAS_VERSION } from "@/lib/politicas";

// Ruta pública (fuera de /cliente, que va noindex por robots.ts): el cliente
// tiene que poder leer y linkear estas políticas sin iniciar sesión, y desde
// el correo o WhatsApp. Contenido estático — no necesita force-dynamic.
export const metadata: Metadata = {
  title: "Políticas de Funcionamiento y Garantía | ZPlash",
  description: "Condiciones del Plan X5, uso del túnel, garantía de relavado, pagos y renovación automática en ZPlash.",
};

export default function PoliticasPage() {
  return (
    <div id="app">
      <SiteNav />

      <div className="content" style={{ maxWidth: 760 }}>
        <h2 className="section-title">Políticas de Funcionamiento y Garantía</h2>
        <p style={{ color: "var(--gray)", fontSize: 13, textAlign: "center", marginBottom: 22 }}>
          Versión {POLITICAS_VERSION.split('-').reverse().join('/')}
        </p>

        {POLITICAS.map((seccion) => (
          <div className="card" key={seccion.titulo} style={{ marginBottom: 18 }}>
            <h3>{seccion.titulo}</h3>
            <ul className="faq-answer-list">
              {seccion.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}

        <Link href="/cliente" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir a Mi Cuenta
        </Link>
      </div>
    </div>
  );
}
