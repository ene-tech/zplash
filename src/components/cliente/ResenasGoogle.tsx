import type { ResenaGoogle, ResenasGoogle as Datos } from "@/lib/resenasGoogle";
import { getResenasGoogle } from "@/lib/resenasGoogle";
import { RESENAS_FIJAS, haceCuanto } from "@/lib/resenasGoogleFijas";

// Cinta de reseñas de Google entre la portada y los lavados (26-nov-2026).
// Calificación y comentarios reales de la ficha (ver lib/resenasGoogle); sin
// datos no se pinta nada. Al final, botón para llegar con Google Maps.

const DIRECCION = "Prieto Norte 71, Temuco, Chile";

function Estrellas({ valor, tam = 16 }: { valor: number; tam?: number }) {
  return (
    <span className="resenas-estrellas" role="img" aria-label={`${valor.toLocaleString("es-CL")} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((i) => {
        // Relleno parcial de la última estrella (ej. 4,7 → 70 %)
        const lleno = Math.max(0, Math.min(1, valor - i)) * 100;
        return (
          <svg key={i} width={tam} height={tam} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`est-${i}-${Math.round(lleno)}`}>
                <stop offset={`${lleno}%`} stopColor="#f5b301" />
                <stop offset={`${lleno}%`} stopColor="#d9d3c7" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#est-${i}-${Math.round(lleno)})`}
              d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
            />
          </svg>
        );
      })}
    </span>
  );
}

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Tarjeta({ r }: { r: ResenaGoogle }) {
  return (
    <figure className="resena-tarjeta">
      <figcaption className="resena-autor">
        {r.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.foto} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="resena-inicial" aria-hidden>
            {r.autor.charAt(0).toUpperCase()}
          </span>
        )}
        <span>
          {r.autorUrl ? (
            <a href={r.autorUrl} target="_blank" rel="noopener noreferrer">
              {r.autor}
            </a>
          ) : (
            <strong>{r.autor}</strong>
          )}
          <small>{r.hace}</small>
        </span>
      </figcaption>
      <Estrellas valor={r.estrellas} tam={14} />
      <blockquote>{r.texto}</blockquote>
    </figure>
  );
}

export function CintaResenas({ datos }: { datos: Datos }) {
  const llegar = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DIRECCION)}&destination_place_id=${encodeURIComponent(datos.placeId)}`;
  const nota = datos.rating.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <section className="resenas-google" aria-labelledby="resenas-titulo">
      <div className="resenas-cabeza">
        <div className="resenas-nota">
          <strong className="resenas-numero">{nota}</strong>
          <div>
            <Estrellas valor={datos.rating} tam={22} />
            <a href={datos.fichaUrl} target="_blank" rel="noopener noreferrer" className="resenas-total">
              <LogoGoogle /> {datos.total.toLocaleString("es-CL")} reseñas en Google
            </a>
          </div>
        </div>
        <h2 id="resenas-titulo">Lo que dicen nuestros clientes</h2>
      </div>

      {/* Con menos de 3 comentarios no hay cinta que correr: quedan quietos y centrados */}
      {datos.resenas.length > 0 && datos.resenas.length < 3 && (
        <div className="resenas-quietas">
          {datos.resenas.map((r, i) => (
            <Tarjeta key={i} r={r} />
          ))}
        </div>
      )}
      {datos.resenas.length >= 3 && (
        <div className="resenas-cinta">
          <div className="resenas-pista">
            <div className="resenas-grupo">
              {datos.resenas.map((r, i) => (
                <Tarjeta key={`a${i}`} r={r} />
              ))}
            </div>
            {/* Segunda copia para que la cinta corra sin salto; los lectores de pantalla la saltan */}
            <div className="resenas-grupo" aria-hidden inert>
              {datos.resenas.map((r, i) => (
                <Tarjeta key={`b${i}`} r={r} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="resenas-pie">
        <a href={llegar} target="_blank" rel="noopener noreferrer" className="btn resenas-llegar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          Cómo llegar con Google Maps
        </a>
      </div>
    </section>
  );
}

export default async function ResenasGoogle() {
  const datos = await getResenasGoogle();
  if (!datos) return null;
  // Google no entrega los comentarios de esta ficha: se usan los copiados a
  // mano (reales) mientras la API no traiga ninguno
  const resenas = datos.resenas.length
    ? datos.resenas
    : RESENAS_FIJAS.map((r) => ({ autor: r.autor, estrellas: r.estrellas, texto: r.texto, hace: haceCuanto(r.fecha) }));
  return <CintaResenas datos={{ ...datos, resenas }} />;
}
