"use client";

import { useState } from "react";
import { fmtCLP, formatRut, isValidEmail, isValidPatente, isValidRut, parsearPatentes } from "@/lib/helpers";
import { redirigirAWebpay } from "@/lib/webpayClient";
import { useSesionCliente } from "@/hooks/useSesionCliente";

type TipoDocumento = "Boleta" | "Factura";
type ModoPatente = "abierto" | "lista";

// A diferencia del viejo FormularioCompra (que recibía una cantidad fija por
// pack, ver VentaEmpresaInfoTab hoy retirado), acá la cantidad es libre desde
// `cantidadMinima` — el cliente la elige y el precio se recalcula en vivo con
// `precioUnitario`.
export function FormularioCompraTickets({
  cantidadMinima,
  cantidadMaxima,
  precioUnitario,
}: {
  cantidadMinima: number;
  cantidadMaxima: number;
  precioUnitario: number;
}) {
  const { sesion } = useSesionCliente();
  const patentesPropias = sesion?.vehiculos.map((v) => v.patente) ?? [];
  const [cantidadTexto, setCantidadTexto] = useState(String(cantidadMinima));
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("Boleta");
  const [email, setEmail] = useState("");
  const [nombreLote, setNombreLote] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [rut, setRut] = useState("");
  const [direccion, setDireccion] = useState("");
  const [giro, setGiro] = useState("");
  const [modoPatente, setModoPatente] = useState<ModoPatente>("abierto");
  const [patentesTexto, setPatentesTexto] = useState("");
  const [pagando, setPagando] = useState(false);
  const [err, setErr] = useState("");

  const cantidad = Math.round(Number(cantidadTexto));
  const cantidadValida = Number.isInteger(cantidad) && cantidad >= cantidadMinima && cantidad <= cantidadMaxima;
  const precio = cantidadValida ? Math.round(precioUnitario * cantidad) : 0;

  async function comprar() {
    setErr("");
    if (!cantidadValida) {
      setErr(`Ingresa una cantidad válida, entre ${cantidadMinima} y ${cantidadMaxima} tickets`);
      return;
    }
    if (!isValidEmail(email)) {
      setErr("Ingresa un email válido. Ahí podrás ver tus tickets desde Mi Cuenta.");
      return;
    }
    if (tipoDocumento === "Factura") {
      if (!razonSocial.trim() || !rut.trim() || !direccion.trim() || !giro.trim()) {
        setErr("Completa Razón Social, RUT, Dirección y Giro para la factura");
        return;
      }
      if (!isValidRut(rut)) {
        setErr("RUT inválido. Ej: 12.345.678-9");
        return;
      }
    }
    let patentes: string[] = [];
    if (modoPatente === "lista") {
      patentes = parsearPatentes(patentesTexto);
      const invalida = patentes.find((p) => !isValidPatente(p));
      if (invalida) {
        setErr(`Patente inválida: ${invalida}. Ej: AB1234 o ABCD12.`);
        return;
      }
    }

    setPagando(true);
    try {
      const res = await fetch("/api/pagos/webpay/crear-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cantidad,
          tipoDocumento,
          email: email.trim().toLowerCase(),
          nombreLote: nombreLote.trim() || undefined,
          razonSocial: tipoDocumento === "Factura" ? razonSocial.trim() : undefined,
          rut: tipoDocumento === "Factura" ? rut.trim() : undefined,
          direccion: tipoDocumento === "Factura" ? direccion.trim() : undefined,
          giro: tipoDocumento === "Factura" ? giro.trim() : undefined,
          patentes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo iniciar el pago");
        setPagando(false);
        return;
      }
      redirigirAWebpay(data.url, data.token);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setPagando(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="field">
        <label>Cantidad de tickets</label>
        <input
          type="number"
          min={cantidadMinima}
          max={cantidadMaxima}
          step={1}
          value={cantidadTexto}
          onChange={(e) => setCantidadTexto(e.target.value)}
        />
        <div style={{ color: "var(--gray)", fontSize: 12, marginTop: 4 }}>
          Entre {cantidadMinima} y {cantidadMaxima} tickets, a {fmtCLP(precioUnitario)} c/u.
        </div>
      </div>
      <div className="field">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tucorreo@empresa.cl"
        />
        <div style={{ color: "var(--gray)", fontSize: 12, marginTop: 4 }}>
          Con este correo podrás ver tus tickets desde Mi Cuenta.
        </div>
      </div>
      <div className="field">
        <label>Nombre del lote (opcional)</label>
        <input
          value={nombreLote}
          onChange={(e) => setNombreLote(e.target.value)}
          placeholder='Ej: Lavados rentacar SALFA Mayo'
          maxLength={120}
        />
        <div style={{ color: "var(--gray)", fontSize: 12, marginTop: 4 }}>
          Para reconocer este lote de tickets después, tanto tú como nosotros.
        </div>
      </div>
      <div className="field">
        <label>Tipo de documento</label>
        <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}>
          <option value="Boleta">Boleta</option>
          <option value="Factura">Factura</option>
        </select>
      </div>

      {tipoDocumento === "Factura" && (
        <div>
          <div className="field">
            <label>RUT</label>
            <input
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              onBlur={() => setRut((r) => (isValidRut(r) ? formatRut(r) : r))}
              placeholder="12.345.678-9"
            />
          </div>
          <div className="field">
            <label>Razón Social</label>
            <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
          </div>
          <div className="field">
            <label>Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <div className="field">
            <label>Giro</label>
            <input value={giro} onChange={(e) => setGiro(e.target.value)} />
          </div>
        </div>
      )}

      <div className="field">
        <label>¿Para qué patentes son los tickets?</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={modoPatente === "abierto" ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => setModoPatente("abierto")}
          >
            Dejar abierto (cualquier patente)
          </button>
          <button
            type="button"
            className={modoPatente === "lista" ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => setModoPatente("lista")}
          >
            Ingresar patentes de mi flota
          </button>
        </div>
      </div>
      {modoPatente === "lista" && (
        <div className="field">
          <label>Patentes (una por línea o separadas por coma)</label>
          {patentesPropias.length > 0 && (
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 0, marginBottom: 8, padding: "6px 10px", fontSize: 12.5 }}
              onClick={() => {
                const actuales = parsearPatentes(patentesTexto);
                const combinadas = [...actuales, ...patentesPropias].filter((p, i, arr) => arr.indexOf(p) === i);
                setPatentesTexto(combinadas.join(", "));
              }}
            >
              🚛 Cargar mis patentes registradas ({patentesPropias.length})
            </button>
          )}
          <textarea
            value={patentesTexto}
            onChange={(e) => setPatentesTexto(e.target.value)}
            placeholder={"AB1234\nCD5678"}
            rows={3}
            style={{ textTransform: "uppercase" }}
          />
        </div>
      )}

      <div className="err">{err}</div>
      <button className="btn" onClick={comprar} disabled={pagando}>
        {pagando ? "Redirigiendo..." : `Pagar con Webpay — ${fmtCLP(precio)}`}
      </button>
    </div>
  );
}
