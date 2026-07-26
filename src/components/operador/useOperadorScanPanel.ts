"use client";

import { useEffect, useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import {
  PATENTE_FORMATO_MSG,
  dentroDeHorarioOperador,
  esExentoHorarioOperador,
  findClient,
  isValidPatente,
  normPlate,
  patenteAutorizadaParaCupon,
  resolverDescuento,
} from "@/lib/helpers";
import type { Ingreso } from "@/types";

/** Refresco del reloj del bloqueo horario: no necesita mayor precisión que
 * "dentro del minuto", así que 30s alcanza sin recalcular en cada render. */
const INTERVALO_RELOJ_MS = 30_000;

// Las fotos de la cámara del celular en resolución completa suelen pesar
// 5-12 MB, y Plate Recognizer (Snapshot Cloud) rechaza cualquier imagen de
// más de 3 MB — eso se ve igual que "no detectó ninguna patente", así que
// se achica la imagen en el navegador antes de mandarla. De paso normaliza
// el formato a JPEG (algunos celulares capturan en HEIC).
async function comprimirImagen(file: File, ladoMax = 1600, calidad = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > ladoMax || height > ladoMax) {
    const escala = ladoMax / Math.max(width, height);
    width = Math.round(width * escala);
    height = Math.round(height * escala);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", calidad);
  });
}

type ScanPanelRefs = {
  plateInputRef: RefObject<HTMLInputElement | null>;
  codigoCuponRef: RefObject<HTMLInputElement | null>;
};

// Lógica del panel "Validar patente" del Operador: bloqueo por horario,
// escaneo de patente por foto, canje de cupón de entrada y validación de
// código de descuento — todo lo que antecede a mostrar OperadorResult.
// fotoPatenteRef no entra acá: solo se usa en el JSX (ref del <input
// type="file"> oculto y su botón "Escanear"), nunca dentro de esta lógica.
export function useOperadorScanPanel(refs: ScanPanelRefs) {
  const { data, ui, commit, patchUi } = useApp();
  const { plateInputRef, codigoCuponRef } = refs;
  const [cuponErr, setCuponErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [plateErr, setPlateErr] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  // Código de descuento ya validado en "Validar": a diferencia de un cupón de
  // entrada (que se canjea de inmediato acá), un descuento recién se consume
  // al cobrar el lavado único (ver OperadorNotFoundResult), así que se pasa
  // hacia abajo para que el operador no tenga que volver a tipearlo ahí.
  const [codigoDescuento, setCodigoDescuento] = useState("");

  // Bloqueo horario del registro de vehículos (ver ConfigTab → "Horario de
  // registro"). El backstop real vive en insertIngresos (@/lib/db) — esto es
  // solo para no ofrecerle al operador un flujo que el servidor va a
  // rechazar. `ahora` se refresca solo (no en cada render) para que el
  // bloqueo se levante/active solo al cruzar la hora configurada, sin que el
  // operador tenga que recargar la página.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), INTERVALO_RELOJ_MS);
    return () => clearInterval(id);
  }, []);
  const exento = esExentoHorarioOperador(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const bloqueado = !exento && !dentroDeHorarioOperador(data.config, ahora);

  const clearPlate = () => {
    if (plateInputRef.current) plateInputRef.current.value = "";
    if (codigoCuponRef.current) codigoCuponRef.current.value = "";
    setCodigoDescuento("");
  };

  const canjearCupon = async () => {
    const codigo = (codigoCuponRef.current?.value.trim() || "").toUpperCase();
    const patente = normPlate(plateInputRef.current?.value || "");
    if (!codigo || !patente) {
      setCuponErr({ msg: "Ingresa la patente arriba y el código del cupón", ok: false });
      return;
    }
    if (!isValidPatente(patente)) {
      setCuponErr({ msg: PATENTE_FORMATO_MSG, ok: false });
      return;
    }
    const cupon = data.cupones.find((c) => c.codigo === codigo);
    if (!cupon) {
      setCuponErr({ msg: "Código no encontrado", ok: false });
      return;
    }
    if (cupon.tipo === "descuento") {
      setCuponErr({ msg: "Este código es un descuento: ingrésalo al cobrar el lavado (patente no encontrada), no acá", ok: false });
      return;
    }
    if (cupon.usado) {
      setCuponErr({ msg: "Este cupón ya fue usado", ok: false });
      return;
    }
    if (new Date(cupon.fechaCaducidad) < new Date()) {
      setCuponErr({ msg: "Este cupón está caducado", ok: false });
      return;
    }
    if (!patenteAutorizadaParaCupon(cupon, patente)) {
      setCuponErr({ msg: "Este ticket fue contratado para otra patente", ok: false });
      return;
    }

    const ahoraISO = new Date().toISOString();
    const cuponActualizado = {
      ...cupon,
      usado: true,
      patenteUso: patente,
      fechaUso: ahoraISO,
      operadorUso: ui.perfilActual?.nombre || "",
    };
    const nombreIngreso = `Cupón · ${cupon.nombreLote} (${cupon.numeroLote}/${cupon.totalLote})`;
    const ingreso: Ingreso = {
      id: "i" + Date.now(),
      clienteId: "",
      patente,
      nombre: nombreIngreso,
      fecha: ahoraISO,
      planEstadoAlIngreso: "ok",
      creadoPor: ui.perfilActual?.nombre || "",
      viaCupon: true,
      cuponCodigo: cupon.codigo,
    };

    // El monto del lote ya se registro completo en el cierre de caja al
    // generar los cupones, asi que canjear uno no vuelve a cobrar nada.
    const ok = await commit({
      cupones: data.cupones.map((x) => (x.id === cupon.id ? cuponActualizado : x)),
      ingresos: [ingreso, ...data.ingresos],
    });
    if (!ok) {
      setCuponErr({ msg: "No se pudo registrar el canje (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setCuponErr({ msg: `Cupón canjeado para ${patente} (${cupon.nombreLote})`, ok: true });
    clearPlate();
  };

  const doValidate = () => {
    const plate = plateInputRef.current?.value.trim();
    if (!plate) return;
    if (!isValidPatente(plate)) {
      setPlateErr(PATENTE_FORMATO_MSG);
      return;
    }
    setPlateErr("");
    const codigo = (codigoCuponRef.current?.value.trim() || "").toUpperCase();
    const cupon = codigo ? data.cupones.find((x) => x.codigo === codigo) : undefined;
    // Un código de cupón de entrada (o uno inexistente/inválido) se resuelve
    // de inmediato acá, sin buscar el cliente: son caminos excluyentes para
    // la misma patente. Un código de descuento en cambio no se consume
    // ahora — solo se valida y se deja listo para aplicarlo al cobrar el
    // lavado único (ver OperadorNotFoundResult), así que sigue de largo a la
    // búsqueda normal del cliente.
    if (codigo && cupon?.tipo !== "descuento") {
      canjearCupon();
      return;
    }
    if (codigo) {
      const resultado = resolverDescuento(codigo, normPlate(plate), data.cupones);
      if (!resultado.ok) {
        setCuponErr({ msg: resultado.msg, ok: false });
        setCodigoDescuento("");
        return;
      }
      setCuponErr({ msg: "Código de descuento válido para esta patente", ok: true });
      setCodigoDescuento(codigo);
    } else {
      // Sin código tipeado, se busca igual un descuento generado por una
      // regla de WhatsApp para esta patente (ver @/lib/whatsapp/reglas): se
      // reconoce solo por patente, el cliente no necesita mostrar ni tipear
      // ningún código (a diferencia del cupón de entrada de arriba).
      const patente = normPlate(plate);
      const autoDescuento = data.cupones.find(
        (cup) => cup.tipo === "descuento" && !cup.usado && cup.patenteAsignada === patente && new Date(cup.fechaCaducidad) > new Date()
      );
      if (autoDescuento) {
        setCuponErr({ msg: "Descuento vigente detectado para esta patente", ok: true });
        setCodigoDescuento(autoDescuento.codigo);
      } else {
        setCuponErr(null);
        setCodigoDescuento("");
      }
    }
    const c = findClient(data.clientes, plate);
    patchUi({ operResult: c ? { found: true, cliente: c } : { found: false, plate } });
  };

  // Atajo, no reemplazo: si la lectura falla o no encuentra nada, el
  // operador sigue escribiendo la patente a mano con normalidad. El
  // resultado se deja en el input para que lo revise/corrija antes de
  // tocar "Validar" — el reconocimiento nunca es 100% confiable.
  const escanearPatente = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPlateErr("");
    setEscaneando(true);
    try {
      // La compresión es "best effort": si falla en algún celular puntual,
      // se manda la foto tal cual en vez de cortar todo el flujo acá.
      let imagen: Blob = file;
      try {
        imagen = await comprimirImagen(file);
      } catch (errCompresion) {
        console.error("No se pudo comprimir la foto, se manda sin comprimir", errCompresion);
      }

      const formData = new FormData();
      formData.append("imagen", imagen, "patente.jpg");

      let res: Response;
      try {
        res = await fetch("/api/reconocer-patente", { method: "POST", body: formData });
      } catch (errRed) {
        console.error("Fetch a /api/reconocer-patente falló", errRed);
        setPlateErr("Sin conexión a internet. Escribe la patente a mano.");
        return;
      }

      let json: { patente?: string | null; error?: string };
      try {
        json = await res.json();
      } catch (errJson) {
        console.error("Respuesta no-JSON de /api/reconocer-patente", res.status, errJson);
        setPlateErr(`El servidor respondió con un error (${res.status}). Escribe la patente a mano.`);
        return;
      }

      if (!res.ok) {
        setPlateErr(`${json.error || "No se pudo leer la patente"}. Escríbela a mano.`);
        return;
      }
      if (!json.patente) {
        setPlateErr("No se detectó ninguna patente. Acércate más y que quede bien iluminada, o escríbela a mano.");
        return;
      }
      if (plateInputRef.current) {
        plateInputRef.current.value = json.patente;
        plateInputRef.current.focus();
      }
    } finally {
      setEscaneando(false);
    }
  };

  return {
    cfg: data.config,
    bloqueado,
    cuponErr,
    plateErr,
    escaneando,
    codigoDescuento,
    clearPlate,
    doValidate,
    escanearPatente,
  };
}
