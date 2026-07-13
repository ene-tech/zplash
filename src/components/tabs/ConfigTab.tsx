"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  GRUPOS_GASTO_EERR,
  LAVADO_UNICO_KEY,
  PLANES,
  SERVICIOS_ADICIONALES,
  precioLavadoUnico,
  precioNormal,
  precioPreferencial,
  precioServicioAdicional,
} from "@/lib/helpers";
import type { CategoriaGasto } from "@/types";

export default function ConfigTab() {
  const { data, ui, commit } = useApp();
  const curPinRef = useRef<HTMLInputElement>(null);
  const newPinRef = useRef<HTMLInputElement>(null);
  const [cfgErr, setCfgErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [precioErr, setPrecioErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nuevaCategoriaNombreRef = useRef<HTMLInputElement>(null);
  const nuevaCategoriaGrupoRef = useRef<HTMLSelectElement>(null);
  const [categoriaErr, setCategoriaErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const normalRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const promoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lavadoUnicoRef = useRef<HTMLInputElement>(null);
  const servicioRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categoriasServicios = Array.from(new Set(SERVICIOS_ADICIONALES.map((s) => s.categoria)));

  const savePin = async () => {
    const cur = curPinRef.current?.value || "";
    const nw = newPinRef.current?.value || "";
    if (!ui.perfilActual) return;
    if (!nw || nw.length < 4) {
      setCfgErr({ msg: "La nueva contraseña debe tener al menos 4 caracteres", ok: false });
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
      const nInp = normalRefs.current[p];
      const pInp = promoRefs.current[p];
      precios[p] = { normal: Number(nInp?.value) || 0, promo: Number(pInp?.value) || 0 };
    });
    precios[LAVADO_UNICO_KEY] = { normal: Number(lavadoUnicoRef.current?.value) || 0, promo: 0 };
    SERVICIOS_ADICIONALES.forEach((s) => {
      const inp = servicioRefs.current[s.id];
      precios[s.id] = { normal: Number(inp?.value) || 0, promo: 0 };
    });
    await commit({ precios });
    setPrecioErr({ msg: "Precios actualizados correctamente", ok: true });
  };

  const agregarCategoria = async () => {
    const nombre = nuevaCategoriaNombreRef.current?.value.trim() || "";
    const grupo = nuevaCategoriaGrupoRef.current?.value || GRUPOS_GASTO_EERR[0].grupo;
    if (!nombre) {
      setCategoriaErr({ msg: "Escribe el nombre de la glosa", ok: false });
      return;
    }
    if (data.categoriasGasto.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      setCategoriaErr({ msg: "Ya existe una glosa con ese nombre", ok: false });
      return;
    }
    const nueva: CategoriaGasto = { id: "cg" + Date.now() + Math.floor(Math.random() * 1000), nombre, grupo, activa: true };
    const ok = await commit({ categoriasGasto: [...data.categoriasGasto, nueva] });
    if (!ok) {
      setCategoriaErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setCategoriaErr({ msg: "Glosa agregada correctamente", ok: true });
    if (nuevaCategoriaNombreRef.current) nuevaCategoriaNombreRef.current.value = "";
  };

  const toggleActivaCategoria = (cat: CategoriaGasto) => {
    const actualizada = { ...cat, activa: !cat.activa };
    commit({ categoriasGasto: data.categoriasGasto.map((c) => (c.id === cat.id ? actualizada : c)) });
  };

  const cambiarGrupoCategoria = (cat: CategoriaGasto, grupo: string) => {
    const actualizada = { ...cat, grupo };
    commit({ categoriasGasto: data.categoriasGasto.map((c) => (c.id === cat.id ? actualizada : c)) });
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
      <div className="modal" style={{ maxWidth: 520, margin: "0 0 20px 0" }}>
        <h3>Categorías de gasto</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Estas son las glosas seleccionables en &quot;Tipo de gasto&quot; al registrar un egreso. Los 5 grupos son fijos (son la
          estructura del EERR); puedes agregar, reasignar de grupo, o desactivar una glosa sin borrarla — desactivarla
          la saca del selector de gastos nuevos, pero conserva el historial ya registrado con ella.
        </div>
        <div className="field">
          <label>Nueva glosa</label>
          <input ref={nuevaCategoriaNombreRef} placeholder="Ej: Mantención de Aire Acondicionado" />
        </div>
        <div className="field">
          <label>Grupo</label>
          <select ref={nuevaCategoriaGrupoRef} defaultValue={GRUPOS_GASTO_EERR[0].grupo}>
            {GRUPOS_GASTO_EERR.map((g) => (
              <option key={g.grupo} value={g.grupo}>
                {g.grupo}
              </option>
            ))}
          </select>
        </div>
        <div className="err" style={{ color: categoriaErr?.ok ? "var(--green)" : undefined }}>
          {categoriaErr?.msg || ""}
        </div>
        <button className="btn" onClick={agregarCategoria}>
          Agregar glosa
        </button>

        {GRUPOS_GASTO_EERR.map((g) => {
          const categorias = data.categoriasGasto.filter((c) => c.grupo === g.grupo);
          if (!categorias.length) return null;
          return (
            <div key={g.grupo} style={{ marginTop: 22 }}>
              <div
                className="hint"
                style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}
              >
                {g.grupo}
              </div>
              {categorias.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                    opacity: c.activa ? 1 : 0.5,
                  }}
                >
                  <div style={{ flex: 1 }}>{c.nombre}</div>
                  <select
                    value={c.grupo}
                    onChange={(e) => cambiarGrupoCategoria(c, e.target.value)}
                    style={{ maxWidth: 220 }}
                  >
                    {GRUPOS_GASTO_EERR.map((go) => (
                      <option key={go.grupo} value={go.grupo}>
                        {go.grupo}
                      </option>
                    ))}
                  </select>
                  <button className="icon-btn" onClick={() => toggleActivaCategoria(c)}>
                    {c.activa ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="modal" style={{ maxWidth: 420, margin: 0 }}>
        <h3>Precios y renovación preferencial</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Estos valores se usan para mostrar la oferta de renovación al operador cuando un plan está por vencer.
        </div>
        {PLANES.map((p) => (
          <div key={p}>
            <div className="field">
              <label>Precio normal — {p}</label>
              <input
                type="number"
                min={0}
                defaultValue={precioNormal(data.precios, p)}
                ref={(el) => {
                  normalRefs.current[p] = el;
                }}
              />
            </div>
            <div className="field">
              <label>Precio promoción de renovación — {p}</label>
              <input
                type="number"
                min={0}
                defaultValue={precioPreferencial(data.precios, p)}
                ref={(el) => {
                  promoRefs.current[p] = el;
                }}
              />
            </div>
          </div>
        ))}

        <h3 style={{ marginTop: 22 }}>Lavado túnel (sin plan)</h3>
        <div className="field">
          <label>Precio lavado único</label>
          <input type="number" min={0} defaultValue={precioLavadoUnico(data.precios)} ref={lavadoUnicoRef} />
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
            {SERVICIOS_ADICIONALES.filter((s) => s.categoria === cat).map((s) => (
              <div className="field" key={s.id}>
                <label>{s.nombre}</label>
                <input
                  type="number"
                  min={0}
                  defaultValue={precioServicioAdicional(data.precios, s)}
                  ref={(el) => {
                    servicioRefs.current[s.id] = el;
                  }}
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
