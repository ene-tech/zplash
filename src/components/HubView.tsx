"use client";

import { useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { fmtCLP, inRange, MODULOS_ADMIN, todayYMD } from "@/lib/helpers";

export default function HubView() {
  const { data, ui, patchUi, logout, loadingHistorial } = useApp();
  const modulos = ui.perfilActual?.modulos || [];
  const primerTabAdmin = MODULOS_ADMIN.find((m) => modulos.includes(m));

  // Pulso del día, solo para Gerencia (nombre exacto de perfil, mismo criterio
  // que puedeBorrarCategoriaInventario en helpers/perfiles): no es un módulo
  // aparte, es un vistazo en el menú de inicio a lo que Cierre de Caja ya
  // muestra en detalle.
  const esGerencia = ui.perfilActual?.nombre === "Gerencia";
  const hoy = todayYMD();
  // El corte de las 24 h se fija una sola vez, al montar, con el
  // inicializador perezoso de useState: llamar Date.now() en el cuerpo del
  // componente lo recalculaba en cada re-render, así que el conteo podía
  // cambiar solo porque se abrió un modal.
  const [corte24h] = useState(() => Date.now() - 24 * 3600_000);
  const nuevos24h = esGerencia
    ? data.clientes.filter((c) => new Date(c.creadoEn).getTime() >= corte24h).length
    : 0;
  // Mismo criterio de "plata real" que el Total de "Detalle de venta" en
  // Cierre de Caja (ver useCierreData): las modificaciones de plan hechas
  // desde un perfil de administrador no mueven caja y no suman acá.
  const clientesPorId = new Map(data.clientes.map((c) => [c.id, c]));
  const vendidoHoy = esGerencia
    ? data.ventas
        .filter((v) => inRange(v.fecha, hoy, hoy))
        .filter((v) => !(v.tipo === "Plan nuevo" && clientesPorId.get(v.clienteId)?.creadoPor === "Administrador"))
        .reduce((s, v) => s + (v.precio || 0), 0)
    : 0;

  return (
    <div className="login-screen">
      <div className="brand">
        <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" />
        <div className="sub">Hola, {ui.perfilActual?.nombre}</div>
      </div>
      {esGerencia && (
        <div className="hub-stats">
          <div className="stat-card">
            <div className="num">{nuevos24h}</div>
            <div className="lbl">Clientes nuevos · 24 h</div>
          </div>
          <div className="stat-card">
            <div className="num">{loadingHistorial ? "…" : fmtCLP(vendidoHoy)}</div>
            <div className="lbl">Vendido hoy</div>
          </div>
        </div>
      )}
      <div className="role-grid module-grid">
        {modulos.includes("operador") && (
          <button className="role-btn" onClick={() => patchUi({ view: "operador" })}>
            <div className="icon">🚗</div>
            <div className="label">Operador</div>
            <div className="desc">Validar patente y registrar ingreso</div>
          </button>
        )}
        {modulos.includes("servicios") && (
          <button className="role-btn" onClick={() => patchUi({ view: "servicios" })}>
            <div className="icon">🧽</div>
            <div className="label">Servicios Adicionales</div>
            <div className="desc">Detailing, tapiz, motor, chasis y más</div>
          </button>
        )}
        {primerTabAdmin && (
          <button className="role-btn" onClick={() => patchUi({ view: "admin", adminTab: primerTabAdmin })}>
            <div className="icon">🗂️</div>
            <div className="label">Administrador de ingresos</div>
            <div className="desc">Clientes, historial, cierre de caja y más</div>
          </button>
        )}
        {modulos.includes("contabilidad") && (
          <button className="role-btn" onClick={() => patchUi({ view: "contabilidad" })}>
            <div className="icon">📊</div>
            <div className="label">Contabilidad</div>
            <div className="desc">Ingresos, egresos, cuentas por cobrar y por pagar</div>
          </button>
        )}
        {modulos.includes("inventario") && (
          <button className="role-btn" onClick={() => patchUi({ view: "inventario" })}>
            <div className="icon">📦</div>
            <div className="label">Inventario</div>
            <div className="desc">Productos, SKUs, stock y proveedores</div>
          </button>
        )}
        {modulos.includes("web_settings") && (
          <button className="role-btn" onClick={() => patchUi({ view: "web_settings" })}>
            <div className="icon">🌐</div>
            <div className="label">Web Settings</div>
            <div className="desc">Precios, banners y catálogo autoadministrable de la web</div>
          </button>
        )}
        {modulos.includes("mantencion") && (
          <button className="role-btn" onClick={() => patchUi({ view: "mantencion" })}>
            <div className="icon">🛠️</div>
            <div className="label">Libro de Mantención Maquinaria</div>
            <div className="desc">Máquinas del túnel y bitácora de mantenciones</div>
          </button>
        )}
        {modulos.includes("estanques") && (
          <button className="role-btn" onClick={() => patchUi({ view: "estanques" })}>
            <div className="icon">💧</div>
            <div className="label">Estanques y Válvulas</div>
            <div className="desc">Nivel de agua y químicos, y apertura remota de llaves</div>
          </button>
        )}
        {modulos.includes("funcionario") && (
          <button className="role-btn" onClick={() => patchUi({ view: "funcionario" })}>
            <div className="icon">🧑‍🔧</div>
            <div className="label">Mi Entorno</div>
            <div className="desc">Mi horario, mis tareas del día y mi contrato</div>
          </button>
        )}
        {/* La contracara de Mi Entorno: acá se puebla lo que allá se ve. Gateada
            con "perfiles" y no con un módulo nuevo porque es exactamente el
            permiso que ya exige el servidor para guardar horarios, tareas y
            contratos (ver @/lib/serverActions/funcionario). */}
        {modulos.includes("perfiles") && (
          <button className="role-btn" onClick={() => patchUi({ view: "equipo" })}>
            <div className="icon">🗓️</div>
            <div className="label">Gestión de Equipo</div>
            <div className="desc">Asignar horarios, encargados de zona, tareas y contratos</div>
          </button>
        )}
        {modulos.includes("mensajes") && (
          <button className="role-btn" onClick={() => patchUi({ view: "mensajes" })}>
            <div className="icon">💬</div>
            <div className="label">Mensajes WhatsApp</div>
            <div className="desc">Conversaciones con clientes por WhatsApp</div>
          </button>
        )}
        {modulos.includes("correo") && (
          <button className="role-btn" onClick={() => patchUi({ view: "correo" })}>
            <div className="icon">📧</div>
            <div className="label">Correo</div>
            <div className="desc">Bandeja de entrada de info@zplash.cl</div>
          </button>
        )}
      </div>
      <button className="btn ghost" style={{ marginTop: 20 }} onClick={() => logout()}>
        Cerrar sesión
      </button>
    </div>
  );
}
