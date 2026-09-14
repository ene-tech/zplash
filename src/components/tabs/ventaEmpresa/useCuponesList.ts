"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { estadoCupon, fmtCLP } from "@/lib/helpers";
import type { Cupon } from "@/types";

export function valorCupon(c: Cupon): string {
  if (c.tipo === "descuento") return c.esPorcentaje ? `${c.valor}%` : fmtCLP(c.valor);
  return c.valor > 0 ? fmtCLP(c.valor) : "Gratis";
}

// Listado de todos los cupones (vale + descuento) generados: búsqueda,
// eliminación, y export a Excel.
export function useCuponesList() {
  const { data, commit, patchUi } = useAppData();
  const [busqueda, setBusqueda] = useState("");

  // Con confirmación: el basurero borraba al primer clic y el 28-ago-2026, al
  // borrar un lote a clics seguidos, se llevó 8 tickets de la Promo
  // Reactivación ya enviados por correo. `email` solo lo tienen los que salieron
  // a un cliente (promo, Pack Empresa web), por eso el aviso extra.
  const eliminar = (cup: Cupon) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el ${cup.tipo === "descuento" ? "descuento" : "ticket"} ${cup.codigo} (${cup.nombreLote})?${
          cup.email ? `\nYa se le envió a ${cup.email}: dejará de funcionar en el local.` : ""
        }`,
        onConfirm: () => {
          commit({ cupones: data.cupones.filter((x) => x.id !== cup.id) });
        },
      },
    });
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
          "Un uso por patente": c.unUsoPorPatente ? "Sí" : "",
          "Solo clientes nuevos": c.soloClientesNuevos ? "Sí" : "",
          "Patente asignada": c.patenteAsignada || "",
          "Patente de uso": c.unUsoPorPatente ? (c.patentesUsadas || []).join(", ") : c.patenteUso || "",
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
                  "Un uso por patente": "",
                  "Solo clientes nuevos": "",
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
