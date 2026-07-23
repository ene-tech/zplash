"use client";

import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { MODULOS_ADMIN } from "@/lib/helpers";

export default function HubView() {
  const { ui, patchUi, logout } = useApp();
  const modulos = ui.perfilActual?.modulos || [];
  const primerTabAdmin = MODULOS_ADMIN.find((m) => modulos.includes(m));

  return (
    <div className="login-screen">
      <div className="brand">
        <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" unoptimized />
        <div className="sub">Hola, {ui.perfilActual?.nombre}</div>
      </div>
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
      </div>
      <button className="btn ghost" style={{ marginTop: 20 }} onClick={() => logout()}>
        Cerrar sesión
      </button>
    </div>
  );
}
