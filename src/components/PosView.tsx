"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { fmtCLP, isValidPatente, ivaDeBruto, netoDeBruto, normPlate, stockPorDestino } from "@/lib/helpers";
import { registrarVentaPos } from "@/lib/serverActions";
import type { LineaPos } from "@/lib/logic";
import type { Cliente, DatosFacturacion, PagoInfo, Producto } from "@/types";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface LineaCarrito extends LineaPos {
  sku: string;
  detalle: string;
}

const SIN_EMPRESA = "";

export default function PosView() {
  const { data, ui, patchUi, logout, aplicarLocal } = useApp();
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [documento, setDocumento] = useState<"Boleta" | "Factura">("Boleta");
  const [empresaId, setEmpresaId] = useState(SIN_EMPRESA);
  // "invitado" (el que pasa a comprar y no está registrado) o "cliente" (el
  // del lavado). Es una decisión explícita y no un campo que se puede saltar:
  // sin ese dato, un programa de puntos o precios VIP no tiene de dónde
  // agarrarse.
  const [modoCliente, setModoCliente] = useState<"invitado" | "cliente">("invitado");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  // Guard anti doble cobro propio: el `guardando` global solo cubre commit()
  // y este flujo va por registrarVentaPos.
  const [cobrando, setCobrando] = useState(false);
  // El `cobrando` del estado queda capturado en el closure que recibe el modal
  // de pago, así que dentro de cobrar() siempre vale false: el que de verdad
  // corta un segundo disparo es este ref.
  const cobrandoRef = useRef(false);
  const [err, setErr] = useState("");
  const buscadorRef = useRef<HTMLInputElement>(null);

  const activos = useMemo(() => data.productos.filter((p) => p.activo), [data.productos]);

  // El buscador muestra el stock de BODEGA, no el total del producto. La
  // venta descuenta del total (`stock = stock - n`), y el stock por destino se
  // deriva restándole a Bodega lo traspasado a las vending: vender unidades
  // que físicamente están en una vending deja Bodega en negativo. Mostrando
  // acá lo que de verdad hay en el mesón, eso se ve antes de cobrar en vez de
  // aparecer después como un número raro en Inventario.
  const bodega = useMemo(() => data.destinosInventario.find((d) => d.esBodega), [data.destinosInventario]);
  const stockEnBodega = (p: Producto) =>
    bodega
      ? stockPorDestino(p, data.destinosInventario, data.movimientosInventario).get(bodega.id) ?? p.stock
      : p.stock;
  const q = busqueda.trim().toLowerCase();
  const resultados = useMemo(() => {
    if (!q) return [];
    return activos
      .filter((p) => p.codigo.includes(q) || p.sku.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q))
      .slice(0, 12);
  }, [activos, q]);

  const qCliente = buscaCliente.trim().toLowerCase();
  const clientesEncontrados = useMemo(() => {
    if (!qCliente || cliente || modoCliente !== "cliente") return [];
    const patenteBuscada = normPlate(buscaCliente);
    return data.clientes
      .filter(
        (c) =>
          (!!patenteBuscada && normPlate(c.patente).includes(patenteBuscada)) ||
          c.nombre.toLowerCase().includes(qCliente)
      )
      .slice(0, 6);
  }, [data.clientes, qCliente, buscaCliente, cliente, modoCliente]);

  const agregar = (p: Producto) => {
    setErr("");
    setCarrito((prev) => {
      const existente = prev.find((l) => l.productoId === p.id);
      if (existente) {
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, { productoId: p.id, sku: p.sku, detalle: p.detalle, cantidad: 1, precioUnitario: p.valorVenta }];
    });
    setBusqueda("");
    buscadorRef.current?.focus();
  };

  // Enter en el buscador: si hay match exacto de código o SKU (el caso del
  // lector de código de barras, que tipea el código y manda Enter), se
  // agrega directo; si hay un único resultado, también.
  const onBuscadorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !q) return;
    e.preventDefault();
    const exacto = activos.find((p) => p.codigo === q || p.sku.toLowerCase() === q);
    if (exacto) return agregar(exacto);
    if (resultados.length === 1) return agregar(resultados[0]);
  };

  const cambiarCantidad = (productoId: string, cantidad: number) => {
    setCarrito((prev) => prev.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)));
  };
  const cambiarPrecio = (productoId: string, precioUnitario: number) => {
    setCarrito((prev) => prev.map((l) => (l.productoId === productoId ? { ...l, precioUnitario } : l)));
  };
  const quitar = (productoId: string) => setCarrito((prev) => prev.filter((l) => l.productoId !== productoId));

  const total = carrito.reduce((s, l) => s + (l.cantidad || 0) * (l.precioUnitario || 0), 0);
  const unidades = carrito.reduce((s, l) => s + (l.cantidad || 0), 0);
  const empresa = data.empresas.find((e) => e.id === empresaId);

  const datosFactura: DatosFacturacion | undefined =
    documento === "Factura" && empresa
      ? {
          tipoDocumento: "Factura",
          razonSocial: empresa.razonSocial,
          rut: empresa.rut,
          direccion: empresa.direccion,
          giro: empresa.giro,
        }
      : undefined;

  const cobrar = async (pago: PagoInfo) => {
    if (!pago.metodo || cobrandoRef.current) return;
    cobrandoRef.current = true;
    setCobrando(true);
    setErr("");
    try {
      const r = await registrarVentaPos({
        lineas: carrito.map(({ productoId, cantidad, precioUnitario }) => ({ productoId, cantidad, precioUnitario })),
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        clienteId: modoCliente === "cliente" ? cliente?.id : undefined,
        nombre: empresa ? empresa.razonSocial : undefined,
        datosFactura,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      // La transacción ya quedó en la base: acá solo se funde el resultado en
      // el snapshot local (sin re-disparar server actions).
      const productosPorId = new Map(r.productos.map((p) => [p.id, p]));
      aplicarLocal((actual) => ({
        ventas: [r.venta, ...actual.ventas],
        productos: actual.productos.map((p) => productosPorId.get(p.id) || p),
        movimientosContables: r.movimiento
          ? [r.movimiento, ...actual.movimientosContables]
          : actual.movimientosContables,
      }));
      setCarrito([]);
      setDocumento("Boleta");
      setEmpresaId(SIN_EMPRESA);
      setCliente(null);
      setBuscaCliente("");
      setModoCliente("invitado");
      toast.success(`Venta registrada · ${fmtCLP(r.venta.precio)}`);
      buscadorRef.current?.focus();
    } catch (error) {
      // El fetch de la Server Action nunca llegó al servidor (offline): sin
      // este catch el rechazo quedaba sin manejar y el carrito en el limbo.
      console.error("No se pudo registrar la venta", error);
      setErr("No se pudo registrar la venta (sin conexión). El carrito sigue intacto: inténtalo de nuevo.");
    } finally {
      cobrandoRef.current = false;
      setCobrando(false);
    }
  };

  const abrirPago = () => {
    if (!carrito.length || cobrando) return;
    if (documento === "Factura" && !empresa) {
      setErr("Elige la empresa para la factura (o vuelve a Boleta)");
      return;
    }
    if (carrito.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1)) {
      setErr("Revisa las cantidades del carrito");
      return;
    }
    if (total <= 0) {
      setErr("El total es $0: revisa los precios del carrito");
      return;
    }
    if (modoCliente === "cliente" && !cliente) {
      setErr("Elige al cliente o marca la venta como Invitado");
      return;
    }
    setErr("");
    patchUi({
      modal: {
        type: "pago",
        monto: total,
        descripcion: `Venta de productos · ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`,
        onConfirm: cobrar,
      },
    });
  };

  return (
    <>
      <Topbar mode={`POS · ${ui.perfilActual?.nombre || ""}`} onLogout={() => logout()} onBack={() => patchUi({ view: "hub" })} />
      <div className="content">
        {/* Primero: para quién es la venta. Invitado no deja registro de
            quién compra; Cliente la engancha a su ficha del lavado (historial,
            y a futuro puntos y precios preferentes). */}
        <div className="toolbar" style={{ alignItems: "center", flexWrap: "wrap", position: "relative" }}>
          <span style={{ fontSize: 12, color: "var(--gray)", textTransform: "uppercase" }}>Venta para</span>
          <button
            className={modoCliente === "invitado" ? "btn" : "btn ghost"}
            onClick={() => {
              setModoCliente("invitado");
              setCliente(null);
              setBuscaCliente("");
              setErr("");
            }}
          >
            Invitado
          </button>
          <button
            className={modoCliente === "cliente" ? "btn" : "btn ghost"}
            onClick={() => {
              setModoCliente("cliente");
              setErr("");
            }}
          >
            Cliente
          </button>
          {modoCliente === "cliente" &&
            (cliente ? (
              <>
                <strong>
                  {cliente.nombre} · {cliente.patente}
                </strong>
                <button className="btn ghost" onClick={() => setCliente(null)}>
                  Cambiar
                </button>
              </>
            ) : (
              <>
                <input
                  placeholder="Patente o nombre…"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  style={{ maxWidth: 240 }}
                />
                {/* El comprador que todavía no está en el sistema se registra
                    acá mismo, igual que en el túnel, pero sin cobro asociado. */}
                <button
                  className="btn ghost"
                  onClick={() =>
                    patchUi({
                      modal: {
                        type: "client",
                        data: null,
                        contexto: "admin",
                        // El POS no contrata planes: el alta va siempre sin plan.
                        sinPlan: true,
                        patenteInicial: isValidPatente(normPlate(buscaCliente)) ? normPlate(buscaCliente) : undefined,
                        onGuardado: (nuevo) => {
                          setCliente(nuevo);
                          setBuscaCliente("");
                        },
                      },
                    })
                  }
                >
                  + Nuevo cliente
                </button>
              </>
            ))}
          {modoCliente === "invitado" && (
            <span style={{ fontSize: 12, color: "var(--gray)" }}>Sin registro de quién compra</span>
          )}
          {clientesEncontrados.length > 0 && (
            <div className="table-scroll" style={{ position: "absolute", top: "100%", left: 0, zIndex: 5, maxWidth: 320 }}>
              <table>
                <tbody>
                  {clientesEncontrados.map((c) => (
                    <tr
                      key={c.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setCliente(c);
                        setBuscaCliente("");
                      }}
                    >
                      <td>
                        <strong>{c.patente}</strong>
                        <div style={{ fontSize: 12, color: "var(--gray)" }}>{c.nombre}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="toolbar">
          <input
            ref={buscadorRef}
            autoFocus
            placeholder="Buscar producto por código, SKU o nombre… (Enter agrega)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onBuscadorKeyDown}
          />
        </div>

        {q && (
          <div className="table-scroll" style={{ marginBottom: 16 }}>
            {resultados.length === 0 ? (
              <div className="empty">Ningún producto coincide con “{busqueda.trim()}”</div>
            ) : (
              <table>
                <tbody>
                  {resultados.map((p) => (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => agregar(p)}>
                      <td style={{ width: 90 }}>{p.codigo}</td>
                      <td>
                        <strong>{p.sku}</strong>
                        <div style={{ fontSize: 12, color: "var(--gray)" }}>{p.detalle}</div>
                      </td>
                      <td style={{ width: 110 }}>{fmtCLP(p.valorVenta)}</td>
                      <td style={{ width: 110, color: stockEnBodega(p) < p.stockMin ? "var(--red)" : "var(--gray)" }}>
                        {stockEnBodega(p)} en bodega
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Carrito</h3>
        {carrito.length === 0 ? (
          <div className="empty">Escanea o busca un producto para empezar</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ width: 110 }}>Cantidad</th>
                  <th style={{ width: 140 }}>Precio unit.</th>
                  <th style={{ width: 120 }}>Subtotal</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {carrito.map((l) => (
                  <tr key={l.productoId}>
                    <td>
                      <strong>{l.sku}</strong>
                      <div style={{ fontSize: 12, color: "var(--gray)" }}>{l.detalle}</div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={l.cantidad}
                        style={{ maxWidth: 90 }}
                        onChange={(e) => cambiarCantidad(l.productoId, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={l.precioUnitario}
                        style={{ maxWidth: 120 }}
                        onChange={(e) => cambiarPrecio(l.productoId, Number(e.target.value))}
                      />
                    </td>
                    <td>{fmtCLP((l.cantidad || 0) * (l.precioUnitario || 0))}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Quitar"
                        aria-label="Quitar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => quitar(l.productoId)}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Documento</label>
            <select value={documento} onChange={(e) => setDocumento(e.target.value as "Boleta" | "Factura")}>
              <option value="Boleta">Boleta</option>
              <option value="Factura">Factura</option>
            </select>
          </div>
          {documento === "Factura" && (
            <div className="field" style={{ minWidth: 260 }}>
              <label>Empresa</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} style={{ flex: 1 }}>
                  <option value={SIN_EMPRESA}>Elegir empresa…</option>
                  {[...data.empresas]
                    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.razonSocial} · {e.rut}
                      </option>
                    ))}
                </select>
                {/* La empresa que pide factura y no está registrada se crea
                    acá mismo: sin el botón habría que salir del cobro, ir a
                    Empresas y volver a armar el carrito. */}
                <button
                  className="btn ghost"
                  title="Registrar una empresa nueva"
                  onClick={() =>
                    patchUi({ modal: { type: "empresa", data: null, onGuardada: (empresa) => setEmpresaId(empresa.id) } })
                  }
                >
                  + Nueva
                </button>
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            {/* El precio de venta ya viene con IVA: acá se desglosa para la
                factura (neto + IVA = total exacto, sin descuadre). */}
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", fontSize: 12, color: "var(--gray)" }}>
              <span style={{ textTransform: "uppercase" }}>Total neto</span>
              <strong style={{ color: "var(--fg)" }}>{fmtCLP(netoDeBruto(total))}</strong>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", fontSize: 12, color: "var(--gray)" }}>
              <span style={{ textTransform: "uppercase" }}>IVA 19%</span>
              <strong style={{ color: "var(--fg)" }}>{fmtCLP(ivaDeBruto(total))}</strong>
            </div>
            <div style={{ fontSize: 12, color: "var(--gray)", textTransform: "uppercase", marginTop: 4 }}>Total</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtCLP(total)}</div>
          </div>
          <button className="btn" style={{ minWidth: 140 }} disabled={!carrito.length || cobrando} onClick={abrirPago}>
            {cobrando ? "Cobrando…" : "Cobrar"}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </>
  );
}
