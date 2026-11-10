"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { esAdministracionOGerencia, ordenarPerfiles, todayYMD, tramosDelDia } from "@/lib/helpers";
import { fijarOperadorIngresos, obtenerOperadorIngresos } from "@/lib/serverActions";
import type { OperadorIngresos } from "@/types";

/** Operador en turno: Gerencia o Administración eligen qué operadores
 * registran ingresos ahora (uno o varios), y el resto de los operadores ve el
 * aviso en vez del panel de patentes (ver puedeRegistrarIngresos y el
 * backstop en insertIngresos). "Habilitar a todos" vuelve a dejar a
 * cualquier operador registrar, como antes. */
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

  // null = sin restricción (todos registran); lista = solo esos.
  const habilitados = estado?.perfilIds ?? null;
  // Los operadores del túnel: quien tiene el módulo Operador, sin los perfiles
  // de gestión, que registran siempre. Los que están habilitados van siempre,
  // aunque después les hayan quitado el módulo, para que se les pueda sacar.
  const operadores = ordenarPerfiles(
    data.perfiles.filter(
      (p) => habilitados?.includes(p.id) || (p.modulos.includes("operador") && !esAdministracionOGerencia(p.nombre))
    )
  );
  const estaHabilitado = (id: string) => !habilitados || habilitados.includes(id);
  const nombre = (id: string) => data.perfiles.find((p) => p.id === id)?.nombre ?? "";
  const nombresHabilitados = (habilitados ?? []).map(nombre).filter(Boolean);
  const hoy = todayYMD();

  const guardar = async (lista: string[] | null, clave: string) => {
    setGuardando(clave);
    setMsg(null);
    const ok = await fijarOperadorIngresos(lista);
    setGuardando(null);
    if (!ok) {
      setMsg({ texto: "No se pudo guardar. Intenta de nuevo.", ok: false });
      return;
    }
    const r = await obtenerOperadorIngresos();
    aplicarLectura(r);
    if (r) setMsg({ texto: "Listo, guardado.", ok: true });
  };

  // Deshabilitar a uno sin restricción previa = todos los demás siguen.
  const alternar = (id: string) => {
    const base = habilitados ?? operadores.map((p) => p.id);
    const lista = estaHabilitado(id) ? base.filter((x) => x !== id) : [...base, id];
    return guardar(lista, id);
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
                {!habilitados ? (
                  "Todos los operadores pueden registrar ingresos."
                ) : nombresHabilitados.length ? (
                  <>
                    Solo <strong>{nombresHabilitados.join(", ")}</strong>. Los demás operadores ven un aviso en vez del
                    panel de patentes.
                  </>
                ) : (
                  "Ningún operador puede registrar ingresos: solo Gerencia y Administración."
                )}
              </p>
              {estado.cambiadoPor && estado.cambiadoEn && (
                <p style={{ margin: "0 0 12px", opacity: 0.7, fontSize: 13 }}>
                  Último cambio: {estado.cambiadoPor},{" "}
                  {new Date(estado.cambiadoEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
              {habilitados && (
                <Button variant="outline" disabled={guardando !== null} onClick={() => guardar(null, "todos")}>
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
                  const activo = estaHabilitado(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>
                        {tramos.length ? tramos.map((t) => `${t.horaInicio}–${t.horaFin}`).join(" / ") : "No trabaja hoy"}
                      </TableCell>
                      <TableCell>{activo ? <strong>Habilitado</strong> : "Deshabilitado"}</TableCell>
                      <TableCell style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <Button
                          variant={activo ? "outline" : "default"}
                          size="sm"
                          disabled={guardando !== null}
                          onClick={() => alternar(p.id)}
                        >
                          {guardando === p.id ? "Guardando…" : activo ? "Deshabilitar" : "Habilitar"}
                        </Button>{" "}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={guardando !== null}
                          onClick={() => guardar([p.id], `solo-${p.id}`)}
                          title="Deja a este operador como el único que registra ingresos"
                        >
                          {guardando === `solo-${p.id}` ? "Guardando…" : "Solo este"}
                        </Button>
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
