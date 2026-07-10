"use client";

import { useApp } from "@/context/AppContext";
import type { Empresa } from "@/types";

function coincide(e: Empresa, q: string): boolean {
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qRut = q.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    e.razonSocial.toLowerCase().includes(qLower) ||
    (qRut.length > 0 && e.rut.replace(/[^0-9kK]/g, "").toUpperCase().includes(qRut))
  );
}

export default function EmpresasTab() {
  const { data, ui, patchUi, commit } = useApp();

  const q = (ui.search || "").trim();
  const filtered = data.empresas
    .filter((e) => coincide(e, q))
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));

  const eliminar = (e: Empresa) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar a ${e.razonSocial} (${e.rut})? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ empresas: data.empresas.filter((x) => x.id !== e.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por razón social o RUT..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <button className="btn" onClick={() => patchUi({ modal: { type: "empresa", data: null } })}>
          + Nueva empresa
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Razón Social</th>
              <th>RUT</th>
              <th>Giro</th>
              <th>Dirección</th>
              <th>Teléfono</th>
              <th>Contacto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No hay empresas que coincidan</div>
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id}>
                  <td>{e.razonSocial}</td>
                  <td>{e.rut}</td>
                  <td>{e.giro || "-"}</td>
                  <td>{e.direccion || "-"}</td>
                  <td>{e.telefono || "-"}</td>
                  <td>{e.contactoNombre || "-"}</td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => patchUi({ modal: { type: "empresa", data: e } })}>
                      Editar
                    </button>
                    <button className="icon-btn" onClick={() => eliminar(e)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
