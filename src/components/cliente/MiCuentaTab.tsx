"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import { enAppNativa } from "@/lib/appNativa";
import { fmtCLP, fmtDate, fmtFecha, patentesQueRecibenTarjeta } from "@/lib/helpers";
import type { OfertaPlan } from "@/lib/helpers";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import { TicketsYCuponesSection, type CuponCuenta } from "@/components/cliente/miCuenta/TicketsYCuponesSection";
import { VehiculoCard } from "@/components/cliente/miCuenta/VehiculoCard";
import { AgregarPatente } from "@/components/cliente/miCuenta/AgregarPatente";
import { OtpLoginForm } from "@/components/cliente/miCuenta/OtpLoginForm";
import { ActivarNotificaciones } from "@/components/cliente/miCuenta/ActivarNotificaciones";
import { FilaEnVivo } from "@/components/cliente/miCuenta/FilaEnVivo";
import { RenovacionLegacyCard } from "@/components/cliente/miCuenta/RenovacionLegacyCard";
import { AgregarTarjeta } from "@/components/cliente/miCuenta/AgregarTarjeta";
import { EliminarTarjeta } from "@/components/cliente/miCuenta/EliminarTarjeta";
import { PausarTarjeta } from "@/components/cliente/miCuenta/PausarTarjeta";
import { CompartirTarjeta } from "@/components/cliente/miCuenta/CompartirTarjeta";
import { DatosContactoSection } from "@/components/cliente/miCuenta/DatosContactoSection";
import { DatosFacturacionSection } from "@/components/cliente/miCuenta/DatosFacturacionSection";
import { AvisoPoliticas } from "@/components/cliente/miCuenta/AvisoPoliticas";
import { LibroComentarios } from "@/components/cliente/miCuenta/LibroComentarios";
import { PromoModal } from "@/components/cliente/miCuenta/PromoModal";
import { InvitarAmigo, type ReferidosPatente } from "@/components/cliente/miCuenta/InvitarAmigo";
import { EliminarCuenta } from "@/components/cliente/miCuenta/EliminarCuenta";
import Patente from "@/components/cliente/Patente";

interface Tarjeta {
  patente: string;
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
  estado: string;
  proximoCobro: string | null;
}
interface RenovacionLegacy {
  patente: string;
  desde: string;
}
interface Detailing {
  id: string;
  patente: string;
  fechaHora: string;
  estado: string;
  servicios: string[];
}
interface LavadosPeriodo {
  usados: number;
  incluidos: number;
  reponeEl: string;
}
interface Compra {
  fecha: string;
  tipo: string;
  monto: number;
  patente: string;
}

const sinCambios = () => () => {};

function CuentaBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <header className="cuenta-top">
      <div className="cuenta-top-quien">
        <span className="cuenta-avatar" aria-hidden>
          {email.trim().charAt(0).toUpperCase() || "Z"}
        </span>
        <div>
          <strong>{email}</strong>
          <small>Tu cuenta Zplash</small>
        </div>
      </div>
      <button type="button" className="logout-btn" onClick={onLogout}>
        Cerrar sesión
      </button>
    </header>
  );
}

// Resumen de arriba de Mi Cuenta web (look "vidrio", 25-nov-2026)
function ResumenCuenta({ items }: { items: { titulo: string; valor: string; detalle: string; destacado?: boolean }[] }) {
  return (
    <div className="cuenta-resumen">
      {items.map((it) => (
        <article key={it.titulo} className={it.destacado ? "cuenta-metrica destacada" : "cuenta-metrica"}>
          <span className="cuenta-metrica-titulo">{it.titulo}</span>
          <strong className="cuenta-metrica-valor">{it.valor}</strong>
          <span className="cuenta-metrica-detalle">{it.detalle}</span>
        </article>
      ))}
    </div>
  );
}

export default function MiCuentaTab({ registro = false }: { registro?: boolean }) {
  const { sesion, cargando, refrescar, cerrar } = useSesionCliente();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [detailing, setDetailing] = useState<Detailing[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [cupones, setCupones] = useState<CuponCuenta[]>([]);
  const [descuentos, setDescuentos] = useState<Record<string, { codigo: string; beneficio: string; fechaCaducidad?: string; soloWeb?: boolean; soloPlanX3?: boolean }>>({});
  const [renovacionesLegacy, setRenovacionesLegacy] = useState<RenovacionLegacy[]>([]);
  const [ofertas, setOfertas] = useState<Record<string, OfertaPlan>>({});
  // Por patente: le queda el lavado gratis de la promo de reactivación (ver
  // /api/cliente/mi-cuenta). Solo se anuncia junto con una tarjeta activa,
  // que es lo que dispara el cobro que lo emite.
  const [ticketsReactivacion, setTicketsReactivacion] = useState<Record<string, boolean>>({});
  const [lavados, setLavados] = useState<Record<string, LavadosPeriodo>>({});
  // undefined = todavía no llega la respuesta de /api/cliente/mi-cuenta. Sin
  // ese tercer estado el aviso de políticas parpadea en cada carga para quien
  // ya aceptó.
  const [politicasAceptadas, setPoliticasAceptadas] = useState<boolean | undefined>(undefined);
  const [descuentoReferido, setDescuentoReferido] = useState(0);
  const [referidos, setReferidos] = useState<Record<string, ReferidosPatente>>({});

  const cargarMiCuenta = useCallback(() => {
    fetch("/api/cliente/mi-cuenta")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tarjetas: Tarjeta[];
            detailing: Detailing[];
            compras: Compra[];
            renovacionesLegacy: RenovacionLegacy[];
            ofertas: Record<string, OfertaPlan>;
            ticketsReactivacion: Record<string, boolean>;
            lavados: Record<string, LavadosPeriodo>;
            cupones: CuponCuenta[];
            descuentos: Record<string, { codigo: string; beneficio: string; fechaCaducidad?: string; soloWeb?: boolean; soloPlanX3?: boolean }>;
            politicasAceptadas: boolean;
            descuentoReferido: number;
            referidos: Record<string, ReferidosPatente>;
          } | null
        ) => {
          if (!data) return;
          setTarjetas(data.tarjetas);
          setDetailing(data.detailing);
          setCompras(data.compras);
          setRenovacionesLegacy(data.renovacionesLegacy || []);
          setOfertas(data.ofertas || {});
          setTicketsReactivacion(data.ticketsReactivacion || {});
          setLavados(data.lavados || {});
          setCupones(data.cupones || []);
          setDescuentos(data.descuentos || {});
          setPoliticasAceptadas(data.politicasAceptadas);
          setDescuentoReferido(data.descuentoReferido || 0);
          setReferidos(data.referidos || {});
        }
      );
  }, []);

  useEffect(() => {
    if (!sesion) return;
    cargarMiCuenta();
  }, [sesion, cargarMiCuenta]);

  // Dentro de la app nativa Mi Cuenta se reparte en 4 pestañas (Inicio,
  // Comprar, Invita, Cuenta) con barra abajo; la web sigue en una sola página.
  const nativa = useSyncExternalStore(sinCambios, enAppNativa, () => false);
  const [pestana, setPestana] = useState<Pestana>("inicio");
  const [patenteComprar, setPatenteComprar] = useState("");
  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    window.scrollTo({ top: 0 });
  };
  const irAComprar = (patente: string) => {
    setPatenteComprar(patente);
    cambiarPestana("comprar");
  };

  if (cargando) return null;

  if (!sesion) {
    return <OtpLoginForm onSuccess={refrescar} registro={registro} />;
  }

  const tarjetaDe = (patente: string) => {
    // "activa" es cobrable directo (ver cobrarOfertaOneclick), y la
    // pausada por el candado del X5 también: /cobrar-oferta registra la
    // aceptación antes de cobrar y eso la vuelve a activar (ver
    // registrarAceptacionX5). Sin esto el cliente con la tarjeta ya
    // guardada iba a Transbank a digitarla de nuevo. Una "suspendida"
    // sigue guardada pero el cron tampoco la cobra.
    const t = tarjetas.find((x) => x.patente === patente && (x.estado === "activa" || x.estado === "pausada_validacion_x5"));
    return t ? { cardTipo: t.cardTipo, cardUltimosDigitos: t.cardUltimosDigitos } : undefined;
  };

  const vehiculoCard = (v: VehiculoSesion, vista: "completa" | "estado" | "ofertas" = "completa") => (
    <VehiculoCard
      key={v.patente}
      v={v}
      oferta={ofertas[v.patente]}
      ticketReactivacion={!!ticketsReactivacion[v.patente]}
      lavados={lavados[v.patente]}
      descuento={descuentos[v.patente]}
      tarjeta={tarjetaDe(v.patente)}
      // Misma lista que pinta la RenovacionLegacyCard más abajo: ya
      // viene sin los que migraron a una tarjeta Oneclick activa.
      renovacionWoo={renovacionesLegacy.some((r) => r.patente === v.patente)}
      email={sesion.email}
      onActualizado={refrescar}
      vista={vista}
      onVerOpciones={() => irAComprar(v.patente)}
    />
  );

  const sinVehiculos = (
    <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
      No tienes vehículos en tu cuenta.
    </p>
  );

  const resto = (
    <>
      {/* El Detailing se dejó de vender (oct-2026): solo queda el historial de quien tiene. */}
      {detailing.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12 }}>Servicios de Detailing agendados</h3>
          <div className="card-grid" style={{ marginBottom: 26 }}>
            {detailing.map((d) => (
              <div className="vehicle-card" key={d.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Patente patente={d.patente} />
                  <span className={`status-pill ${d.estado === "agendado" ? "warn" : d.estado === "completado" ? "ok" : "bad"}`}>
                    {d.estado === "agendado" ? "Agendado" : d.estado === "completado" ? "Completado" : "Cancelado"}
                  </span>
                </div>
                <div className="plan-nombre">{d.servicios.join(", ")}</div>
                <div style={{ color: "var(--gray)", fontSize: 12.5 }}>{fmtDate(d.fechaHora)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Tarjetas registradas</h3>
        <AgregarTarjeta vehiculos={sesion.vehiculos} emailDefault={sesion.email} />
      </div>
      {tarjetas.length > 0 || renovacionesLegacy.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {tarjetas.map((t) => (
            <div className="vehicle-card" key={t.patente}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Patente patente={t.patente} />
                <span className={`status-pill ${t.estado === "activa" ? "ok" : "warn"}`}>
                  {t.estado === "suspendida"
                    ? "Renovación en pausa"
                    : t.estado === "pausada_validacion_x5"
                      ? "En pausa: falta aceptar el Plan X5"
                      : t.proximoCobro
                        ? "Renovación automática activa"
                        : "Activa"}
                </span>
              </div>
              <div className="plan-nombre">
                {t.cardTipo} terminada en {t.cardUltimosDigitos}
              </div>
              {t.estado === "activa" && (
                <CompartirTarjeta
                  patente={t.patente}
                  // Misma regla que aplica el servidor al copiarla. `tarjetas`
                  // ya viene filtrado a activa/suspendida desde la API.
                  cuantosSinTarjeta={
                    patentesQueRecibenTarjeta(
                      t.patente,
                      sesion.vehiculos.map((v) => v.patente),
                      tarjetas.map((otra) => otra.patente)
                    ).length
                  }
                  onCompartida={cargarMiCuenta}
                />
              )}
              {(t.estado === "activa" || t.estado === "suspendida") && (
                <PausarTarjeta patente={t.patente} pausada={t.estado === "suspendida"} onCambio={cargarMiCuenta} />
              )}
              <EliminarTarjeta patente={t.patente} onEliminada={cargarMiCuenta} />
            </div>
          ))}
          {renovacionesLegacy.map((r) => (
            <RenovacionLegacyCard key={r.patente} patente={r.patente} desde={r.desde} />
          ))}
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
          No tienes tarjetas registradas — usa &quot;+ Agregar tarjeta&quot; arriba para guardar una.
        </p>
      )}

      <DatosFacturacionSection vehiculos={sesion.vehiculos} onActualizado={refrescar} />

      <LibroComentarios />

      <h3 style={{ marginBottom: 12 }}>Historial de compras</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Detalle</th>
              <th>Patente</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c, i) => (
              <tr key={i}>
                <td>{fmtFecha(c.fecha)}</td>
                <td>{c.tipo}</td>
                <td>{c.patente || "—"}</td>
                <td>{fmtCLP(c.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* El aviso de arriba desaparece al aceptar, pero el texto tiene que
          seguir a mano: este enlace queda siempre. */}
      <p style={{ marginTop: 26, fontSize: 13, color: "var(--gray)" }}>
        <a href="/politicas" target="_blank" rel="noopener noreferrer">
          Políticas de Funcionamiento y Garantía
        </a>
      </p>
    </>
  );

  const avisosArriba = (
    <>
      <PromoModal />
      {politicasAceptadas === false && <AvisoPoliticas onAceptado={() => setPoliticasAceptadas(true)} />}
      <ActivarNotificaciones />
      <FilaEnVivo />
    </>
  );
  const invitar = (resumen: boolean) => (
    <InvitarAmigo patentes={sesion.vehiculos.map((v) => v.patente)} valor={descuentoReferido} referidos={referidos} resumen={resumen} />
  );
  const datosContacto = <DatosContactoSection email={sesion.email} telefono={sesion.telefono} onActualizado={refrescar} />;
  const tickets = <TicketsYCuponesSection cupones={cupones} vehiculos={sesion.vehiculos} onAgregado={cargarMiCuenta} />;

  if (nativa) {
    const patenteCompra = sesion.vehiculos.some((v) => v.patente === patenteComprar) ? patenteComprar : sesion.vehiculos[0]?.patente;
    const vCompra = sesion.vehiculos.find((v) => v.patente === patenteCompra);
    return (
      <div className="app-tabs-contenido">
        {pestana === "inicio" && (
          <>
            {avisosArriba}
            <h3 style={{ marginBottom: 12 }}>Tus vehículos</h3>
            {sesion.vehiculos.length > 0 ? (
              <div style={{ display: "grid", gap: 14, marginBottom: 26 }}>{sesion.vehiculos.map((v) => vehiculoCard(v, "estado"))}</div>
            ) : (
              sinVehiculos
            )}
            {tickets}
          </>
        )}
        {pestana === "comprar" && (
          <>
            {sesion.vehiculos.length > 1 && (
              <>
                <div style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Para la patente
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {sesion.vehiculos.map((v) => (
                    <button
                      key={v.patente}
                      type="button"
                      className={v.patente === patenteCompra ? "btn" : "btn ghost"}
                      style={{ marginTop: 0, padding: "6px 14px", fontSize: 13, borderRadius: 999 }}
                      onClick={() => setPatenteComprar(v.patente)}
                    >
                      {v.patente}
                    </button>
                  ))}
                </div>
              </>
            )}
            {vCompra ? vehiculoCard(vCompra, "ofertas") : sinVehiculos}
          </>
        )}
        {pestana === "invita" &&
          (descuentoReferido > 0 && sesion.vehiculos.length > 0 ? (
            invitar(true)
          ) : (
            <p className="card" style={{ color: "var(--gray)", fontSize: 14 }}>
              Agrega un vehículo a tu cuenta para invitar amigos.
            </p>
          ))}
        {pestana === "cuenta" && (
          <>
            {datosContacto}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Mis vehículos</h3>
              <AgregarPatente onAgregado={refrescar} />
            </div>
            {sesion.vehiculos.length > 0 && (
              <div className="card" style={{ marginBottom: 26, display: "grid", gap: 8 }}>
                {sesion.vehiculos.map((v) => (
                  <div key={v.patente} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Patente patente={v.patente} />
                    <span style={{ color: "var(--gray)", fontSize: 13 }}>{v.plan}</span>
                  </div>
                ))}
                <div style={{ color: "var(--gray)", fontSize: 12 }}>Para cambiar o quitar una patente, usa el menú ⋮ de su tarjeta en Inicio.</div>
              </div>
            )}
            {resto}
            <div className="card" style={{ marginTop: 20, display: "grid", gap: 10 }}>
              <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={cerrar}>
                Cerrar sesión
              </button>
              <EliminarCuenta onEliminada={refrescar} />
            </div>
          </>
        )}
        <BarraPestanas actual={pestana} onCambiar={cambiarPestana} />
      </div>
    );
  }

  const alDia = sesion.vehiculos.filter((v) => v.estado.cls === "ok").length;
  const conCobro = tarjetas.filter((t) => t.estado === "activa").length;
  const ultima = compras[0];
  const resumen = [
    {
      titulo: "Vehículos",
      valor: String(sesion.vehiculos.length),
      detalle: sesion.vehiculos.length === 0 ? "Agrega tu patente" : `${alDia} con plan al día`,
      destacado: true,
    },
    { titulo: "Tickets y cupones", valor: String(cupones.length), detalle: cupones.length ? "Listos para usar" : "Sin tickets por ahora" },
    { titulo: "Tarjetas", valor: String(tarjetas.length), detalle: conCobro ? "Renovación automática activa" : "Sin cobro automático" },
    { titulo: "Última compra", valor: ultima ? fmtCLP(ultima.monto) : "—", detalle: ultima ? `${ultima.tipo} · ${fmtFecha(ultima.fecha)}` : "Aún no hay compras" },
  ];

  return (
    <div className="cuenta-glass">
      <CuentaBar email={sesion.email} onLogout={cerrar} />
      <main className="cuenta-stage">
      <div className="cuenta-stage-cabeza">
        <h1>Mi cuenta</h1>
        <p>Tus vehículos, planes, tickets y compras en un solo lugar.</p>
      </div>
      <ResumenCuenta items={resumen} />
      {avisosArriba}
      {tickets}
      {/* "Regala y gana" sacado de Mi Cuenta web el 25-nov-2026 (pedido del dueño); sigue en la pestaña Invita de la app */}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Mis vehículos</h3>
        <AgregarPatente onAgregado={refrescar} />
      </div>
      {sesion.vehiculos.length > 0 ? (
        // minmax más ancho que el .card-grid genérico: la cabecera de VehiculoCard
        // ahora lleva patente + plan + estado en una sola línea, y con columnas de
        // 260px ese texto se trunca demasiado agresivo en pantallas medianas/anchas.
        <div className="card-grid" style={{ marginBottom: 26, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {sesion.vehiculos.map((v) => vehiculoCard(v))}
        </div>
      ) : (
        sinVehiculos
      )}
      {datosContacto}
      {resto}
      <div style={{ marginTop: 10 }}>
        <EliminarCuenta onEliminada={refrescar} />
      </div>
      </main>
    </div>
  );
}

type Pestana = "inicio" | "comprar" | "invita" | "cuenta";

const PESTANAS: { id: Pestana; nombre: string; icono: React.ReactNode }[] = [
  { id: "inicio", nombre: "Inicio", icono: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  {
    id: "comprar",
    nombre: "Comprar",
    icono: (
      <>
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l3 12h11l2-8H6" />
      </>
    ),
  },
  {
    id: "invita",
    nombre: "Invita",
    icono: (
      <>
        <rect x="3" y="8" width="18" height="13" rx="1" />
        <path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1" />
      </>
    ),
  },
  {
    id: "cuenta",
    nombre: "Cuenta",
    icono: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
      </>
    ),
  },
];

function BarraPestanas({ actual, onCambiar }: { actual: Pestana; onCambiar: (p: Pestana) => void }) {
  return (
    <nav className="app-tabs-barra" aria-label="Secciones">
      {PESTANAS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={p.id === actual ? "on" : undefined}
          aria-current={p.id === actual ? "page" : undefined}
          onClick={() => onCambiar(p.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            {p.icono}
          </svg>
          {p.nombre}
        </button>
      ))}
    </nav>
  );
}
