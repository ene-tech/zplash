import type { PreciosPublicos } from "./types";
import { TarjetaAspirado, TarjetaEmpresa, TarjetasPlanes, TarjetasUnicoYPromos } from "./tiposLavado/PreciosLavados";

// Sección Lavados de la landing, en orden de prioridad: lavado único y
// promociones (1, 2 y 4 tickets por Webpay, sin plan), planes mensuales con
// cobro automático Oneclick (X3 y X5), venta empresa (Pack 10/+) y otras
// opciones. Las tarjetas son de PreciosLavados (diseño pricing de 21st.dev).
// Cada grupo lleva su <Subtitulo>; el de lavado único y promociones, destacado.
export default function TiposLavadoTab({ precios }: { precios: PreciosPublicos | null }) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 transform-gpu overflow-hidden blur-3xl"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="mx-auto aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-[var(--gold-relleno)] to-[#ffe08a] opacity-25"
        />
      </div>

      <h2 className="section-title">
        Lavado exterior túnel
        <br />
        <span className="section-title-indent">+ aspirado autoservicio sin límite de tiempo</span>
      </h2>
      <Subtitulo
        destacado
        titulo="Lavado único y promociones"
        bajada="Sin plan ni inscripción: pagas una vez y, mientras más llevas, menos pagas por cada lavado."
      />
      {precios && <TarjetasUnicoYPromos precios={precios} />}

      {precios && (
        <>
          <Subtitulo
            titulo="Planes mensuales · cobro automático"
            bajada="¿Lavas todos los meses? Elige cuántos lavados quieres y se renueva solo con tu tarjeta."
          />
          <TarjetasPlanes precios={precios} />
        </>
      )}

      <Subtitulo titulo="Venta empresa, convenios y familias" bajada="Packs de 10 tickets o más para tu flota o tu familia." />
      <TarjetaEmpresa precios={precios} />

      <Subtitulo titulo="Otras opciones" />
      <TarjetaAspirado precios={precios} />
    </div>
  );
}

// Título de cada grupo de la sección (barra dorada a la izquierda). El primero
// (lavado único y promociones) va destacado: es lo que más se vende.
function Subtitulo({ titulo, bajada, destacado = false }: { titulo: string; bajada?: string; destacado?: boolean }) {
  return (
    <div className={destacado ? "lavados-sub destacado" : "lavados-sub"}>
      <h3>{titulo}</h3>
      {bajada && <p>{bajada}</p>}
    </div>
  );
}
