"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { GRUPOS_GASTO_EERR } from "@/lib/helpers";
import type { CategoriaGasto, CategoriaIngreso } from "@/types";

export default function ContabilidadConfigTab() {
  const { data, commit } = useAppData();
  const nuevaCategoriaNombreRef = useRef<HTMLInputElement>(null);
  const nuevaCategoriaGrupoRef = useRef<HTMLSelectElement>(null);
  const [categoriaErr, setCategoriaErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nuevoCanalNombreRef = useRef<HTMLInputElement>(null);
  const [canalErr, setCanalErr] = useState<{ msg: string; ok: boolean } | null>(null);

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

  const agregarCanal = async () => {
    const nombre = nuevoCanalNombreRef.current?.value.trim() || "";
    if (!nombre) {
      setCanalErr({ msg: "Escribe el nombre del canal", ok: false });
      return;
    }
    if (data.categoriasIngreso.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      setCanalErr({ msg: "Ya existe un canal con ese nombre", ok: false });
      return;
    }
    const nuevo: CategoriaIngreso = { id: "ci" + Date.now() + Math.floor(Math.random() * 1000), nombre, activa: true };
    const ok = await commit({ categoriasIngreso: [...data.categoriasIngreso, nuevo] });
    if (!ok) {
      setCanalErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setCanalErr({ msg: "Canal agregado correctamente", ok: true });
    if (nuevoCanalNombreRef.current) nuevoCanalNombreRef.current.value = "";
  };

  const toggleActivaCanal = (cat: CategoriaIngreso) => {
    const actualizada = { ...cat, activa: !cat.activa };
    commit({ categoriasIngreso: data.categoriasIngreso.map((c) => (c.id === cat.id ? actualizada : c)) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 520, margin: 0 }}>
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

      <div className="modal" style={{ maxWidth: 520, margin: "24px 0 0" }}>
        <h3>Categorías de ingreso (canal)</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Estas son las opciones seleccionables en &quot;Categoría&quot; al registrar un ingreso, e identifican de qué
          canal proviene la plata. Puedes agregar canales nuevos o desactivar uno sin borrarlo — desactivarlo lo saca
          del selector de ingresos nuevos, pero conserva el historial ya registrado con él.
        </div>
        <div className="field">
          <label>Nuevo canal</label>
          <input ref={nuevoCanalNombreRef} placeholder="Ej: Tienda Web" />
        </div>
        <div className="err" style={{ color: canalErr?.ok ? "var(--green)" : undefined }}>
          {canalErr?.msg || ""}
        </div>
        <button className="btn" onClick={agregarCanal}>
          Agregar canal
        </button>

        <div style={{ marginTop: 22 }}>
          {data.categoriasIngreso.map((c) => (
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
              <button className="icon-btn" onClick={() => toggleActivaCanal(c)}>
                {c.activa ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
