// Horario semanal recurrente único para todo el negocio (no por profesional
// ni por box, a diferencia de ConsultaPro: un lavadero atiende con capacidad
// de 1 cupo por horario). diaSemana: 0=domingo … 6=sábado.
export interface HorarioAgenda {
  id: string;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

// Excepción puntual al horario habitual: un día completo bloqueado o un
// rango de horas específico dentro de un día.
export interface BloqueoAgenda {
  id: string;
  fecha: string;
  todoElDia: boolean;
  horaInicio?: string;
  horaFin?: string;
  motivo?: string;
  creadoEn: string;
  creadoPor?: string;
}

// Cita agendada desde el Registro de Servicio Adicional. servicioIds son los
// servicios del catálogo ligados a esta visita (equivalente a
// cita_procedimientos en ConsultaPro: una cita puede incluir varios
// servicios, no uno solo) — la app los carga ya resueltos acá para no tener
// que hacer un join aparte en cada pantalla que lista citas.
export interface Cita {
  id: string;
  clienteId?: string;
  servicioIds: string[];
  patente: string;
  nombre: string;
  telefono?: string;
  fechaHora: string;
  duracionMinutos: number;
  // Circuito interno del vehículo: agendado → recibido → en_limpieza →
  // listo_entrega → retirado, con "cancelada"/"no_asistio" como salidas
  // fuera de ese camino feliz (ver validarDisponibilidad en lib/agenda.ts,
  // que solo excluye "cancelada" al chequear choques de horario).
  estado: "agendado" | "recibido" | "en_limpieza" | "listo_entrega" | "retirado" | "cancelada" | "no_asistio";
  notas?: string;
  origen: "interno" | "publico";
  creadoPor?: string;
  creadoEn: string;
}
