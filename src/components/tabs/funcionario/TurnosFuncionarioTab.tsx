"use client";

import { useApp } from "@/context/AppContext";
import { DIAS_ORDEN, DIAS_SEMANA, tramosDelDiaSemana, TURNO_LABELS, ZONA_LABELS } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

/** Mi semana, de solo lectura. Quién trabaja qué día, con qué horario y a
 * cargo de qué zona lo asigna Administración desde Gestión de Equipo (ver
 * EquipoView); acá el funcionario solo consulta lo suyo. */
export default function TurnosFuncionarioTab() {
  const { data, ui } = useApp();
  const perfil = ui.perfilActual;
  if (!perfil) return <div className="empty">Sesión no válida</div>;

  const tramosDe = (dia: number) => tramosDelDiaSemana(data.turnosFuncionario, perfil.id, dia);

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Tu turno define qué checklist te toca: con <strong>Apertura</strong> abres el local y con <strong>Cierre</strong>{" "}
        lo cierras (ver la pestaña Mis Tareas). Un día sin turno asignado es día libre. Si el día aparece con dos
        horarios es turno partido: el hueco entre uno y otro es tu colación.
      </div>

      <h3>Mi semana</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Día</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Función</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIAS_ORDEN.map((i) => {
              const dia = DIAS_SEMANA[i];
              const tramos = tramosDe(i);
              return (
                <TableRow key={dia}>
                  <TableCell>{dia}</TableCell>
                  <TableCell>
                    {tramos.length === 0
                      ? "-"
                      : tramos.map((t) => <div key={t.id}>{`${t.horaInicio} a ${t.horaFin}`}</div>)}
                  </TableCell>
                  <TableCell>
                    {tramos.length === 0
                      ? "Libre"
                      : tramos.map((t) => (
                          <div key={t.id}>
                            <span
                              className={`plate-tag ${t.turno === "apertura" ? "ok" : t.turno === "cierre" ? "warn" : "info"}`}
                            >
                              {TURNO_LABELS[t.turno]}
                              {t.zona ? ` · ${ZONA_LABELS[t.zona]}` : ""}
                            </span>
                          </div>
                        ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 10 }}>
        Si algo no cuadra con lo que trabajaste, avísale a Administración: el horario se cambia desde allá.
      </div>
    </div>
  );
}
