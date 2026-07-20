"use client";

import { useRef, useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import {
  LAVADO_UNICO_KEY,
  PLANES,
  PLAN_ONECLICK_KEY,
  UPGRADE_PLAN_KEY,
  ZONA_ASPIRADO_KEY,
  precioLavadoUnico,
  precioNormal,
  precioPlanOneclick,
  precioPreferencial,
  precioServicio,
  precioUpgradePlan,
  precioZonaAspirado,
  todayYMD,
  uid,
} from "@/lib/helpers";
import type { ConfigGlobal, TramoRenovacionLocal } from "@/types";

function HorarioOperador() {
  const { data, commit } = useApp();
  const [cfg, setCfg] = useState<ConfigGlobal>(data.config);
  const festivoRef = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const campo = (k: keyof Omit<ConfigGlobal, "festivos">, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  const agregarFestivo = () => {
    const fecha = festivoRef.current?.value;
    if (!fecha || cfg.festivos.includes(fecha)) return;
    setCfg((c) => ({ ...c, festivos: [...c.festivos, fecha].sort() }));
    if (festivoRef.current) festivoRef.current.value = "";
  };

  const quitarFestivo = (fecha: string) => {
    setCfg((c) => ({ ...c, festivos: c.festivos.filter((f) => f !== fecha) }));
  };

  const guardar = async () => {
    if (
      cfg.horarioOperadorSemanaInicio >= cfg.horarioOperadorSemanaFin ||
      cfg.horarioOperadorFindeInicio >= cfg.horarioOperadorFindeFin
    ) {
      setMsg({ texto: "La hora de inicio debe ser anterior a la hora de fin", ok: false });
      return;
    }
    setGuardando(true);
    const ok = await commit({ config: cfg });
    setGuardando(false);
    setMsg({
      texto: ok ? "Horario guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.",
      ok,
    });
  };

  return (
    <div className="modal" style={{ maxWidth: 420, margin: "0 0 20px 0" }}>
      <h3>Horario de registro — Operador</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Fuera de este horario, un operador estándar no puede registrar el ingreso de un vehículo. Administración y
        Gerencia no tienen esta restricción.
      </div>

      <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
        Lunes a viernes
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input
          type="time"
          value={cfg.horarioOperadorSemanaInicio}
          onChange={(e) => campo("horarioOperadorSemanaInicio", e.target.value)}
          style={{ width: 130 }}
        />
        <span style={{ color: "var(--gray)" }}>a</span>
        <input
          type="time"
          value={cfg.horarioOperadorSemanaFin}
          onChange={(e) => campo("horarioOperadorSemanaFin", e.target.value)}
          style={{ width: 130 }}
        />
      </div>

      <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
        Sábado, domingo y festivos
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input
          type="time"
          value={cfg.horarioOperadorFindeInicio}
          onChange={(e) => campo("horarioOperadorFindeInicio", e.target.value)}
          style={{ width: 130 }}
        />
        <span style={{ color: "var(--gray)" }}>a</span>
        <input
          type="time"
          value={cfg.horarioOperadorFindeFin}
          onChange={(e) => campo("horarioOperadorFindeFin", e.target.value)}
          style={{ width: 130 }}
        />
      </div>

      <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
        Festivos
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input ref={festivoRef} type="date" min={todayYMD()} />
        <button className="btn ghost" style={{ marginTop: 0, padding: "3px 10px", fontSize: "0.82rem" }} onClick={agregarFestivo}>
          + Agregar festivo
        </button>
      </div>
      {cfg.festivos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {cfg.festivos.map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>{f}</div>
              <button className="icon-btn" onClick={() => quitarFestivo(f)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="err" style={{ color: msg?.ok ? "var(--green)" : undefined }}>{msg?.texto || ""}</div>
      <button className="btn" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando…" : "Guardar horario"}
      </button>
    </div>
  );
}

export default function ConfigTab() {
  const { data, ui, commit } = useApp();
  const curPinRef = useRef<HTMLInputElement>(null);
  const newPinRef = useRef<HTMLInputElement>(null);
  const [cfgErr, setCfgErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [precioErr, setPrecioErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const catalogoServicios = data.servicios.filter((s) => s.activo);
  const categoriasServicios = Array.from(new Set(catalogoServicios.map((s) => s.categoria || "")));
  const [normalVals, setNormalVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioNormal(data.precios, p))]))
  );
  const [promoVals, setPromoVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLANES.map((p) => [p, String(precioPreferencial(data.precios, p))]))
  );
  const [tramosVals, setTramosVals] = useState<Record<string, TramoRenovacionLocal[]>>(
    () => data.config.tramosRenovacionLocal
  );
  const [lavadoUnicoVal, setLavadoUnicoVal] = useState(() => String(precioLavadoUnico(data.precios)));
  const [zonaAspiradoVal, setZonaAspiradoVal] = useState(() => String(precioZonaAspirado(data.precios)));
  const [planOneclickVal, setPlanOneclickVal] = useState(() => String(precioPlanOneclick(data.precios)));
  const [upgradePlanVal, setUpgradePlanVal] = useState(() => String(precioUpgradePlan(data.precios)));
  const [servicioVals, setServicioVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalogoServicios.map((s) => [s.id, String(precioServicio(data.precios, s.id))]))
  );

  const savePin = async () => {
    const cur = curPinRef.current?.value || "";
    const nw = newPinRef.current?.value || "";
    if (!ui.perfilActual) return;
    if (!nw || nw.length < 6) {
      setCfgErr({ msg: "La nueva contraseña debe tener al menos 6 caracteres", ok: false });
      return;
    }
    const res = await fetch("/api/perfiles/cambiar-clave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorId: ui.perfilActual.id,
        actorClaveActual: cur,
        objetivoId: ui.perfilActual.id,
        claveNueva: nw,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setCfgErr({ msg: json.error || "No se pudo cambiar la contraseña", ok: false });
      return;
    }
    setCfgErr({ msg: "Contraseña actualizada correctamente", ok: true });
    if (curPinRef.current) curPinRef.current.value = "";
    if (newPinRef.current) newPinRef.current.value = "";
  };

  const savePrecios = async () => {
    const precios = { ...data.precios };
    PLANES.forEach((p) => {
      precios[p] = { normal: Number(normalVals[p]) || 0, promo: Number(promoVals[p]) || 0 };
    });
    precios[LAVADO_UNICO_KEY] = { normal: Number(lavadoUnicoVal) || 0, promo: 0 };
    precios[ZONA_ASPIRADO_KEY] = { normal: Number(zonaAspiradoVal) || 0, promo: 0 };
    precios[PLAN_ONECLICK_KEY] = { normal: Number(planOneclickVal) || 0, promo: 0 };
    precios[UPGRADE_PLAN_KEY] = { normal: Number(upgradePlanVal) || 0, promo: 0 };
    catalogoServicios.forEach((s) => {
      precios[s.id] = { normal: Number(servicioVals[s.id]) || 0, promo: 0 };
    });
    await commit({ precios, config: { ...data.config, tramosRenovacionLocal: tramosVals } });
    setPrecioErr({ msg: "Precios actualizados correctamente", ok: true });
  };

  const agregarTramo = (plan: string) => {
    setTramosVals((cur) => ({
      ...cur,
      [plan]: [...(cur[plan] || []), { id: uid(), visitasMin: 0, visitasMax: null, precio: 0 }],
    }));
  };

  const quitarTramo = (plan: string, id: string) => {
    setTramosVals((cur) => ({ ...cur, [plan]: (cur[plan] || []).filter((t) => t.id !== id) }));
  };

  const editarTramo = (plan: string, id: string, cambios: Partial<TramoRenovacionLocal>) => {
    setTramosVals((cur) => ({
      ...cur,
      [plan]: (cur[plan] || []).map((t) => (t.id === id ? { ...t, ...cambios } : t)),
    }));
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 420, margin: "0 0 20px 0" }}>
        <h3>Cambiar mi contraseña ({ui.perfilActual?.nombre})</h3>
        <div className="field">
          <label>Contraseña actual</label>
          <input ref={curPinRef} type="password" />
        </div>
        <div className="field">
          <label>Contraseña nueva</label>
          <input ref={newPinRef} type="password" maxLength={12} />
        </div>
        <div className="err" style={{ color: cfgErr?.ok ? "var(--green)" : undefined }}>
          {cfgErr?.msg || ""}
        </div>
        <button className="btn" onClick={savePin}>
          Guardar
        </button>
      </div>
      <HorarioOperador />
      <div className="modal" style={{ maxWidth: 420, margin: 0 }}>
        <h3>Precios y renovación preferencial</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Estos valores se usan para mostrar la oferta de renovación al operador cuando un plan está por vencer.
        </div>
        {PLANES.map((p) => (
          <div key={p}>
            <div className="field">
              <label>Precio normal — {p}</label>
              <PriceInput
                value={normalVals[p] ?? ""}
                onChange={(v) => setNormalVals((cur) => ({ ...cur, [p]: v }))}
              />
            </div>
            <div className="field">
              <label>Precio promoción de renovación — {p}</label>
              <PriceInput
                value={promoVals[p] ?? ""}
                onChange={(v) => setPromoVals((cur) => ({ ...cur, [p]: v }))}
              />
            </div>

            <div
              className="hint"
              style={{ textAlign: "left", marginTop: 10, marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}
            >
              Renovación preferencial por visitas — {p} (clientes Local)
            </div>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 10 }}>
              Ofrece un precio distinto al de arriba según cuántas veces ha pasado el cliente por el local (ej:
              $16.990 para quienes pasaron 0 o 1 vez). Si un cliente no cae en ningún tramo, se usa el precio de
              promoción de renovación de arriba. No aplica a clientes Web.
            </div>
            {(tramosVals[p] || []).map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    value={t.visitasMin}
                    onChange={(e) => editarTramo(p, t.id, { visitasMin: Number(e.target.value) || 0 })}
                    style={{ width: 60 }}
                  />
                  <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={t.visitasMax ?? ""}
                    onChange={(e) =>
                      editarTramo(p, t.id, { visitasMax: e.target.value === "" ? null : Number(e.target.value) || 0 })
                    }
                    style={{ width: 60 }}
                  />
                  <span style={{ color: "var(--gray)", fontSize: 13 }}>visitas</span>
                </div>
                <PriceInput
                  value={String(t.precio)}
                  onChange={(v) => editarTramo(p, t.id, { precio: Number(v) || 0 })}
                  style={{ flex: 1 }}
                />
                <button className="icon-btn" onClick={() => quitarTramo(p, t.id)}>
                  Quitar
                </button>
              </div>
            ))}
            <button
              className="btn ghost"
              style={{ marginTop: 0, padding: "3px 10px", fontSize: "0.82rem" }}
              onClick={() => agregarTramo(p)}
            >
              + Agregar tramo
            </button>
          </div>
        ))}

        <h3 style={{ marginTop: 22 }}>Lavado túnel (sin plan)</h3>
        <div className="field">
          <label>Precio lavado único</label>
          <PriceInput value={lavadoUnicoVal} onChange={setLavadoUnicoVal} />
        </div>

        <h3 style={{ marginTop: 22 }}>Uso Zona Aspirado Autoservicio</h3>
        <div className="field">
          <label>Precio uso puntual</label>
          <PriceInput value={zonaAspiradoVal} onChange={setZonaAspiradoVal} />
        </div>

        <h3 style={{ marginTop: 22 }}>Promoción: upgrade a plan</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Monto adicional que se le ofrece al cliente en el módulo Operador, dentro de la primera hora tras pagar un
          lavado único, para convertir esa visita en la contratación del {PLANES[0]}.
        </div>
        <div className="field">
          <label>Precio adicional del upgrade</label>
          <PriceInput value={upgradePlanVal} onChange={setUpgradePlanVal} />
        </div>

        <h3 style={{ marginTop: 22 }}>Pagos web (/pagar)</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Precio del Plan Ilimitado Mensual cuando el cliente contrata con renovación automática (Oneclick) desde la
          web — canal aparte de la renovación preferencial de arriba, pensado para incentivar la renovación automática.
        </div>
        <div className="field">
          <label>Precio con renovación automática</label>
          <PriceInput value={planOneclickVal} onChange={setPlanOneclickVal} />
        </div>

        <h3 style={{ marginTop: 22 }}>Servicios adicionales</h3>
        {categoriasServicios.map((cat) => (
          <div key={cat}>
            <div
              className="hint"
              style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}
            >
              {cat}
            </div>
            {catalogoServicios.filter((s) => s.categoria === cat).map((s) => (
              <div className="field" key={s.id}>
                <label>{s.nombre}</label>
                <PriceInput
                  value={servicioVals[s.id] ?? ""}
                  onChange={(v) => setServicioVals((cur) => ({ ...cur, [s.id]: v }))}
                />
              </div>
            ))}
          </div>
        ))}

        <div className="err" style={{ color: precioErr?.ok ? "var(--green)" : undefined }}>
          {precioErr?.msg || ""}
        </div>
        <button className="btn" onClick={savePrecios}>
          Guardar precios
        </button>
      </div>
    </div>
  );
}
