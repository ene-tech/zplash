"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { hayAltaEnDiaCerrado } from "@/lib/serverActions";
import DatosTransferencia from "@/components/DatosTransferencia";
import { fmtCLP, formatRut, isValidEmail, isValidRut, RUT_FORMATO_MSG } from "@/lib/helpers";
import { conectarPosIntegrado, posIntegradoConectado, ventaPosIntegrado } from "@/lib/posIntegrado";
import type { Cliente, DatosFacturacion, PagoInfo } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Valor del selector de empresa que usa los datos de la ficha del cliente.
const FICHA = "__ficha__";
// Valor del selector para tipear los datos de una empresa que no está
// registrada (cliente que pide factura recién al pagar, p. ej. el upgrade).
const NUEVA = "__nueva__";

// Minúsculas, sin tildes y sin puntos/guion/espacios: así "12.345.678-9",
// "123456789" y "comercial ñuñoa" encuentran lo mismo que escribió Gerencia.
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\-\s]/g, "");

function filtrarEmpresas<T extends { id: string; razonSocial: string; rut: string }>(
  empresas: T[],
  busqueda: string,
  elegidaId?: string,
): T[] {
  const q = normalizar(busqueda);
  if (!q) return [...empresas];
  return empresas.filter(
    (e) => e.id === elegidaId || normalizar(e.razonSocial).includes(q) || normalizar(e.rut).includes(q),
  );
}

export default function PagoModal({
  monto,
  descripcion,
  onConfirm,
  cliente,
  terminal,
  sinVenta,
}: {
  monto: number;
  descripcion: string;
  onConfirm: (pago: PagoInfo) => void;
  cliente?: Cliente;
  terminal?: boolean;
  sinVenta?: boolean;
}) {
  const { data, patchUi } = useAppData();
  const [metodo, setMetodo] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [err, setErr] = useState("");
  // Cobro por terminal Transbank en curso: bloquea el modal (no se puede
  // cancelar un cobro que el terminal ya está esperando) y muestra los
  // mensajes intermedios ("Acerque su tarjeta…").
  const [cobrandoTerminal, setCobrandoTerminal] = useState(false);
  const [estadoTerminal, setEstadoTerminal] = useState("");
  // Voucher a mano de "Tarjeta (manual)" (solo donde hay terminal: si el
  // terminal aprobó pero la venta no se guardó, se reintenta por acá con el
  // mismo voucher, sin volver a pasar la tarjeta).
  const [voucher, setVoucher] = useState("");
  // Boleta o factura se pregunta en cada venta; parte de lo que dice la ficha.
  const fichaConFactura = cliente?.tipoDocumento === "Factura" && !!cliente.rut;
  const [documento, setDocumento] = useState<"Boleta" | "Factura" | null>(fichaConFactura ? "Factura" : null);
  const [empresaId, setEmpresaId] = useState(fichaConFactura ? FICHA : "");
  const [busquedaEmpresa, setBusquedaEmpresa] = useState("");
  const [nueva, setNueva] = useState({ rut: "", razonSocial: "", giro: "", direccion: "", email: "" });
  // El correo solo se pide si queda guardado: en una ficha que pasa a factura
  // y no tenía correo (el que ya tiene no se cambia, ver commitConFicha).
  const pideCorreo = !fichaConFactura && !cliente?.email;
  const cambiarNueva = (campo: keyof typeof nueva, valor: string) => {
    setNueva((n) => ({ ...n, [campo]: valor }));
    setErr("");
  };
  // Igual que el registro rápido: si el RUT ya es una empresa registrada, se
  // traen sus datos en vez de tipearlos.
  const onRutNuevaBlur = () => {
    if (!isValidRut(nueva.rut)) return;
    const rut = formatRut(nueva.rut);
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rut);
    setNueva((n) => ({
      ...n,
      rut,
      ...(empresa && { razonSocial: empresa.razonSocial, giro: empresa.giro || "", direccion: empresa.direccion || "" }),
    }));
  };

  // El cierre lo hace Administración desde otra máquina y el mesón no se
  // entera (carga cierresCaja al entrar), así que se pregunta al servidor al
  // abrir: si no, el operador pasa la tarjeta, el guardado falla y reintenta
  // (ver hayAltaEnDiaCerrado). Sin red queda en false: el guardado decide.
  const [cajaCerrada, setCajaCerrada] = useState(false);
  useEffect(() => {
    if (sinVenta) return;
    let vigente = true;
    hayAltaEnDiaCerrado([new Date().toISOString()])
      .then((cerrada) => vigente && setCajaCerrada(cerrada))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [sinVenta]);

  const cerrar = () => {
    if (!cobrandoTerminal) patchUi({ modal: null });
  };

  const seleccionar = (m: "efectivo" | "tarjeta" | "transferencia") => {
    setMetodo(m);
    setErr("");
  };

  /** Documento elegido, o null (con el error ya pintado) si falta algo. */
  const documentoElegido = (): Pick<PagoInfo, "documento" | "fichaFactura" | "empresaNueva"> | null => {
    if (cliente && !documento) {
      setErr("Elige boleta o factura");
      return null;
    }
    let doc: DatosFacturacion | undefined;
    if (documento === "Boleta") doc = { tipoDocumento: "Boleta" };
    else if (documento === "Factura") {
      const empresa = data.empresas.find((e) => e.id === empresaId);
      if (empresaId === FICHA) doc = { tipoDocumento: "Factura" };
      else if (empresaId === NUEVA) {
        const datos = {
          rut: nueva.rut.trim(),
          razonSocial: nueva.razonSocial.trim(),
          giro: nueva.giro.trim(),
          direccion: nueva.direccion.trim(),
          email: nueva.email.trim(),
        };
        if (!isValidRut(datos.rut)) {
          setErr(RUT_FORMATO_MSG);
          return null;
        }
        if (!datos.razonSocial || !datos.giro || !datos.direccion) {
          setErr("Completa Razón Social, Giro y Dirección para la factura");
          return null;
        }
        if (pideCorreo && !isValidEmail(datos.email)) {
          setErr("Ingresa un email válido para la factura");
          return null;
        }
        datos.rut = formatRut(datos.rut);
        const { email: correo, ...tipeada } = datos;
        const email = pideCorreo ? correo : undefined;
        // RUT ya registrado (tipeado sin salir del campo, o con los datos
        // editados): manda la empresa registrada, no lo tipeado. Si no está en
        // Empresas, se registra después de guardar la venta.
        const yaRegistrada = data.empresas.find((e) => formatRut(e.rut) === datos.rut);
        const empresaTipeada = yaRegistrada
          ? { rut: datos.rut, razonSocial: yaRegistrada.razonSocial, giro: yaRegistrada.giro || tipeada.giro, direccion: yaRegistrada.direccion || tipeada.direccion }
          : tipeada;
        doc = { tipoDocumento: "Factura", ...empresaTipeada };
        return {
          documento: doc,
          ...(!yaRegistrada && { empresaNueva: empresaTipeada }),
          // Una ficha que ya factura a otra empresa no se pisa: esta venta
          // queda pendiente en el Cierre (ver emitirFacturasAutomaticas).
          ...(!fichaConFactura && { fichaFactura: { ...empresaTipeada, ...(email && { email }) } }),
        };
      } else if (empresa) {
        doc = { tipoDocumento: "Factura", razonSocial: empresa.razonSocial, rut: empresa.rut, direccion: empresa.direccion, giro: empresa.giro };
        // Cliente que compraba con boleta y ahora pide factura a una empresa
        // ya registrada: la ficha pasa a factura con esa empresa.
        if (cliente && !fichaConFactura)
          return {
            documento: doc,
            fichaFactura: { rut: empresa.rut, razonSocial: empresa.razonSocial, giro: empresa.giro, direccion: empresa.direccion },
          };
      } else {
        setErr("Elige la empresa de la factura");
        return null;
      }
    }
    return doc ? { documento: doc } : {};
  };

  const confirmar = () => {
    if (cajaCerrada) return;
    if (!metodo) {
      setErr("Selecciona una forma de pago");
      return;
    }
    const doc = documentoElegido();
    if (doc === null) return;
    const voucherManual = terminal && metodo === "tarjeta" ? voucher.trim() || undefined : undefined;
    onConfirm({ metodo, ...(voucherManual && { voucher: voucherManual }), ...doc });
    cerrar();
  };

  // "Tarjeta (terminal)": manda el monto al POS Integrado y SOLO si el
  // terminal aprueba se confirma el pago (y con eso se graba la venta), con
  // el voucher armado solo (operación, autorización, últimos 4). Si el agente
  // no está o el terminal rechaza, el modal sigue abierto y el cajero puede
  // reintentar o elegir "Tarjeta (manual)" como siempre.
  const cobrarEnTerminal = async () => {
    if (cobrandoTerminal || cajaCerrada) return;
    const doc = documentoElegido();
    if (doc === null) return;
    setCobrandoTerminal(true);
    setErr("");
    try {
      if (!posIntegradoConectado()) {
        setEstadoTerminal("Conectando con el terminal…");
        const c = await conectarPosIntegrado();
        if (!c.ok) {
          setErr(`${c.error} Puedes cobrar con Tarjeta (manual).`);
          return;
        }
      }
      setEstadoTerminal("Enviando el monto al terminal…");
      const r = await ventaPosIntegrado(monto, "ZPLASH", setEstadoTerminal);
      if (!r.aprobada) {
        setErr(r.error);
        return;
      }
      onConfirm({
        metodo: "tarjeta",
        voucher: r.voucher,
        viaTerminal: true,
        operacionTerminal: r.operacion,
        ...doc,
      });
      patchUi({ modal: null });
    } finally {
      setCobrandoTerminal(false);
      setEstadoTerminal("");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forma de pago</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {cajaCerrada && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
              La caja de hoy ya está cerrada: esta venta no se puede guardar. No cobres; pídele a Administración que reabra el cierre del día.
            </p>
          )}
          <p className="text-sm">{descripcion}</p>
          <p className="text-2xl font-bold text-primary">{fmtCLP(monto)}</p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant={metodo === "efectivo" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("efectivo")}
            >
              Efectivo
            </Button>
            {terminal && (
              <Button variant="outline" className="flex-1" disabled={cobrandoTerminal || cajaCerrada} onClick={cobrarEnTerminal}>
                {cobrandoTerminal ? "Esperando el terminal…" : "Tarjeta (terminal)"}
              </Button>
            )}
            <Button
              variant={metodo === "tarjeta" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("tarjeta")}
            >
              {terminal ? "Tarjeta (manual)" : "Tarjeta"}
            </Button>
            <Button
              variant={metodo === "transferencia" ? "default" : "outline"}
              className="flex-1"
              disabled={cobrandoTerminal}
              onClick={() => seleccionar("transferencia")}
            >
              Transferencia bancaria
            </Button>
          </div>
          {cobrandoTerminal && estadoTerminal && <p className="text-sm text-muted-foreground">{estadoTerminal}</p>}
          {terminal && metodo === "tarjeta" && (
            <input
              placeholder="N° de voucher / operación (opcional)"
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
            />
          )}
          {metodo === "transferencia" && <DatosTransferencia />}

          {cliente && (
            <>
              <p className="text-sm font-medium">Documento</p>
              <div className="flex gap-2.5">
                {(["Boleta", "Factura"] as const).map((d) => (
                  <Button
                    key={d}
                    variant={documento === d ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => {
                      setDocumento(d);
                      setErr("");
                    }}
                  >
                    {d}
                  </Button>
                ))}
              </div>
              {documento === "Factura" && (
                <input
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  placeholder="Buscar empresa por nombre o RUT…"
                  value={busquedaEmpresa}
                  onChange={(e) => {
                    const q = e.target.value;
                    setBusquedaEmpresa(q);
                    setErr("");
                    // Una sola coincidencia: queda elegida sin abrir la lista.
                    const encontradas = filtrarEmpresas(data.empresas, q);
                    if (q.trim() && encontradas.length === 1) setEmpresaId(encontradas[0].id);
                  }}
                />
              )}
              {documento === "Factura" && busquedaEmpresa.trim() && empresaId !== NUEVA && !filtrarEmpresas(data.empresas, busquedaEmpresa).length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Lo buscado pasa al formulario: si era un RUT, al RUT;
                    // si no, a la razón social.
                    const q = busquedaEmpresa.trim();
                    setNueva((n) => (isValidRut(q) ? { ...n, rut: formatRut(q) } : { ...n, razonSocial: q }));
                    setEmpresaId(NUEVA);
                    setErr("");
                  }}
                >
                  No está registrada: registrar empresa nueva
                </Button>
              )}
              {documento === "Factura" && (
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={empresaId}
                  onChange={(e) => {
                    setEmpresaId(e.target.value);
                    setErr("");
                  }}
                >
                  <option value="">Elegir empresa…</option>
                  <option value={NUEVA}>+ Registrar empresa nueva</option>
                  {fichaConFactura && (
                    <option value={FICHA}>
                      {cliente.razonSocial || cliente.nombre} · {cliente.rut} (ficha del cliente)
                    </option>
                  )}
                  {/* La elegida se muestra aunque la búsqueda ya no la incluya,
                      para que el select no aparezca en blanco. */}
                  {filtrarEmpresas(data.empresas, busquedaEmpresa, empresaId)
                    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.razonSocial} · {e.rut}
                      </option>
                    ))}
                </select>
              )}
              {documento === "Factura" && empresaId === NUEVA && (
                <div className="grid gap-2">
                  {(
                    [
                      ["rut", "RUT (ej. 76.123.456-7)"],
                      ["razonSocial", "Razón Social"],
                      ["giro", "Giro"],
                      ["direccion", "Dirección, Comuna"],
                      ["email", "Correo para enviar la factura"],
                    ] as const
                  )
                    .filter(([campo]) => campo !== "email" || pideCorreo)
                    .map(([campo, placeholder]) => (
                    <input
                      key={campo}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      placeholder={placeholder}
                      type={campo === "email" ? "email" : "text"}
                      value={nueva[campo]}
                      onChange={(e) => cambiarNueva(campo, e.target.value)}
                      onBlur={campo === "rut" ? onRutNuevaBlur : undefined}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {fichaConFactura
                      ? "Queda registrada en Empresas. La ficha ya factura a otra empresa: esta venta queda pendiente en el Cierre."
                      : "Queda registrada en Empresas y en la ficha del cliente (pasa a factura); la factura sale sola al confirmar."}
                  </p>
                </div>
              )}
              {documento === "Factura" && !fichaConFactura && empresaId && empresaId !== NUEVA && (
                <p className="text-xs text-muted-foreground">La ficha del cliente pasa a factura con esta empresa; la factura sale sola al confirmar.</p>
              )}
            </>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={cobrandoTerminal} onClick={cerrar}>
            Cancelar
          </Button>
          <Button disabled={cobrandoTerminal || cajaCerrada} onClick={confirmar}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
