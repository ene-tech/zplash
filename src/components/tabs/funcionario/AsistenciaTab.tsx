"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  distanciaMetros,
  fmtMinutos,
  marcasDelDia,
  minutosTrabajados,
  proximaMarca,
  todayYMD,
  turnoDelDia,
  TURNO_LABELS,
  uid,
} from "@/lib/helpers";
import type { MarcaAsistencia } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, MapPin } from "lucide-react";

/** Posición del navegador, o null si el funcionario no dio permiso / el GPS no
 * respondió. Rechazar el permiso no bloquea el marcaje: la marca queda
 * registrada sin respaldo de ubicación (ver MarcaAsistencia). */
function pedirUbicacion(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function AsistenciaTab() {
  const { data, ui, commit } = useApp();
  const perfil = ui.perfilActual;
  const hoy = todayYMD();
  const [marcando, setMarcando] = useState(false);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [verEquipo, setVerEquipo] = useState(false);
  const puedeVerEquipo = perfil?.modulos.includes("perfiles") || false;
  const puedeConfigurar = perfil?.modulos.includes("config") || false;

  const misMarcasHoy = useMemo(
    () => (perfil ? marcasDelDia(data.marcasAsistencia, perfil.id, hoy) : []),
    [data.marcasAsistencia, perfil, hoy]
  );
  const siguiente = proximaMarca(misMarcasHoy);
  const { minutos, abierta } = minutosTrabajados(misMarcasHoy);
  const turnoHoy = perfil ? turnoDelDia(data.turnosFuncionario, perfil.id, hoy) : null;

  const historial = useMemo(() => {
    const filas = verEquipo ? data.marcasAsistencia : data.marcasAsistencia.filter((m) => m.perfilId === perfil?.id);
    return filas.slice().sort((a, b) => (a.marcadoEn < b.marcadoEn ? 1 : -1));
  }, [data.marcasAsistencia, verEquipo, perfil]);

  const marcar = async () => {
    if (!perfil) return;
    setMarcando(true);
    setErr(null);
    const pos = await pedirUbicacion();
    const lat = pos?.coords.latitude;
    const lng = pos?.coords.longitude;
    // Se calcula acá solo para pintar el resultado al instante: el valor que
    // queda guardado lo recalcula el servidor (ver insertMarcasAsistencia en
    // @/lib/serverActions/funcionario), que tampoco confía en el perfilId.
    const distanciaM =
      lat != null && lng != null && data.config.localLat != null && data.config.localLng != null
        ? distanciaMetros(lat, lng, data.config.localLat, data.config.localLng)
        : undefined;

    const marca: MarcaAsistencia = {
      id: uid(),
      perfilId: perfil.id,
      perfilNombre: perfil.nombre,
      fecha: hoy,
      tipo: siguiente,
      marcadoEn: new Date().toISOString(),
      lat,
      lng,
      precisionM: pos ? Math.round(pos.coords.accuracy) : undefined,
      distanciaM,
      enElLocal: distanciaM == null ? undefined : distanciaM <= data.config.radioAsistenciaMetros,
    };

    const ok = await commit({ marcasAsistencia: [...data.marcasAsistencia, marca] });
    setMarcando(false);
    if (!ok) {
      setErr({ msg: "No se pudo registrar la marca (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    const detalle = !pos
      ? "Quedó registrada SIN ubicación: no se compartió la geolocalización."
      : distanciaM == null
        ? `Ubicación registrada (±${Math.round(pos.coords.accuracy)} m). Falta configurar la ubicación del local para verificarla.`
        : marca.enElLocal
          ? `Verificada en el local (${distanciaM} m del punto configurado).`
          : `A ${distanciaM} m del local: queda registrada como fuera del lugar de trabajo.`;
    setErr({ msg: `${siguiente === "entrada" ? "Entrada" : "Salida"} marcada. ${detalle}`, ok: pos != null });
  };

  const guardarUbicacionLocal = async () => {
    const pos = await pedirUbicacion();
    if (!pos) {
      setErr({ msg: "No se pudo obtener la ubicación del dispositivo", ok: false });
      return;
    }
    const ok = await commit({
      config: { ...data.config, localLat: pos.coords.latitude, localLng: pos.coords.longitude },
    });
    setErr(
      ok
        ? { msg: `Ubicación del local guardada (±${Math.round(pos.coords.accuracy)} m de precisión).`, ok: true }
        : { msg: "No se pudo guardar la ubicación del local", ok: false }
    );
  };

  const guardarRadio = async (metros: number) => {
    if (!Number.isFinite(metros) || metros < 10) {
      setErr({ msg: "El radio debe ser de al menos 10 metros", ok: false });
      return;
    }
    const ok = await commit({ config: { ...data.config, radioAsistenciaMetros: Math.round(metros) } });
    if (!ok) setErr({ msg: "No se pudo guardar el radio", ok: false });
  };

  if (!perfil) return <div className="empty">Sesión no válida</div>;

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Al marcar, el navegador te pedirá compartir tu ubicación: así queda registrado que estabas en el lugar de
        trabajo. Puedes marcar varias entradas y salidas en el mismo día (turnos partidos, colación).
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="num">{turnoHoy ? TURNO_LABELS[turnoHoy.turno] : "Libre"}</div>
          <div className="lbl">
            {turnoHoy ? `Hoy ${turnoHoy.horaInicio} a ${turnoHoy.horaFin}` : "Hoy no tienes turno asignado"}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtMinutos(minutos)}</div>
          <div className="lbl">{abierta ? "Trabajado hoy (jornada abierta)" : "Trabajado hoy"}</div>
        </div>
        <div className="stat-card">
          <div className="num">{misMarcasHoy.length}</div>
          <div className="lbl">Marcas de hoy</div>
        </div>
      </div>

      <Button size="lg" disabled={marcando} onClick={marcar}>
        {siguiente === "entrada" ? <LogIn /> : <LogOut />}
        {marcando ? "Obteniendo ubicación…" : siguiente === "entrada" ? "Marcar entrada" : "Marcar salida"}
      </Button>

      {err && (
        <div className="err" style={{ color: err.ok ? "var(--green)" : undefined, marginTop: 10 }}>
          {err.msg}
        </div>
      )}

      <h3 style={{ marginTop: 26 }}>Mis marcas de hoy</h3>
      {misMarcasHoy.length === 0 ? (
        <div className="empty">Todavía no marcaste hoy</div>
      ) : (
        <div>
          {misMarcasHoy.map((m) => (
            <div key={m.id} className="log-row">
              <span className={`plate-tag ${m.enElLocal === false ? "bad" : m.enElLocal ? "ok" : "info"}`}>
                {m.tipo === "entrada" ? "Entrada" : "Salida"}
              </span>
              <span style={{ marginLeft: 10 }}>{new Date(m.marcadoEn).toLocaleTimeString("es-CL")}</span>
              <span style={{ marginLeft: 10, color: "var(--gray)", fontSize: 13 }}>
                {m.lat == null
                  ? "sin ubicación"
                  : m.distanciaM == null
                    ? `${m.lat.toFixed(5)}, ${m.lng?.toFixed(5)}`
                    : `${m.distanciaM} m del local`}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        Historial
        {puedeVerEquipo && (
          <label style={{ fontSize: 13, fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={verEquipo} onChange={(e) => setVerEquipo(e.target.checked)} />
            Ver todo el equipo
          </label>
        )}
      </h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              {verEquipo && <TableHead>Funcionario</TableHead>}
              <TableHead>Marca</TableHead>
              <TableHead>Ubicación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={verEquipo ? 5 : 4}>
                  <div className="empty">Sin marcas registradas</div>
                </TableCell>
              </TableRow>
            ) : (
              historial.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.fecha}</TableCell>
                  <TableCell>{new Date(m.marcadoEn).toLocaleTimeString("es-CL")}</TableCell>
                  {verEquipo && <TableCell>{m.perfilNombre}</TableCell>}
                  <TableCell>{m.tipo === "entrada" ? "Entrada" : "Salida"}</TableCell>
                  <TableCell>
                    {m.lat == null
                      ? "Sin ubicación"
                      : m.enElLocal === true
                        ? `En el local (${m.distanciaM} m)`
                        : m.enElLocal === false
                          ? `Fuera del local (${m.distanciaM} m)`
                          : `${m.lat.toFixed(5)}, ${m.lng?.toFixed(5)}`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 6 }}>
        El historial muestra los últimos 90 días.
      </div>

      {puedeConfigurar && (
        <details className="disclosure" style={{ marginTop: 26 }}>
          <summary>Ubicación del local (para validar las marcas)</summary>
          <div className="disclosure-body">
            <div style={{ marginBottom: 10, fontSize: 13, color: "var(--gray)" }}>
              {data.config.localLat != null
                ? `Configurada en ${data.config.localLat.toFixed(5)}, ${data.config.localLng?.toFixed(5)}`
                : "Sin configurar: las marcas se guardan con su posición pero no se puede verificar si fue en el local."}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Button variant="secondary" onClick={guardarUbicacionLocal}>
                <MapPin />
                Usar mi ubicación actual como local
              </Button>
              <div className="field" style={{ minWidth: 160 }}>
                <label>Radio tolerado (metros)</label>
                <input
                  type="number"
                  min={10}
                  defaultValue={data.config.radioAsistenciaMetros}
                  onBlur={(e) => guardarRadio(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
