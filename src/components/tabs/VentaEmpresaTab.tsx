"use client";

import { useRef } from "react";
import { useGenerarCupones } from "@/components/tabs/ventaEmpresa/useGenerarCupones";
import { useCrearDescuento } from "@/components/tabs/ventaEmpresa/useCrearDescuento";
import { useCuponesList } from "@/components/tabs/ventaEmpresa/useCuponesList";
import GenerarCuponesForm from "@/components/tabs/ventaEmpresa/GenerarCuponesForm";
import CrearDescuentoForm from "@/components/tabs/ventaEmpresa/CrearDescuentoForm";
import CuponesTable from "@/components/tabs/ventaEmpresa/CuponesTable";

export default function VentaEmpresaTab() {
  const nombreRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);
  const caducidadRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const dNombreRef = useRef<HTMLInputElement>(null);
  const dCaducidadRef = useRef<HTMLInputElement>(null);
  const dPatenteRef = useRef<HTMLInputElement>(null);

  const generarCupones = useGenerarCupones({ nombreRef, cantidadRef, caducidadRef, razonSocialRef, rutRef, direccionRef, giroRef });
  const crearDescuento = useCrearDescuento({ dNombreRef, dCaducidadRef, dPatenteRef });
  const lista = useCuponesList();

  return (
    <div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <GenerarCuponesForm
          {...generarCupones}
          nombreRef={nombreRef}
          cantidadRef={cantidadRef}
          caducidadRef={caducidadRef}
          razonSocialRef={razonSocialRef}
          rutRef={rutRef}
          direccionRef={direccionRef}
          giroRef={giroRef}
        />
        <CrearDescuentoForm {...crearDescuento} dNombreRef={dNombreRef} dCaducidadRef={dCaducidadRef} dPatenteRef={dPatenteRef} />
      </div>

      <div className="toolbar">
        <input placeholder="Buscar por código o nombre..." value={lista.busqueda} onChange={(e) => lista.setBusqueda(e.target.value)} />
        <button className="btn ghost" onClick={lista.descargar}>
          Descargar (Excel)
        </button>
      </div>

      <CuponesTable filtrados={lista.filtrados} eliminar={lista.eliminar} />
    </div>
  );
}
