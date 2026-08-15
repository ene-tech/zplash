import Link from "next/link";
import MiCuentaTab from "@/components/cliente/MiCuentaTab";
import ClienteHeader from "@/components/cliente/ClienteHeader";

// Antes esta página era una segunda "home" pública con pestañas (Ubicación,
// Lavados, Detailing, Empresa, FAQ) que duplicaba el contenido de / y había
// que mantener dos veces. Esas secciones ya viven solo en / (y Detailing se
// sumó ahí); /cliente quedó reducida a lo único que de verdad requiere una
// sesión: la cuenta del cliente. Ya no hay datos vivos que traer server-side
// (MiCuentaTab pide todo por su cuenta), así que no necesita force-dynamic.
export default function ClientePage() {
  return (
    <div id="app">
      <ClienteHeader titulo="Mi Cuenta" ocultarMiCuenta />

      <div className="content">
        {/* Plano (.btn), no el look skeuomórfico de VolverBoton: acá comparte
            fila visual con "Agenda un Servicio de Detailing" (mismo .btn). */}
        <Link href="/" className="btn" style={{ textDecoration: "none", display: "inline-block", marginBottom: 18 }}>
          Volver al inicio
        </Link>
        <MiCuentaTab />
      </div>
    </div>
  );
}
