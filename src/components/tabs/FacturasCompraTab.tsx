"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  clasificarFacturaCompra,
  listarFacturasCompra,
  marcarFacturaCompra,
  revisarCorreoCompras,
  xmlFacturaCompra,
} from "@/lib/serverActions";
import {
  CATEGORIAS_ACTIVO,
  egresoDesdeDocumento,
  egresoExistente,
  esEgresoDeFacturaCompra,
  esNotaCredito,
  nombreTipoDte,
} from "@/lib/dteCompra";
import { limpiarRut } from "@/lib/helpers/validadores";
import {
  fmtCLP,
  GRUPOS_GASTO_EERR,
  uidMovimientoContable,
} from "@/lib/helpers";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  MobileRecordCard,
  MobileRecordMeta,
  MobileRecordAvatar,
} from "@/components/MobileRecordCard";
import { Button } from "@/components/ui/button";
import { FileDown, Inbox, RefreshCw } from "lucide-react";
import type { DocumentoCompra } from "@/types";

// Documentos tributarios que los proveedores mandan a facturascompra@zplash.cl
// (ver @/lib/comprasRecepcion). Cada uno se clasifica como gasto —crea el
// egreso en Contabilidad, o se vincula al que ya estaba cargado a mano con el
// mismo RUT y N°— o como compra de activo fijo, que no pasa por el EERR.

type Filtro = "pendiente" | "contabilizado" | "ignorado" | "todas";
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendiente", label: "Por clasificar" },
  { id: "contabilizado", label: "Contabilizadas" },
  { id: "ignorado", label: "Ignoradas" },
  { id: "todas", label: "Todas" },
];

// Valor del selector: "g:<categoría>" gasto, "a:<categoría>" activo.
const valorDe = (d: Pick<DocumentoCompra, "clasificacion" | "categoria">) =>
  d.clasificacion && d.categoria
    ? `${d.clasificacion === "gasto" ? "g" : "a"}:${d.categoria}`
    : "";

// La fecha del XML es un día calendario (YYYY-MM-DD): se muestra tal cual,
// sin pasar por Date, que la correría un día atrás en Chile.
const fechaCorta = (f: string) => f.split("-").reverse().join("-");

const rutSinFormato = limpiarRut;

function coincide(d: DocumentoCompra, q: string): boolean {
  if (!q) return true;
  const l = q.toLowerCase();
  const qRut = q.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    d.razonSocialEmisor.toLowerCase().includes(l) ||
    String(d.folio).includes(q) ||
    (d.categoria || "").toLowerCase().includes(l) ||
    d.detalle.some((i) => i.nombre.toLowerCase().includes(l)) ||
    (qRut.length > 1 && rutSinFormato(d.rutEmisor).includes(qRut))
  );
}

async function descargarXml(d: DocumentoCompra) {
  const xml = await xmlFacturaCompra(d.id);
  if (!xml) return alert("No se pudo bajar el XML");
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreTipoDte(d.tipoDte).replace(/\s/g, "_")}_${d.folio}_${d.rutEmisor}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FacturasCompraTab() {
  const { data, ui, patchUi, commit, guardando } = useApp();
  const [docs, setDocs] = useState<DocumentoCompra[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const lista = await listarFacturasCompra();
    setErrorCarga(!lista);
    setDocs(lista || []);
  }, []);
  useEffect(() => {
    let vigente = true;
    listarFacturasCompra().then((lista) => {
      if (!vigente) return;
      setErrorCarga(!lista);
      setDocs(lista || []);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const categoriasPorGrupo = useMemo(
    () =>
      GRUPOS_GASTO_EERR.map((g) => ({
        grupo: g.grupo,
        categorias: data.categoriasGasto
          .filter((c) => c.activa && c.grupo === g.grupo)
          .map((c) => c.nombre)
          .sort(),
      })).filter((g) => g.categorias.length),
    [data.categoriasGasto],
  );
  // Valores que el selector puede mostrar: una sugerencia o clasificación
  // fuera de esta lista (p. ej. una categoría ya desactivada) se trata como
  // "sin elegir", para no contabilizar algo que no se ve en pantalla.
  const valoresValidos = useMemo(
    () =>
      new Set([
        ...categoriasPorGrupo.flatMap((g) => g.categorias.map((c) => `g:${c}`)),
        ...CATEGORIAS_ACTIVO.map((c) => `a:${c}`),
      ]),
    [categoriasPorGrupo],
  );

  // Sugerencia para un documento sin clasificar: lo último que se eligió para
  // ese proveedor; si nunca se clasificó nada suyo, la glosa habitual de su
  // ficha en Proveedores.
  const sugerencia = useMemo(() => {
    const porRut = new Map<string, string>();
    for (const p of data.proveedores)
      if (p.rut && p.categoriaGasto)
        porRut.set(rutSinFormato(p.rut), `g:${p.categoriaGasto}`);
    const clasificados = (docs || [])
      .filter((d) => d.estado === "contabilizado" && d.clasificadoEn)
      .sort((a, b) => (a.clasificadoEn! < b.clasificadoEn! ? -1 : 1));
    for (const d of clasificados)
      if (valoresValidos.has(valorDe(d)))
        porRut.set(rutSinFormato(d.rutEmisor), valorDe(d));
    return (d: DocumentoCompra) => porRut.get(rutSinFormato(d.rutEmisor)) || "";
  }, [docs, data.proveedores, valoresValidos]);

  const q = (ui.search || "").trim();
  const filtradas = (docs || []).filter(
    (d) => (filtro === "todas" || d.estado === filtro) && coincide(d, q),
  );
  const total = filtradas.reduce(
    (s, d) =>
      s +
      (d.estado === "ignorado"
        ? 0
        : (esNotaCredito(d.tipoDte) ? -1 : 1) * d.montoTotal),
    0,
  );
  const pendientes = (docs || []).filter(
    (d) => d.estado === "pendiente",
  ).length;

  const revisar = async () => {
    setRevisando(true);
    setAviso("");
    try {
      const r = await revisarCorreoCompras();
      if (!r.ok) setAviso(`No se pudo revisar el correo: ${r.error}`);
      else if (!r.correos) setAviso("No hay correos nuevos.");
      else
        setAviso(
          `${r.correos} correo(s) leído(s), ${r.nuevos} documento(s) nuevo(s)` +
            (r.documentos - r.nuevos - r.deOtroReceptor > 0
              ? `, ${r.documentos - r.nuevos - r.deOtroReceptor} ya estaban`
              : "") +
            (r.deOtroReceptor
              ? `, ${r.deOtroReceptor} emitido(s) a otro RUT (no se guardan)`
              : "") +
            ".",
        );
      await cargar();
    } finally {
      setRevisando(false);
    }
  };

  const actualizarLocal = (id: string, cambios: Partial<DocumentoCompra>) =>
    setDocs((prev) =>
      (prev || []).map((d) => (d.id === id ? { ...d, ...cambios } : d)),
    );

  const contabilizar = async (d: DocumentoCompra, valor: string) => {
    const [tipo, ...resto] = valor.split(":");
    const categoria = resto.join(":");
    if (!categoria) return;
    const clasificacion = tipo === "g" ? "gasto" : "activo";
    setOcupado(d.id);
    try {
      const ahora = new Date().toISOString();
      const usuario = ui.perfilActual?.nombre;
      // Egreso que este documento ya tiene (de una clasificación anterior) o,
      // si no, el que se cargó a mano para la misma factura.
      const yaVinculado = d.movimientoContableId
        ? data.movimientosContables.find((m) => m.id === d.movimientoContableId)
        : undefined;
      const vinculable =
        yaVinculado || egresoExistente(d, data.movimientosContables);
      let movimientoId: string | null = null;
      let egresoNuevoId: string | null = null;

      if (clasificacion === "gasto") {
        if (vinculable) {
          movimientoId = vinculable.id;
          if (vinculable.categoria !== categoria) {
            const ok = await commit({
              movimientosContables: data.movimientosContables.map((m) =>
                m.id === vinculable.id ? { ...m, categoria } : m,
              ),
            });
            if (!ok)
              return alert("No se pudo actualizar la categoría del egreso");
          }
        } else {
          const nuevo = egresoDesdeDocumento(
            d,
            categoria,
            uidMovimientoContable(),
            usuario,
            ahora,
          );
          const ok = await commit({
            movimientosContables: [nuevo, ...data.movimientosContables],
          });
          if (!ok)
            return alert(
              "No se pudo crear el egreso (¿el día de la factura ya está cerrado?)",
            );
          movimientoId = egresoNuevoId = nuevo.id;
        }
      } else if (vinculable) {
        // Un activo no es gasto del período: su egreso no debe seguir en el
        // EERR. El que se creó desde acá se quita solo; uno cargado a mano se
        // quita solo si el usuario lo confirma (si no, queda y se desvincula).
        const quitar =
          esEgresoDeFacturaCompra(vinculable) ||
          confirm(
            `Esta factura ya está cargada a mano como egreso ("${vinculable.descripcion}", ${fmtCLP(vinculable.monto)}) y suma como gasto en el EERR.\n\n` +
              "¿Borrar ese egreso? (Aceptar = borrarlo, Cancelar = dejarlo como está)",
          );
        if (quitar) {
          const ok = await commit({
            movimientosContables: data.movimientosContables.filter(
              (m) => m.id !== vinculable.id,
            ),
          });
          if (!ok) return alert("No se pudo quitar el egreso");
        }
      }

      const r = await clasificarFacturaCompra(
        d.id,
        clasificacion,
        categoria,
        movimientoId,
      );
      if (!r.ok) {
        // El egreso recién creado queda sin documento que lo respalde: se
        // deshace para que reintentar no lo duplique.
        if (egresoNuevoId)
          await commit({
            movimientosContables: data.movimientosContables.filter(
              (m) => m.id !== egresoNuevoId,
            ),
          });
        return alert(r.error || "No se pudo guardar");
      }
      actualizarLocal(d.id, {
        estado: "contabilizado",
        clasificacion,
        categoria,
        movimientoContableId: movimientoId ?? undefined,
        clasificadoEn: ahora,
        clasificadoPor: usuario,
      });
      setEditando(null);
    } finally {
      setOcupado(null);
    }
  };

  const marcar = async (
    d: DocumentoCompra,
    estado: "ignorado" | "pendiente",
  ) => {
    setOcupado(d.id);
    try {
      const r = await marcarFacturaCompra(d.id, estado);
      if (!r.ok) return alert(r.error || "No se pudo guardar");
      actualizarLocal(d.id, {
        estado,
        clasificacion: undefined,
        categoria: undefined,
        movimientoContableId: undefined,
        clasificadoEn: undefined,
        clasificadoPor: undefined,
      });
    } finally {
      setOcupado(null);
    }
  };

  const selector = (d: DocumentoCompra) => {
    const propuesto =
      eleccion[d.id] ??
      (d.estado === "contabilizado" ? valorDe(d) : sugerencia(d));
    const valor = valoresValidos.has(propuesto) ? propuesto : "";
    const bloqueado = ocupado === d.id || guardando;
    return (
      <span
        className="inline-flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <select
          value={valor}
          onChange={(e) =>
            setEleccion((p) => ({ ...p, [d.id]: e.target.value }))
          }
          disabled={bloqueado}
          className="max-w-[220px]"
        >
          <option value="">Elegir cuenta…</option>
          {categoriasPorGrupo.map((g) => (
            <optgroup key={g.grupo} label={`Gasto · ${g.grupo}`}>
              {g.categorias.map((c) => (
                <option key={c} value={`g:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Activo fijo (no va al EERR)">
            {CATEGORIAS_ACTIVO.map((c) => (
              <option key={c} value={`a:${c}`}>
                {c}
              </option>
            ))}
          </optgroup>
        </select>
        <Button
          size="sm"
          disabled={!valor || bloqueado}
          onClick={() => contabilizar(d, valor)}
        >
          {ocupado === d.id ? "Guardando…" : "Contabilizar"}
        </Button>
        {d.estado === "pendiente" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={bloqueado}
            onClick={() => marcar(d, "ignorado")}
          >
            Ignorar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={bloqueado}
            onClick={() => setEditando(null)}
          >
            Cancelar
          </Button>
        )}
      </span>
    );
  };

  const clasificacionDe = (d: DocumentoCompra) => {
    if (d.estado === "pendiente" || editando === d.id) return selector(d);
    if (d.estado === "ignorado")
      return (
        <span
          className="inline-flex items-center gap-2 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Ignorada
          <Button
            size="sm"
            variant="ghost"
            disabled={ocupado === d.id}
            onClick={() => marcar(d, "pendiente")}
          >
            Restaurar
          </Button>
        </span>
      );
    return (
      <span
        className="inline-flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          <span className="text-xs text-muted-foreground">
            {d.clasificacion === "activo" ? "Activo · " : "Gasto · "}
          </span>
          {d.categoria}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditando(d.id)}>
          Cambiar
        </Button>
      </span>
    );
  };

  const detalleDe = (d: DocumentoCompra) => (
    <div className="flex flex-col gap-2 py-2 text-sm">
      {d.giroEmisor && (
        <div className="text-muted-foreground">Giro: {d.giroEmisor}</div>
      )}
      <ul className="list-disc pl-5">
        {d.detalle.map((i, n) => (
          <li key={n}>
            {i.nombre}
            {i.cantidad
              ? ` · ${i.cantidad} × ${fmtCLP(i.precio ?? 0)}`
              : ""} · {fmtCLP(i.monto)}
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground">
        Neto {fmtCLP(d.montoNeto)} · Exento {fmtCLP(d.montoExento)} · IVA{" "}
        {fmtCLP(d.iva)} · Total {fmtCLP(d.montoTotal)}
        {d.fechaVencimiento ? ` · Vence ${fechaCorta(d.fechaVencimiento)}` : ""}
      </div>
      <div className="text-muted-foreground">
        Llegó de {d.correoDe || "-"}
        {d.clasificadoPor ? ` · Clasificó ${d.clasificadoPor}` : ""}
        {d.clasificacion === "gasto" && d.movimientoContableId
          ? " · Egreso creado/vinculado en Contabilidad"
          : ""}
      </div>
      <div>
        <Button size="sm" variant="outline" onClick={() => descargarXml(d)}>
          <FileDown className="size-4" /> Bajar XML
        </Button>
      </div>
    </div>
  );

  const titulo = (d: DocumentoCompra) =>
    `${nombreTipoDte(d.tipoDte)} ${d.folio}`;
  const monto = (d: DocumentoCompra) =>
    (esNotaCredito(d.tipoDte) ? -1 : 1) * d.montoTotal;
  const resumenItems = (d: DocumentoCompra) =>
    d.detalle.map((i) => i.nombre).join(", ");
  const vacio =
    docs === null
      ? "Cargando…"
      : errorCarga
        ? "No se pudieron cargar las facturas de compra"
        : docs.length === 0
          ? "Todavía no llegan facturas a facturascompra@zplash.cl"
          : "No hay facturas en esta vista";

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por proveedor, RUT, folio o producto..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={revisar}
          disabled={revisando}
        >
          <RefreshCw className={`size-4 ${revisando ? "animate-spin" : ""}`} />{" "}
          {revisando ? "Revisando…" : "Revisar correo"}
        </Button>
        {filtradas.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {filtradas.length} documento(s) · {fmtCLP(total)}
          </span>
        )}
      </div>
      <div className="tabs mb-3">
        {FILTROS.map((f) => (
          <div
            key={f.id}
            className={`tab ${filtro === f.id ? "active" : ""}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            {f.id === "pendiente" && pendientes > 0 ? ` (${pendientes})` : ""}
          </div>
        ))}
      </div>
      {aviso && <p className="mb-3 text-sm text-muted-foreground">{aviso}</p>}

      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtradas.length === 0 ? (
          <div className="empty">{vacio}</div>
        ) : (
          filtradas.map((d) => (
            <div key={d.id}>
              <MobileRecordCard
                avatar={<MobileRecordAvatar icon={Inbox} />}
                title={`${titulo(d)} · ${d.razonSocialEmisor}`}
                subtitle={`${d.rutEmisor} · ${fechaCorta(d.fechaEmision)} · ${resumenItems(d)}`}
                onClick={() => setAbierto(abierto === d.id ? null : d.id)}
                meta={
                  <MobileRecordMeta
                    left={clasificacionDe(d)}
                    right={fmtCLP(monto(d))}
                  />
                }
              />
              {abierto === d.id && <div className="px-3">{detalleDe(d)}</div>}
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="max-w-[220px]">Proveedor</TableHead>
              <TableHead className="max-w-[260px]">Detalle</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Cuenta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="empty">
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((d) => (
                <Fragment key={d.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setAbierto(abierto === d.id ? null : d.id)}
                  >
                    <TableCell>{fechaCorta(d.fechaEmision)}</TableCell>
                    <TableCell>{titulo(d)}</TableCell>
                    <TableCell
                      className="max-w-[220px] truncate"
                      title={d.razonSocialEmisor}
                    >
                      {d.razonSocialEmisor}
                      <div className="text-xs text-muted-foreground">
                        {d.rutEmisor}
                      </div>
                    </TableCell>
                    <TableCell
                      className="max-w-[260px] truncate"
                      title={resumenItems(d)}
                    >
                      {resumenItems(d)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtCLP(monto(d))}
                    </TableCell>
                    <TableCell>{clasificacionDe(d)}</TableCell>
                  </TableRow>
                  {abierto === d.id && (
                    <TableRow>
                      <TableCell colSpan={6}>{detalleDe(d)}</TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
