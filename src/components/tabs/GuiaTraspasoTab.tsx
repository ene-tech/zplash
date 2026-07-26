"use client";

import { useGuiaTraspaso } from "@/components/tabs/guiaTraspaso/useGuiaTraspaso";
import { GuiaTraspasoForm } from "@/components/tabs/guiaTraspaso/GuiaTraspasoForm";
import { GuiasDesdeBodegaTabla } from "@/components/tabs/guiaTraspaso/GuiasDesdeBodegaTabla";

export default function GuiaTraspasoTab() {
  const r = useGuiaTraspaso();

  return (
    <div>
      <GuiaTraspasoForm
        ui={r.ui}
        patchUi={r.patchUi}
        destinosActivos={r.destinosActivos}
        origenId={r.origenId}
        destinoId={r.destinoId}
        notas={r.notas}
        setNotas={r.setNotas}
        err={r.err}
        disponibleEnOrigen={r.disponibleEnOrigen}
        productos={r.productos}
        cantidades={r.cantidades}
        setCantidad={r.setCantidad}
        cambiarOrigen={r.cambiarOrigen}
        cambiarDestino={r.cambiarDestino}
        lineas={r.lineas}
        totalUnidades={r.totalUnidades}
        limpiar={r.limpiar}
        guardar={r.guardar}
      />

      <GuiasDesdeBodegaTabla
        guiasDesdeBodega={r.guiasDesdeBodega}
        destinoNombre={r.destinoNombre}
        productoNombre={r.productoNombre}
        puedeBorrar={r.puedeBorrar}
        eliminarGuia={r.eliminarGuia}
      />
    </div>
  );
}
