"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { obtenerLibroComentarios } from "@/lib/serverActions";
import { fmtDate } from "@/lib/helpers";
import { TIPO_LIBRO_LABELS, TIPO_LIBRO_TONE, type LibroComentario } from "@/types";

// Lectura del libro de reclamos, sugerencias y felicitaciones que los
// clientes escriben desde Mi Cuenta (ver LibroComentarios en el portal). No
// vive en AppData: se carga solo al entrar, igual que EstanquesView.
export default function LibroView() {
  const { data, ui, patchUi, logout } = useApp();
  const [comentarios, setComentarios] = useState<LibroComentario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerLibroComentarios()
      .then(setComentarios)
      .catch(() => setComentarios([]))
      .finally(() => setCargando(false));
  }, []);

  // Quién escribió: el libro guarda el email de la sesión de cliente, y un
  // email puede tener varias filas de `clientes` (una por patente) — se
  // muestran todos los nombres/patentes que calcen.
  const clientesPorEmail = useMemo(() => {
    const map = new Map<string, { nombre: string; patente: string }[]>();
    for (const c of data.clientes) {
      const email = (c.email || "").trim().toLowerCase();
      if (!email) continue;
      const lista = map.get(email) || [];
      lista.push({ nombre: c.nombre, patente: c.patente });
      map.set(email, lista);
    }
    return map;
  }, [data.clientes]);

  return (
    <>
      <Topbar
        mode={`Libro de Reclamos y Sugerencias · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        {cargando ? (
          <div className="empty">Cargando el libro…</div>
        ) : comentarios.length === 0 ? (
          <div className="empty">Todavía no hay comentarios en el libro.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {comentarios.map((com) => {
                  const duenos = clientesPorEmail.get(com.email) || [];
                  return (
                    <tr key={com.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(com.creadoEn)}</td>
                      <td>
                        <span className={`status-pill ${TIPO_LIBRO_TONE[com.tipo]}`}>{TIPO_LIBRO_LABELS[com.tipo]}</span>
                      </td>
                      <td>
                        {duenos.length > 0 ? (
                          <div>{duenos.map((d) => `${d.nombre} (${d.patente})`).join(" / ")}</div>
                        ) : null}
                        <div style={{ color: "var(--gray)", fontSize: 12.5 }}>{com.email}</div>
                      </td>
                      <td style={{ whiteSpace: "pre-wrap", maxWidth: 520 }}>{com.mensaje}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
