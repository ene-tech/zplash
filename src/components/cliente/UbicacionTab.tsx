const HORARIOS = [
  { dia: "Lunes a viernes", franja: "08:30 - 20:00" },
  { dia: "Sábado, domingo y festivos", franja: "10:00 - 19:00" },
];

const DIRECCION = "Prieto Norte 71, Temuco";
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Prieto+Norte+71%2C+Temuco%2C+Chile";
const WAZE_URL = "https://waze.com/ul?q=Prieto%20Norte%2071%2C%20Temuco%2C%20Chile&navigate=yes";
const WHATSAPP_URL = "https://wa.me/56957969446";

export default function UbicacionTab() {
  return (
    <div className="card-grid">
      <div className="card">
        <h3>📍 Ubicación</h3>
        <p style={{ color: "var(--gray)", fontSize: 14 }}>{DIRECCION}</p>
        <div className="map-actions">
          <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="btn secondary">
            Abrir en Google Maps
          </a>
          <a href={WAZE_URL} target="_blank" rel="noopener noreferrer" className="btn ghost">
            Abrir en Waze
          </a>
        </div>
      </div>
      <div className="card">
        <h3>🕒 Horario de atención</h3>
        <p style={{ color: "var(--gray)", fontSize: 13 }}>Abierto todos los días.</p>
        <div className="hours-table">
          {HORARIOS.map((h) => (
            <div className="hours-row" key={h.dia}>
              <span className="dia">{h.dia}</span>
              <span className="franja">{h.franja}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>💬 Contacto</h3>
        <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
          Escríbenos por WhatsApp o llámanos si tienes dudas sobre tu plan o un lavado.
        </p>
        <div className="map-actions">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn">
            WhatsApp: +56 9 3905 9611
          </a>
        </div>
      </div>
    </div>
  );
}
