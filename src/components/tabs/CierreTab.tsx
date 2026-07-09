"use client";

import { useApp } from "@/context/AppContext";
import { descargarCierre, descargarFacturables } from "@/lib/actions";
import { fmtCLP, fmtDate, inRange, normPlate, planStatus, tipoIngreso, todayYMD } from "@/lib/helpers";

export default function CierreTab() {
  const { data, ui, patchUi } = useApp();
  const desde = ui.cierreDesde || todayYMD();
  const hasta = ui.cierreHasta || todayYMD();
  const { ingresos, clientes, ventas } = data;

  const ingresosPeriodo = ingresos.filter((i) => inRange(i.fecha, desde, hasta));
  const nuevosPeriodo = clientes.filter((c) => inRange(c.creadoEn, desde, hasta));
  const ventasPeriodo = ventas.filter((v) => inRange(v.fecha, desde, hasta));
  const autosConPlan = ingresosPeriodo.filter((i) => i.planEstadoAlIngreso !== "bad").length;
  const sinPlan = ingresosPeriodo.length - autosConPlan;
  const autosConCupon = ingresosPeriodo.filter((i) => i.viaCupon).length;

  const porCliente: Record<string, { patente: string; nombre: string; cantidad: number }> = {};
  ingresosPeriodo.forEach((i) => {
    const key = i.patente;
    if (!porCliente[key]) porCliente[key] = { patente: i.patente, nombre: i.nombre, cantidad: 0 };
    porCliente[key].cantidad++;
  });
  const listaPorCliente = Object.values(porCliente).sort((a, b) => b.cantidad - a.cantidad);

  const PRODUCTOS = [
    { tipo: "Lavado único", label: "Lavado único" },
    { tipo: "Plan nuevo", label: "Contratación de plan" },
    { tipo: "Renovación preferencial", label: "Renovación temprana" },
    { tipo: "Plan nuevo (Web)", label: "Contratación de plan (Web automático)" },
    { tipo: "Renovación (Web)", label: "Renovación de plan (Web automático)" },
    { tipo: "Cupón Venta Empresa", label: "Cupón Venta Empresa" },
  ];
  const ventasPorTipo = PRODUCTOS.map((p) => {
    const items = ventasPeriodo.filter((v) => v.tipo === p.tipo);
    return { ...p, cantidad: items.length, monto: items.reduce((s, v) => s + (v.precio || 0), 0) };
  });

  const serviciosAdicionalesItems = ventasPeriodo.filter((v) => v.esServicioAdicional);
  const autosServiciosAdicionales = new Set(serviciosAdicionalesItems.map((v) => `${v.patente}|${v.fecha}`)).size;
  const serviciosAdicionalesRow = {
    tipo: "servicios-adicionales",
    label: "Servicios adicionales (detailing, tapiz, motor, chasis, etc.)",
    cantidad: serviciosAdicionalesItems.length,
    monto: serviciosAdicionalesItems.reduce((s, v) => s + (v.precio || 0), 0),
  };

  const filasVenta = [...ventasPorTipo, serviciosAdicionalesRow];
  const totalCantidadVentas = filasVenta.reduce((s, f) => s + f.cantidad, 0);
  const totalMontoVentas = filasVenta.reduce((s, f) => s + f.monto, 0);

  const modificacionesAdminItems = ventasPeriodo.filter((v) => v.tipo === "Renovación manual");
  const modificacionesAdmin = {
    label: "Modificación de planes desde perfil de administrador",
    cantidad: modificacionesAdminItems.length,
    monto: modificacionesAdminItems.reduce((s, v) => s + (v.precio || 0), 0),
  };

  const tiposConocidos = new Set([...PRODUCTOS.map((p) => p.tipo), "Renovación manual"]);
  const otrasVentas = ventasPeriodo.filter((v) => !tiposConocidos.has(v.tipo) && !v.esServicioAdicional);

  const cobrado = (v: (typeof ventasPeriodo)[number]) => v.montoCobrado ?? v.precio ?? 0;
  const efectivoItems = ventasPeriodo.filter((v) => v.metodoPago === "efectivo");
  const tarjetaItems = ventasPeriodo.filter((v) => v.metodoPago === "tarjeta");
  const transferenciaItems = ventasPeriodo.filter((v) => v.metodoPago === "transferencia" && v.estadoPago !== "pendiente");
  const cuentasPorCobrarItems = ventasPeriodo.filter((v) => v.metodoPago === "transferencia" && v.estadoPago === "pendiente");
  const porPagarItems = ventasPeriodo.filter((v) => v.estadoPago === "pendiente" && v.metodoPago !== "transferencia");
  const sinMetodoItems = ventasPeriodo.filter((v) => !v.metodoPago && v.estadoPago !== "pendiente");
  const metodosPago = [
    { metodo: "Efectivo", cantidad: efectivoItems.length, monto: efectivoItems.reduce((s, v) => s + cobrado(v), 0) },
    { metodo: "Tarjeta", cantidad: tarjetaItems.length, monto: tarjetaItems.reduce((s, v) => s + cobrado(v), 0) },
    ...(transferenciaItems.length
      ? [
          {
            metodo: "Transferencia bancaria",
            cantidad: transferenciaItems.length,
            monto: transferenciaItems.reduce((s, v) => s + cobrado(v), 0),
          },
        ]
      : []),
    ...(cuentasPorCobrarItems.length
      ? [
          {
            metodo: "Cuentas por cobrar (transferencia pendiente)",
            cantidad: cuentasPorCobrarItems.length,
            monto: cuentasPorCobrarItems.reduce((s, v) => s + (v.precio || 0), 0),
          },
        ]
      : []),
    ...(porPagarItems.length
      ? [{ metodo: "Por pagar", cantidad: porPagarItems.length, monto: porPagarItems.reduce((s, v) => s + (v.precio || 0), 0) }]
      : []),
    ...(sinMetodoItems.length
      ? [{ metodo: "Sin especificar", cantidad: sinMetodoItems.length, monto: sinMetodoItems.reduce((s, v) => s + (v.precio || 0), 0) }]
      : []),
  ];

  const facturaPendientesPeriodo = clientes
    .filter((c) => c.tipoDocumento === "Factura")
    .map((c) => {
      const ventPeriodo = ventas.filter((v) => v.clienteId === c.id && inRange(v.fecha, desde, hasta));
      return { cliente: c, monto: ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0), cantidad: ventPeriodo.length };
    })
    .filter((x) => x.cantidad > 0);

  const facturasEmpresaPeriodo = ventasPeriodo.filter(
    (v) => v.tipo === "Cupón Venta Empresa" && v.tipoDocumento === "Factura"
  );

  const facturaSearch = (ui.facturaSearch || "").toLowerCase();
  const facturaFiltrados = clientes
    .filter((c) => c.tipoDocumento === "Factura")
    .filter(
      (c) =>
        !facturaSearch ||
        (c.nombre || "").toLowerCase().includes(facturaSearch) ||
        (c.razonSocial || "").toLowerCase().includes(facturaSearch) ||
        (c.rut || "").toLowerCase().includes(facturaSearch) ||
        normPlate(c.patente).includes(normPlate(facturaSearch))
    );

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input
            type="date"
            value={desde}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ cierreDesde: e.target.value })}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input
            type="date"
            value={hasta}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ cierreHasta: e.target.value })}
          />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => patchUi({ cierreDesde: todayYMD(), cierreHasta: todayYMD() })}
        >
          Hoy
        </button>
        <button className="btn" style={{ alignSelf: "flex-end" }} onClick={() => descargarCierre(data, desde, hasta)}>
          Descargar cierre (Excel)
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{ingresosPeriodo.length}</div>
          <div className="lbl">Ingresos en el período</div>
        </div>
        <div className="stat-card">
          <div className="num">{autosConPlan}</div>
          <div className="lbl">Autos con plan vigente</div>
        </div>
        <div className="stat-card">
          <div className="num">{sinPlan}</div>
          <div className="lbl">Autos con plan vencido</div>
        </div>
        <div className="stat-card">
          <div className="num">{nuevosPeriodo.length}</div>
          <div className="lbl">Registros nuevos</div>
        </div>
        <div className="stat-card">
          <div className="num">{ventasPeriodo.length}</div>
          <div className="lbl">Planes vendidos</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Detalle de venta del período</h3>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {filasVenta.map((f) => (
            <tr key={f.tipo}>
              <td>{f.label}</td>
              <td>{f.cantidad}</td>
              <td>{fmtCLP(f.monto)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ fontWeight: 700 }}>Total</td>
            <td style={{ fontWeight: 700 }}>{totalCantidadVentas}</td>
            <td style={{ fontWeight: 700 }}>{fmtCLP(totalMontoVentas)}</td>
          </tr>
          {modificacionesAdmin.cantidad > 0 && (
            <tr>
              <td>{modificacionesAdmin.label}</td>
              <td>{modificacionesAdmin.cantidad}</td>
              <td>{fmtCLP(modificacionesAdmin.monto)}</td>
            </tr>
          )}
          {otrasVentas.length > 0 && (
            <tr>
              <td>Otros</td>
              <td>{otrasVentas.length}</td>
              <td>{fmtCLP(otrasVentas.reduce((s, v) => s + (v.precio || 0), 0))}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Métodos de pago</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Método</th>
            <th>Cantidad</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {metodosPago.map((m) => (
            <tr key={m.metodo}>
              <td>{m.metodo}</td>
              <td>{m.cantidad}</td>
              <td>{fmtCLP(m.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="num">{ingresosPeriodo.length}</div>
          <div className="lbl">Vehículos ingresados</div>
        </div>
        <div className="stat-card">
          <div className="num">{autosServiciosAdicionales}</div>
          <div className="lbl">Autos con servicios adicionales</div>
        </div>
        <div className="stat-card">
          <div className="num">{autosConCupon}</div>
          <div className="lbl">Vehículos con cupón Venta Empresa</div>
        </div>
        <div className="stat-card">
          <div className="num">{facturaPendientesPeriodo.length}</div>
          <div className="lbl">Facturas pendientes de emitir</div>
        </div>
      </div>

      {facturaPendientesPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>
            Clientes esperando documento tributario
          </h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Patente</th>
                <th>Cliente</th>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Monto período</th>
              </tr>
            </thead>
            <tbody>
              {facturaPendientesPeriodo.map(({ cliente: c, monto }) => (
                <tr key={c.id}>
                  <td className="plate-tag">{c.patente}</td>
                  <td>{c.nombre}</td>
                  <td>{c.razonSocial || "-"}</td>
                  <td>{c.rut || "-"}</td>
                  <td>{fmtCLP(monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {facturasEmpresaPeriodo.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>
            Facturas pendientes — Venta Empresa
          </h3>
          <table style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Dirección</th>
                <th>Giro</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {facturasEmpresaPeriodo.map((v) => (
                <tr key={v.id}>
                  <td>{v.nombre}</td>
                  <td>{v.razonSocial || "-"}</td>
                  <td>{v.rut || "-"}</td>
                  <td>{v.direccion || "-"}</td>
                  <td>{v.giro || "-"}</td>
                  <td>{fmtCLP(v.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Ingresos por cliente</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Ingresos en el período</th>
          </tr>
        </thead>
        <tbody>
          {listaPorCliente.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <div className="empty">Sin ingresos en este período</div>
              </td>
            </tr>
          ) : (
            listaPorCliente.map((x) => (
              <tr key={x.patente}>
                <td className="plate-tag">{x.patente}</td>
                <td>{x.nombre}</td>
                <td>{x.cantidad}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Detalle de ingresos</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Estado plan</th>
          </tr>
        </thead>
        <tbody>
          {ingresosPeriodo.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="empty">Sin ingresos en este período</div>
              </td>
            </tr>
          ) : (
            ingresosPeriodo.map((i) => {
              const tipo = tipoIngreso(i);
              return (
                <tr key={i.id}>
                  <td>{fmtDate(i.fecha)}</td>
                  <td className="plate-tag">{i.patente}</td>
                  <td>{i.nombre}</td>
                  <td>
                    <span className={`status-pill ${tipo.cls}`}>{tipo.label}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>
        Clientes con Factura (documentos tributarios)
      </h3>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre, razón social, RUT o patente..."
          value={ui.facturaSearch || ""}
          onChange={(e) => patchUi({ facturaSearch: e.target.value })}
        />
        <button className="btn ghost" onClick={() => descargarFacturables(data, facturaFiltrados, desde, hasta)}>
          Descargar facturables (Excel)
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Razón Social</th>
            <th>RUT</th>
            <th>Giro</th>
            <th>Dirección</th>
            <th>Email</th>
            <th>Ingresos período</th>
            <th>Planes período</th>
            <th>Estado plan</th>
          </tr>
        </thead>
        <tbody>
          {facturaFiltrados.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="empty">
                  No hay clientes con Factura{ui.facturaSearch ? " que coincidan con la búsqueda" : ""}
                </div>
              </td>
            </tr>
          ) : (
            facturaFiltrados.map((c) => {
              const ingPeriodo = ingresos.filter((i) => i.clienteId === c.id && inRange(i.fecha, desde, hasta)).length;
              const ventPeriodo = ventas.filter((v) => v.clienteId === c.id && inRange(v.fecha, desde, hasta));
              const montoVentas = ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0);
              const st = planStatus(c);
              return (
                <tr key={c.id}>
                  <td className="plate-tag">{c.patente}</td>
                  <td>{c.nombre}</td>
                  <td>{c.razonSocial || "-"}</td>
                  <td>{c.rut || "-"}</td>
                  <td>{c.giro || "-"}</td>
                  <td>{c.direccion || "-"}</td>
                  <td>{c.email || "-"}</td>
                  <td>{ingPeriodo}</td>
                  <td>
                    {ventPeriodo.length}
                    {ventPeriodo.length ? " · " + fmtCLP(montoVentas) : ""}
                  </td>
                  <td>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
