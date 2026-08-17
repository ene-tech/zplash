"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { estadoCupon, fmtCLP } from "@/lib/helpers";
import type { Cupon } from "@/types";

export function valorCupon(c: Cupon): string {
  if (c.tipo === "descuento") return c.esPorcentaje ? `${c.valor}%` : fmtCLP(c.valor);
  return c.valor > 0 ? fmtCLP(c.valor) : "Gratis";
}

// Listado de todos los cupones (vale + descuento) generados: búsqueda,
// eliminación, y export a Excel.
export function useCuponesList() {
  const { data, commit } = useApp();
  const [busqueda, setBusqueda] = useState("");

  const eliminar = (cup: Cupon) => {
    commit({ cupones: data.cupones.filter((x) => x.id !== cup.id) });
  };

  const q = busqueda.toLowerCase().trim();
  const filtrados = data.cupones
    .filter((c) => !q || c.nombreLote.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

  const descargar = () => {
    import("xlsx").then((XLSX) => {
      const filas = filtrados.map((c) => {
        const est = estadoCupon(c);
        return {
          Código: c.codigo,
          Tipo: c.tipo === "descuento" ? "Descuento" : "Vale",
          "N°": `${c.numeroLote}/${c.totalLote}`,
          Lote: c.nombreLote,
          "Valor c/u": valorCupon(c),
          Caducidad: new Date(c.fechaCaducidad).toLocaleDateString("es-CL"),
          Estado: est.label,
          "Un cupón por patente": c.unCuponPorPatente ? "Sí" : "",
          "Patente asignada": c.patenteAsignada || "",
          "Patente de uso": c.patenteUso || "",
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          filas.length
            ? filas
            : [
                {
                  Código: "",
                  Tipo: "",
                  "N°": "",
                  Lote: "",
                  "Valor c/u": "",
                  Caducidad: "",
                  Estado: "",
                  "Un cupón por patente": "",
                  "Patente asignada": "",
                  "Patente de uso": "",
                },
              ]
        ),
        "Cupones"
      );
      XLSX.writeFile(wb, "cupones-venta-empresa.xlsx");
    });
  };

  return { busqueda, setBusqueda, filtrados, eliminar, descargar };
}
