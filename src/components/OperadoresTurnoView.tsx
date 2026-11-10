"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { esAdministracionOGerencia, ordenarPerfiles, todayYMD, tramosDelDia } from "@/lib/helpers";
import { fijarOperadorIngresos, obtenerOperadorIngresos } from "@/lib/serverActions";
import type { OperadorIngresos } from "@/types";

/** Operador en turno: Gerencia o Administración eligen al único operador que
 * registra ingresos ahora, y el resto de los operadores ve el aviso en vez del
 * panel de patentes (ver puedeRegistrarIngresos y el backstop en
 * insertIngresos). "Todos" deja a cualquier operador registrar, como antes. */
export default function OperadoresTurnoView() {
  const { data, ui, patchUi, logout } = useApp();
  const puede = esAdministracionOGerencia(ui.perfilActual?.nombre);
  const [estado, setEstado] = useState<OperadorIngresos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const aplicarLectura = (r: OperadorIngresos | null) => {
    setEstado(r);
    setCargando(false);
    if (!r) setMsg({ texto: "No se pudo leer quién está en turno. Intenta recargar.", ok: false });
  };
  useEffect(() => {
    let vivo = true;
    obtenerOperadorIngresos().then((r) => {
      if (vivo) aplicarLectura(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Los operadores del túnel: quien tiene el módulo Operador, sin los perfiles
  // de gestión, que registran siempre. El que está en turno va siempre, aunque
  // después le hayan quitado el módulo, para que se le pueda sacar.
  const habilitadoId = estado?.perfilId ?? null;
  const operadores = ordenarPerfiles(
    data.perfiles.filter(
      (p) => p.id === habilitadoId || (p.modulos.includes("operador") && !esAdministracionOGerencia(p.nombre))
    )
  );
  const hoy = todayYMD();
  const nombreHabilitado = habilitadoId ? data.perfiles.find((p) => p.id === habilitadoId)?.nombre : null;

  const fijar = async (perfilId: string | null) => {
    setGuardando(perfilId ?? "todos");
    setMsg(null);
    const ok = await fijarOperadorIngresos(perfilId);
    setGuardando(null);
    if (!ok) {
      setMsg({ texto: "No se pudo guardar. Intenta de nuevo.", ok: false });
      return;
    }
    const r = await obtenerOperadorIngresos();
    aplicarLectura(r);
    if (!r) return;
    const nombre = perfilId ? data.perfiles.find((p) => p.id === perfilId)?.nombre : null;
    setMsg({
      texto: nombre ? `Listo: ahora solo ${nombre} registra ingresos.` : "Listo: todos los operadores pueden registrar ingresos.",
      ok: true,
    });
  };

  return (
    <>
      <Topbar
        mode={`Operador en turno · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        {!puede ? (
          <div className="empty">Solo Gerencia y Administración pueden gestionar el operador en turno.</div>
        ) : cargando ? (
          <div className="empty">Cargando…</div>
        ) : !estado ? (
          <div className="empty">No se pudo leer quién está en turno. Recarga la página para intentar de nuevo.</div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Quién registra ingresos ahora</h3>
              <p style={{ margin: "4px 0 12px" }}>
                {nombreHabilitado ? (
                  <>
                    Solo <strong>{nombreHabilitado}</strong>. Los demás operadores ven un aviso en vez del panel de patentes.
                  </>
                ) : (
                  "Todos los operadores pueden registrar ingresos."
                )}
              </p>
              {estado?.cambiadoPor && estado.cambiadoEn && (
                <p style={{ margin: "0 0 12px", opacity: 0.7, fontSize: 13 }}>
                  Último cambio: {estado.cambiadoPor},{" "}
                  {new Date(estado.cambiadoEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
              {habilitadoId && (
                <Button variant="outline" disabled={guardando !== null} onClick={() => fijar(null)}>
                  {guardando === "todos" ? "Guardando…" : "Habilitar a todos"}
                </Button>
              )}
              {msg && (
                <div className="err" style={{ marginTop: 10, color: msg.ok ? "var(--green)" : undefined }}>
                  {msg.texto}
                </div>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Turno de hoy</TableHead>
                  <TableHead>Ingresos</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {operadores.map((p) => {
                  const tramos = tramosDelDia(data.turnosFuncionario, p.id, hoy);
                  const habilitado = !habilitadoId || habilitadoId === p.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>
                        {tramos.length ? tramos.map((t) => `${t.horaInicio}–${t.horaFin}`).join(" / ") : "No trabaja hoy"}
                      </TableCell>
                      <TableCell>
                        {habilitadoId === p.id ? (
                          <strong>En turno</strong>
                        ) : habilitado ? (
                          "Habilitado"
                        ) : (
                          "Deshabilitado"
                        )}
                      </TableCell>
                      <TableCell style={{ textAlign: "right" }}>
                        {habilitadoId === p.id ? (
                          <Button variant="outline" size="sm" disabled={guardando !== null} onClick={() => fijar(null)}>
                            {guardando === "todos" ? "Guardando…" : "Quitar (todos registran)"}
                          </Button>
                        ) : (
                          <Button size="sm" disabled={guardando !== null} onClick={() => fijar(p.id)}>
                            {guardando === p.id ? "Guardando…" : "Dejar solo a este"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!operadores.length && (
                  <TableRow>
                    <TableCell colSpan={4}>No hay perfiles con el módulo Operador.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </>
  );
}
