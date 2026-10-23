"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import {
  brutoDeNeto,
  fmtCLP,
  isValidPatente,
  ivaDeBruto,
  netoDeBruto,
  normPlate,
  stockPorDestino,
} from "@/lib/helpers";
import { cotizarVentaPos, registrarVentaPos, type VentaPosInput } from "@/lib/serverActions";
import { rebajaDescuento, type LineaPos } from "@/lib/logic";
import { anularPosIntegrado } from "@/lib/posIntegrado";
import type { Cliente, DatosFacturacion, PagoInfo, Producto } from "@/types";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import DevolucionPosModal from "@/components/modals/DevolucionPosModal";

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
  // Cobro aprobado en el terminal cuya venta no se pudo guardar por un motivo
  // que no se arregla reintentando: hay que anularlo en el terminal.
  const [porAnular, setPorAnular] = useState<{ operacion?: string; voucher?: string } | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  // Código de descuento (p. ej. el vale a favor de una devolución). Lo valida
  // el servidor (cotizarVentaPos); acá solo se guarda lo necesario para
  // pintar la rebaja mientras se arma el carrito. El cobro lo vuelve a
  // validar y lo quema dentro de la transacción de la venta.
  const [codigoDescuento, setCodigoDescuento] = useState("");
  const [descuento, setDescuento] = useState<{ codigo: string; beneficio: string; valor: number; esPorcentaje: boolean } | null>(null);
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const activos = useMemo(() => data.productos.filter((p) => p.activo), [data.productos]);

  // El buscador muestra el stock de BODEGA, no el total del producto. La
  // venta descuenta del total (`stock = stock - n`), y el stock por destino se
  // deriva restándole a Bodega lo traspasado a las vending: vender unidades
  // que físicamente están en una vending deja Bodega en negativo. Mostrando
  // acá lo que de verdad hay en el mesón, eso se ve antes de cobrar en vez de
  // aparecer después como un número raro en Inventario.
  const bodega = useMemo(() => data.destinosInventario.find((d) => d.esBodega), [data.destinosInventario]);
  const q = busqueda.trim().toLowerCase();
  const resultados = useMemo(() => {
    if (!q) return [];
    return activos
      .filter((p) => p.codigo.includes(q) || p.sku.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q))
      .slice(0, 12);
  }, [activos, q]);
  // stockPorDestino recorre todos los movimientos de inventario: se calcula
  // una vez por resultado de búsqueda, no dos veces por fila en cada render.
  const stockResultados = useMemo(() => {
    const porProducto = new Map<string, number>();
    if (!bodega) return porProducto;
    for (const p of resultados) {
      porProducto.set(p.id, stockPorDestino(p, data.destinosInventario, data.movimientosInventario).get(bodega.id) ?? p.stock);
    }
    return porProducto;
  }, [resultados, bodega, data.destinosInventario, data.movimientosInventario]);
  const stockEnBodega = (p: Producto) => stockResultados.get(p.id) ?? p.stock;

  const qCliente = buscaCliente.trim().toLowerCase();
  const clientesEncontrados = useMemo(() => {
    if (!qCliente || cliente || modoCliente !== "cliente") return [];
    const patenteBuscada = normPlate(buscaCliente);
    // Teléfono por dígitos (se guarda como +569…, se tipea como sea) y desde
    // 4 dígitos, para que una patente con números no traiga medio padrón.
    const digitos = buscaCliente.replace(/\D/g, "");
    // Prioridad de la coincidencia (menor = antes): patente, nombre, y recién
    // después teléfono o correo. Se ordena ANTES de cortar a 6: si no, una
    // patente con 4+ dígitos ("AB1234") podía llenar la lista con teléfonos
    // que contienen esos números y tapar al dueño de la patente.
    const prioridad = (c: Cliente): number => {
      if (patenteBuscada && normPlate(c.patente).includes(patenteBuscada)) return 0;
      if (c.nombre.toLowerCase().includes(qCliente)) return 1;
      if (digitos.length >= 4 && (c.telefono || "").replace(/\D/g, "").includes(digitos)) return 2;
      if (qCliente.includes("@") && (c.email || "").toLowerCase().includes(qCliente)) return 2;
      return -1;
    };
    return data.clientes
      .map((c) => ({ c, p: prioridad(c) }))
      .filter((x) => x.p >= 0)
      .sort((a, b) => a.p - b.p)
      .slice(0, 6)
      .map((x) => x.c);
  }, [data.clientes, qCliente, buscaCliente, cliente, modoCliente]);

  const agregar = (p: Producto) => {
    setErr("");
    setCarrito((prev) => {
      const existente = prev.find((l) => l.productoId === p.id);
      if (existente) {
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, { productoId: p.id, sku: p.sku, detalle: p.detalle, cantidad: 1, precioUnitario: brutoDeNeto(p.valorVenta) }];
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

  const subtotal = carrito.reduce((s, l) => s + (l.cantidad || 0) * (l.precioUnitario || 0), 0);
  // Mismo cálculo que armarVentaPos; el monto que se cobra de verdad lo
  // confirma el servidor antes de abrir el pago.
  const rebaja = rebajaDescuento(descuento, subtotal);
  const total = subtotal - rebaja;
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

  const entradaVenta = (): VentaPosInput => ({
    lineas: carrito.map(({ productoId, cantidad, precioUnitario }) => ({ productoId, cantidad, precioUnitario })),
    clienteId: modoCliente === "cliente" ? cliente?.id : undefined,
    nombre: empresa ? empresa.razonSocial : undefined,
    datosFactura,
    codigoDescuento: descuento?.codigo,
  });

  const quitarDescuento = () => {
    setDescuento(null);
    setCodigoDescuento("");
  };

  const aplicarCodigo = async () => {
    const codigo = codigoDescuento.trim().toUpperCase();
    if (!codigo || validandoCodigo) return;
    if (!carrito.length) {
      setErr("Agrega productos antes de aplicar un código");
      return;
    }
    setValidandoCodigo(true);
    setErr("");
    try {
      const r = await cotizarVentaPos({ ...entradaVenta(), codigoDescuento: codigo });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      if (r.descuento) {
        // Se guarda la regla (monto fijo o %), no el monto: así la rebaja se
        // recalcula sola si el carrito cambia después de aplicar el código.
        const { beneficio, valor, esPorcentaje } = r.descuento;
        setDescuento({ codigo, beneficio, valor, esPorcentaje });
        setCodigoDescuento(codigo);
      }
    } catch (error) {
      console.error("No se pudo validar el código", error);
      setErr("No se pudo validar el código (sin conexión)");
    } finally {
      setValidandoCodigo(false);
    }
  };

  const cobrar = async (pago: PagoInfo, sinCobro = false) => {
    if ((!pago.metodo && !sinCobro) || cobrandoRef.current) return;
    cobrandoRef.current = true;
    setCobrando(true);
    setErr("");
    setPorAnular(null);
    try {
      const r = await registrarVentaPos({
        ...entradaVenta(),
        metodoPago: sinCobro ? undefined : pago.metodo,
        voucher: pago.voucher,
      });
      if (!r.ok) {
        if (!pago.viaTerminal) {
          setErr(r.error);
          return;
        }
        if (r.reintentable) {
          // Falla de red/base: la misma venta puede entrar al reintentar.
          // Cobrar con Tarjeta (manual) y el mismo voucher no vuelve a cobrar.
          setErr(
            `El terminal APROBÓ el cobro (${pago.voucher}) pero la venta no se guardó: ${r.error} Vuelve a Cobrar con Tarjeta (manual) anotando ese voucher, sin pasar la tarjeta de nuevo.`
          );
          return;
        }
        // Rechazo de fondo (código ya usado en otra caja, caja cerrada,
        // cliente borrado): reintentar igual vuelve a fallar, y quitar el
        // código cambia el total, que ya no es lo cobrado. Lo único que sirve
        // es anular el cobro y volver a cobrar con la venta corregida.
        const siguiente = r.porCodigo
          ? "Anula el cobro en el terminal, quita el código y vuelve a cobrar el total nuevo."
          : "Anula el cobro en el terminal; la venta no se puede registrar así.";
        setErr(
          `El terminal APROBÓ el cobro (${pago.voucher}) pero la venta no se pudo registrar: ${r.error} ${siguiente}${
            pago.operacionTerminal ? ` Nº de operación para anular: ${pago.operacionTerminal}.` : ""
          }`
        );
        setPorAnular({ operacion: pago.operacionTerminal, voucher: pago.voucher });
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
        ...(r.cupon ? { cupones: actual.cupones.map((c) => (c.id === r.cupon!.id ? r.cupon! : c)) } : {}),
      }));
      setCarrito([]);
      setDocumento("Boleta");
      setEmpresaId(SIN_EMPRESA);
      setCliente(null);
      setBuscaCliente("");
      setModoCliente("invitado");
      quitarDescuento();
      toast.success(`Venta registrada · ${fmtCLP(r.venta.precio)}`);
      buscadorRef.current?.focus();
    } catch (error) {
      // El fetch de la Server Action nunca llegó al servidor (offline): sin
      // este catch el rechazo quedaba sin manejar y el carrito en el limbo.
      console.error("No se pudo registrar la venta", error);
      setErr(
        pago.viaTerminal
          ? `El terminal APROBÓ el cobro (${pago.voucher}) pero la venta no se guardó (sin conexión). Vuelve a Cobrar con Tarjeta (manual) anotando ese voucher, sin pasar la tarjeta de nuevo.`
          : "No se pudo registrar la venta (sin conexión). El carrito sigue intacto: inténtalo de nuevo."
      );
    } finally {
      cobrandoRef.current = false;
      setCobrando(false);
    }
  };

  const anularEnTerminal = async () => {
    if (!porAnular?.operacion || anulando) return;
    setAnulando(true);
    try {
      const r = await anularPosIntegrado(porAnular.operacion);
      if (!r.ok) {
        setErr(`No se pudo anular la operación ${porAnular.operacion}: ${r.error}`);
        return;
      }
      toast.success(`Cobro anulado en el terminal (op ${porAnular.operacion})`);
      setPorAnular(null);
      setErr("");
    } finally {
      setAnulando(false);
    }
  };

  const abrirPago = async () => {
    if (!carrito.length || cobrando) return;
    if (documento === "Factura" && !empresa) {
      setErr("Elige la empresa para la factura (o vuelve a Boleta)");
      return;
    }
    if (carrito.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1)) {
      setErr("Revisa las cantidades del carrito");
      return;
    }
    if (subtotal <= 0) {
      setErr("El total es $0: revisa los precios del carrito");
      return;
    }
    if (modoCliente === "cliente" && !cliente) {
      setErr("Elige al cliente o marca la venta como Invitado");
      return;
    }
    setErr("");
    // Con código de descuento, el monto a cobrar lo confirma el servidor
    // ANTES de pedir el pago: lo que se manda al terminal o se pide en
    // efectivo tiene que ser exactamente lo que después se graba.
    let monto = total;
    if (descuento) {
      try {
        const r = await cotizarVentaPos(entradaVenta());
        if (!r.ok) {
          setErr(r.error);
          return;
        }
        monto = r.total;
      } catch (error) {
        console.error("No se pudo confirmar el total", error);
        setErr("No se pudo confirmar el total (sin conexión). Inténtalo de nuevo.");
        return;
      }
      if (monto === 0) {
        // El código cubre todo: no hay nada que cobrar.
        await cobrar({}, true);
        return;
      }
    }
    patchUi({
      modal: {
        type: "pago",
        monto,
        terminal: true,
        descripcion: `Venta de productos · ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`,
        onConfirm: cobrar,
      },
    });
  };

  return (
    <>
      {devolviendo && <DevolucionPosModal onCerrar={() => setDevolviendo(false)} />}
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
              setDescuento(null);
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
                  {cliente.nombre} · {cliente.patente || "sin auto"}
                </strong>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setCliente(null);
                    setDescuento(null);
                  }}
                >
                  Cambiar
                </button>
              </>
            ) : (
              <>
                <input
                  placeholder="Patente, nombre, teléfono o correo…"
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
                        // El que compra en la tienda puede no tener auto:
                        // basta nombre y teléfono o correo.
                        permitirSinPatente: true,
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
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={() => setDevolviendo(true)}>
            Devolución
          </button>
          {clientesEncontrados.length > 0 && (
            <div className="table-scroll" style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 20,
                maxWidth: 320,
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,.4)",
              }}>
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
                        <strong>{c.patente || c.nombre}</strong>
                        <div style={{ fontSize: 12, color: "var(--gray)" }}>
                          {c.patente ? c.nombre : `Sin auto · ${c.telefono || c.email || ""}`}
                        </div>
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
                      <td style={{ width: 110 }}>{fmtCLP(brutoDeNeto(p.valorVenta))}</td>
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
          <div className="field" style={{ minWidth: 220 }}>
            <label>Código de descuento</label>
            {descuento ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{descuento.codigo}</strong>
                <span style={{ fontSize: 12, color: "var(--gray)" }}>{descuento.beneficio}</span>
                <button className="btn ghost" onClick={quitarDescuento}>
                  Quitar
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Vale o cupón…"
                  value={codigoDescuento}
                  onChange={(e) => setCodigoDescuento(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      aplicarCodigo();
                    }
                  }}
                  style={{ maxWidth: 140 }}
                />
                <button
                  className="btn ghost"
                  disabled={!codigoDescuento.trim() || validandoCodigo}
                  onClick={aplicarCodigo}
                >
                  {validandoCodigo ? "Validando…" : "Aplicar"}
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            {rebaja > 0 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", fontSize: 12, color: "var(--gray)" }}>
                <span style={{ textTransform: "uppercase" }}>Descuento</span>
                <strong style={{ color: "var(--fg)" }}>−{fmtCLP(rebaja)}</strong>
              </div>
            )}
            {/* El carrito ya va con IVA (ficha neta × 1,19): acá se desglosa
                para la factura (neto + IVA = total exacto, sin descuadre). */}
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
        {porAnular?.operacion && (
          <button className="btn" disabled={anulando} onClick={anularEnTerminal}>
            {anulando ? "Anulando…" : `Anular en el terminal (op ${porAnular.operacion})`}
          </button>
        )}
      </div>
    </>
  );
}
