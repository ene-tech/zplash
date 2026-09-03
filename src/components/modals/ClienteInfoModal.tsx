"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import {
  anularSuscripcion,
  cobrarSuscripcionManual,
  enviarCuponAlCliente,
  obtenerDetallePagosVentas,
  obtenerSuscripcionOneclick,
  reactivarSuscripcionOneclick,
  suspenderSuscripcionOneclick,
} from "@/lib/serverActions";
import type { DetallePagoVenta, SuscripcionOneclickInfo } from "@/lib/dataAccess";
import {
  beneficioCupon,
  cuponDescuentoDePatente,
  cuponesVigentesDeCliente,
  fmtCLP,
  fmtDate,
  fmtFecha,
  formatTelefono,
  periodoPlan,
  visitasDesdeContratacion,
  visitasPeriodoPlan,
  visitasUltimos30Dias,
} from "@/lib/helpers";
import type { Cliente, Cupon } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RecorridoCliente } from "@/components/modals/RecorridoCliente";
import GenerarCuponesForm from "@/components/tabs/ventaEmpresa/GenerarCuponesForm";
import CrearDescuentoForm from "@/components/tabs/ventaEmpresa/CrearDescuentoForm";
import { useGenerarCupones } from "@/components/tabs/ventaEmpresa/useGenerarCupones";
import { useCrearDescuento } from "@/components/tabs/ventaEmpresa/useCrearDescuento";

export default function ClienteInfoModal({ data: c }: { data: Cliente }) {
  const { data: appData, commit, patchUi, loadingHistorial } = useAppData();
  const { inicio: inicioPeriodo, fin } = periodoPlan(c);
  // `fin` es exclusivo (inicio del ciclo siguiente); el período se muestra
  // hasta el día anterior, que es el que el cliente ve como vencimiento.
  const finPeriodo = new Date(fin);
  finPeriodo.setDate(finPeriodo.getDate() - 1);
  const visitasPeriodo = visitasPeriodoPlan(appData.ingresos, c);
  const tienePlan = !!c.vencimiento;
  const visitasPlan = tienePlan ? visitasDesdeContratacion(appData.ingresos, c) : visitasUltimos30Dias(appData.ingresos, c.id);
  // El descuento que se le aplica solo con leer la patente — mismo criterio que
  // usa el cobro (ver cuponDescuentoDePatente). Se cae al canal "web" cuando no
  // hay uno cobrable en el mesón: la ficha informa, no cobra, y un descuento
  // que el cliente sí tiene (aunque sea solo por la web) no puede leerse acá
  // como "No tiene". appData.cupones viene en loadCore, así que no depende de
  // loadingHistorial.
  const descuento = useMemo(
    () =>
      cuponDescuentoDePatente(appData.cupones, c.patente, "local") ??
      cuponDescuentoDePatente(appData.cupones, c.patente, "web"),
    [appData.cupones, c.patente]
  );

  // Los códigos que este cliente tiene vivos ahora mismo. Sale de
  // appData.cupones, que `commit` actualiza en el acto: el código aparece acá
  // apenas se genera con el atajo de más abajo, sin cerrar la ficha ni ir a
  // B2B/Tickets a buscarlo.
  const cuponesVigentes = useMemo(
    () => cuponesVigentesDeCliente(appData.cupones, { patente: c.patente, email: c.email, rut: c.rut }),
    [appData.cupones, c.patente, c.email, c.rut]
  );
  const [enviandoCodigo, setEnviandoCodigo] = useState("");
  const [envios, setEnvios] = useState<Record<string, string>>({});

  async function enviarCodigo(codigo: string) {
    setEnviandoCodigo(codigo);
    try {
      const r = await enviarCuponAlCliente(c.id, codigo);
      setEnvios((prev) => ({ ...prev, [codigo]: `${r.whatsapp} · ${r.correo}` }));
    } catch {
      setEnvios((prev) => ({ ...prev, [codigo]: "No se pudo enviar (sin conexión)" }));
    } finally {
      setEnviandoCodigo("");
    }
  }

  // Quitarle un descuento mal emitido sin ir a B2B/Tickets: mismo commit que
  // usa esa tabla (useCuponesList.eliminar), que se lleva la fila de la base.
  // Solo descuentos: los "vale" pueden venir de un Pack Empresa pagado, y esos
  // se siguen borrando desde B2B/Tickets. Confirmación en dos pasos acá mismo
  // (como "Cobrar ahora"): el ConfirmModal global reemplazaría esta ficha.
  const [confirmarBorrar, setConfirmarBorrar] = useState("");

  function eliminarDescuento(cup: Cupon) {
    setConfirmarBorrar("");
    commit({ cupones: appData.cupones.filter((x) => x.id !== cup.id) });
  }

  // Atajo para entregarle un cupón desde acá mismo: se montan los MISMOS
  // formularios de B2B/Tickets (no una copia recortada), así cualquier
  // parámetro que se agregue allá aparece también acá. Lo único que cambia
  // es que llegan prellenados con este cliente — ver el efecto de abajo.
  const [entregar, setEntregar] = useState<"descuento" | "vale" | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);
  const caducidadRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const dNombreRef = useRef<HTMLInputElement>(null);
  const dCaducidadRef = useRef<HTMLInputElement>(null);
  const dPatenteRef = useRef<HTMLInputElement>(null);
  const generarCupones = useGenerarCupones({ nombreRef, cantidadRef, caducidadRef, razonSocialRef, rutRef, direccionRef, giroRef });
  const crearDescuento = useCrearDescuento({ dNombreRef, dCaducidadRef, dPatenteRef });
  const { setPatentesAbierto, setPatentesTexto } = generarCupones;
  const nCupones = appData.cupones.length;

  // Prellenado del atajo. Corre al abrir cada formulario y después de cada
  // emisión (dep `nCupones`): los hooks de B2B limpian sus campos al terminar
  // y devuelven `patentesAbierto` a true, así que sin esto un segundo ticket
  // emitido sin cerrar el modal saldría abierto a CUALQUIER patente. La
  // patente se reimpone siempre (es de quién es este atajo); nombre y
  // cantidad solo si están vacíos, para no pisar lo que se esté tipeando.
  // Los campos son inputs no controlados de B2B, por eso se escriben por ref.
  useEffect(() => {
    if (entregar === "descuento") {
      if (dNombreRef.current && !dNombreRef.current.value) dNombreRef.current.value = `Cortesía ${c.nombre}`;
      if (dPatenteRef.current) dPatenteRef.current.value = c.patente;
      return;
    }
    if (entregar === "vale") {
      if (nombreRef.current && !nombreRef.current.value) nombreRef.current.value = `Cortesía ${c.nombre}`;
      if (cantidadRef.current && !cantidadRef.current.value) cantidadRef.current.value = "1";
      // Lote acotado a este auto: el ticket es para él, no abierto a cualquiera.
      setPatentesAbierto(false);
      setPatentesTexto(c.patente);
    }
  }, [entregar, nCupones, c.nombre, c.patente, setPatentesAbierto, setPatentesTexto]);
  const [suscripcion, setSuscripcion] = useState<SuscripcionOneclickInfo | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [confirmarCobro, setConfirmarCobro] = useState(false);
  const [errSuscripcion, setErrSuscripcion] = useState("");

  // Historial de compras completo del cliente — al estilo del pedido de
  // cliente en WooCommerce: qué compró, cuándo, cuánto pagó y con qué
  // comprobante, sin importar si fue por web, automático o registrado a
  // mano en local. appData.ventas llega en la oleada "historial" (ver
  // loadingHistorial), igual que visitasPeriodo/visitasPlan más abajo.
  const ventasCliente = useMemo(
    () => appData.ventas.filter((v) => v.clienteId === c.id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [appData.ventas, c.id]
  );
  const [detallePagos, setDetallePagos] = useState<Record<string, DetallePagoVenta>>({});

  const cerrar = () => patchUi({ modal: null });

  useEffect(() => {
    obtenerSuscripcionOneclick(c.patente)
      .then(setSuscripcion)
      .catch(() => setSuscripcion(null));
  }, [c.patente]);

  // Comprobante real de Transbank (authorizationCode) para las ventas de
  // este cliente que tengan Webpay/Oneclick detrás — ver dataAccess/pagos.ts.
  // Clave de dependencia por ids unidos (no el array en sí, que cambia de
  // referencia en cada render) para no repetir el fetch de más.
  const idsVentas = ventasCliente.map((v) => v.id).join(",");
  useEffect(() => {
    // Sin ventas no hay nada que pedir — detallePagos ya arranca en {} (ver
    // useState arriba), así que no hace falta setState acá para ese caso.
    if (!idsVentas) return;
    obtenerDetallePagosVentas(idsVentas.split(","))
      .then(setDetallePagos)
      .catch(() => setDetallePagos({}));
  }, [idsVentas]);

  // Cobra el ciclo a la tarjeta inscrita, ahora mismo. No es solo un reintento
  // tras un rechazo: también sirve cuando el cobro automático nunca llegó a
  // ejecutarse y el cliente quedó vencido con la tarjeta activa. La protección
  // contra cobrar dos veces el mismo mes vive en cobrarSuscripcion() (revisa
  // que no haya ya una fila "aprobada" para el ciclo), no acá.
  async function cobrarAhora() {
    if (!suscripcion) return;
    setCobrando(true);
    setErrSuscripcion("");
    try {
      const resultado = await cobrarSuscripcionManual(suscripcion.id);
      if (!resultado) {
        setErrSuscripcion("No se pudo ejecutar el cobro.");
        return;
      }
      const actualizada = await obtenerSuscripcionOneclick(c.patente);
      setSuscripcion(actualizada);
      if (resultado.estado === "rechazada") setErrSuscripcion("La tarjeta rechazó el cobro.");
    } catch {
      setErrSuscripcion("Este ciclo ya fue cobrado o hubo un error.");
    } finally {
      setCobrando(false);
    }
  }

  async function reactivar() {
    if (!suscripcion) return;
    setCobrando(true);
    setErrSuscripcion("");
    try {
      await reactivarSuscripcionOneclick(suscripcion.id);
      const actualizada = await obtenerSuscripcionOneclick(c.patente);
      setSuscripcion(actualizada);
    } catch {
      setErrSuscripcion("No se pudo reactivar la suscripción.");
    } finally {
      setCobrando(false);
    }
  }

  function suspender() {
    if (!suscripcion) return;
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Suspender la renovación automática de ${c.nombre}? Se pausan los cobros, pero la tarjeta queda inscrita y se puede reactivar después.`,
        confirmLabel: "Suspender",
        danger: false,
        onConfirm: () => suspenderSuscripcionOneclick(suscripcion.id),
      },
    });
  }

  // Corta el cobro automático por los dos frentes (Oneclick + la suscripción
  // vieja de WooCommerce) y manda el correo de respaldo — todo eso vive en
  // anularSuscripcion, ver ahí por qué la tarjeta NO se da de baja en
  // Transbank. No hace falta refrescar `suscripcion` después: el ConfirmModal
  // global reemplaza esta ficha.
  function anular() {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la suscripción de ${c.nombre}? Deja de cobrarse automáticamente (acá y en WooCommerce si arrastra una del sistema anterior) y se le manda un correo de respaldo. La tarjeta le queda guardada en su cuenta.`,
        confirmLabel: "Cancelar suscripción",
        danger: true,
        onConfirm: () => anularSuscripcion(c.id),
      },
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Información adicional</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="font-medium">{c.nombre}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Patente</div>
            <div className="font-medium">{c.patente}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</div>
            {/* Mismo formato +569XXXXXXXX con el que sale el WhatsApp (ver
                formatTelefono): lo que se lee acá es lo que se le manda. */}
            <div className="font-medium">{formatTelefono(c.telefono) || "No disponible"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Creado por</div>
            <div className="font-medium">{c.creadoPor || "No disponible"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Fecha de creación</div>
            <div className="font-medium">{c.creadoEn ? fmtDate(c.creadoEn) : "-"}</div>
          </div>
          <div>
            {/* Distinta de la fecha del último pago: es el ancla del ciclo
                mensual (ver vencimientoAnclado/periodoPlan), así que un pago
                atrasado no la mueve. Null en la carga histórica de
                WooCommerce, de ahí el guion. */}
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Contrató el plan</div>
            <div className="font-medium">{c.fechaContratacion ? fmtDate(c.fechaContratacion) : "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Vence</div>
            <div className="font-medium">{c.vencimiento ? fmtDate(c.vencimiento) : "Sin plan"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas último período</div>
            <div className="font-medium">
              {/* visitasPeriodo/visitasPlan salen de appData.ingresos, que
                  llega en la oleada "historial" (ver AppContext) — mientras
                  no esté, mostrarían 0 (parece "nunca viene") en vez de la
                  cifra real. Ver diagnóstico de performance 2026-08-10. */}
              {loadingHistorial ? "…" : visitasPeriodo} ({fmtFecha(inicioPeriodo.toISOString())} - {fmtFecha(finPeriodo.toISOString())})
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Visitas totales</div>
            <div className="font-medium">{c.visitas || 0}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {tienePlan ? "Visitas desde que contrató el plan" : "Visitas últimos 30 días"}
            </div>
            <div className="font-medium">{loadingHistorial ? "…" : visitasPlan}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Descuento disponible</div>
            <div className="font-medium">
              {descuento
                ? `${beneficioCupon(descuento)}${descuento.canal === "web" ? " (solo por la web)" : ""} — código ${descuento.codigo}, vence ${fmtDate(descuento.fechaCaducidad)}`
                : "No tiene"}
            </div>
          </div>
        </div>

        {/* También se muestra sin fila Oneclick cuando el cliente arrastra una
            suscripción de WooCommerce (ver renovacionAutoWooDesde): ahí el cobro
            automático vive allá y es el que hay que poder cortar desde acá. */}
        {(suscripcion || c.renovacionAutoWooDesde) && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-3.5 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Renovación automática</div>
              <div className="font-medium">
                {!suscripcion
                  ? "WooCommerce (sistema anterior)"
                  : suscripcion.estado === "activa"
                    ? "Activa"
                    : suscripcion.estado === "suspendida"
                      ? // Mismo texto venga de "Suspender" o de "Cancelar suscripción": las dos
                        // dejan la fila igual (el cron solo cobra "activa") y la tarjeta inscrita,
                        // así que decir "Suspendida" después de cancelar se leería como que la
                        // cancelación no se aplicó.
                        "Sin cobro automático (tarjeta guardada)"
                      : suscripcion.estado === "cancelada"
                        ? "Cancelada"
                        : "Pendiente"}
                {suscripcion?.cardUltimosDigitos ? ` (tarjeta ${suscripcion.cardUltimosDigitos})` : ""}
              </div>
            </div>
            {suscripcion?.proximoCobro && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Próximo cobro</div>
                <div className="font-medium">{fmtDate(suscripcion.proximoCobro)}</div>
              </div>
            )}
            {suscripcion?.ultimoCobro && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Último intento</div>
                <div className="font-medium">
                  {suscripcion.ultimoCobro.estado === "aprobada" ? "Aprobado" : "Rechazado"} — {fmtDate(suscripcion.ultimoCobro.fecha)}
                </div>
              </div>
            )}
            {(suscripcion?.estado === "activa" || suscripcion?.estado === "suspendida" || c.renovacionAutoWooDesde) && (
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                {/* Antes solo aparecía si el último intento había sido
                    rechazado, así que el caso más común de "tiene tarjeta y no
                    se le cobró" (el cobro nunca se ejecutó, no hay intento
                    previo) se quedaba sin botón. Confirmación en dos pasos acá
                    mismo en vez del ConfirmModal global: ese reemplaza esta
                    ficha y se perdería el resultado del cobro. */}
                {suscripcion?.estado === "activa" &&
                  (confirmarCobro ? (
                    <>
                      <Button
                        onClick={() => {
                          setConfirmarCobro(false);
                          cobrarAhora();
                        }}
                        disabled={cobrando}
                      >
                        {cobrando ? "Cobrando..." : `Sí, cobrar la tarjeta ${suscripcion.cardUltimosDigitos || ""}`.trim()}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmarCobro(false)} disabled={cobrando}>
                        No cobrar
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirmarCobro(true)} disabled={cobrando}>
                      {cobrando ? "Cobrando..." : "Cobrar ahora"}
                    </Button>
                  ))}
                {suscripcion?.estado === "activa" && (
                  <Button variant="secondary" onClick={suspender} disabled={cobrando}>
                    Suspender
                  </Button>
                )}
                {suscripcion?.estado === "suspendida" && (
                  <Button variant="secondary" onClick={reactivar} disabled={cobrando}>
                    {cobrando ? "Reactivando..." : "Reactivar"}
                  </Button>
                )}
                {(suscripcion?.estado === "activa" || c.renovacionAutoWooDesde) && (
                  <Button variant="destructive" onClick={anular} disabled={cobrando}>
                    Cancelar suscripción
                  </Button>
                )}
                {errSuscripcion && <p className="w-full text-sm text-destructive">{errSuscripcion}</p>}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-border pt-3.5">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Códigos vigentes</div>
          {cuponesVigentes.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">No tiene códigos vigentes.</p>
          ) : (
            <div className="mb-3 space-y-1.5">
              {cuponesVigentes.map((cup) => (
                <div key={cup.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-base font-semibold tracking-widest">{cup.codigo}</span>
                  <span className="text-muted-foreground">
                    {beneficioCupon(cup)} · vence {fmtFecha(cup.fechaCaducidad)}
                    {/* El lote solo dice algo cuando el ticket viene de un
                        pack (Pack Empresa por web, o un lote de cortesía): un
                        descuento suelto siempre sería "1/1". */}
                    {cup.totalLote > 1 && ` · ${cup.nombreLote} N° ${cup.numeroLote}/${cup.totalLote}`}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => enviarCodigo(cup.codigo)} disabled={enviandoCodigo === cup.codigo}>
                    {enviandoCodigo === cup.codigo ? "Enviando…" : "Enviar por WhatsApp y correo"}
                  </Button>
                  {cup.tipo === "descuento" &&
                    (confirmarBorrar === cup.id ? (
                      <>
                        <Button size="sm" variant="destructive" onClick={() => eliminarDescuento(cup)}>
                          Sí, eliminar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmarBorrar("")}>
                          No
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmarBorrar(cup.id)}
                      >
                        Eliminar
                      </Button>
                    ))}
                  {envios[cup.codigo] && <span className="text-xs text-muted-foreground">{envios[cup.codigo]}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Entregar cupón</span>
            <Button
              variant={entregar === "descuento" ? "default" : "secondary"}
              onClick={() => setEntregar(entregar === "descuento" ? null : "descuento")}
            >
              Descuento
            </Button>
            <Button
              variant={entregar === "vale" ? "default" : "secondary"}
              onClick={() => setEntregar(entregar === "vale" ? null : "vale")}
            >
              Ticket de lavado
            </Button>
          </div>
          {entregar === "descuento" && (
            <CrearDescuentoForm {...crearDescuento} dNombreRef={dNombreRef} dCaducidadRef={dCaducidadRef} dPatenteRef={dPatenteRef} />
          )}
          {entregar === "vale" && (
            <GenerarCuponesForm
              {...generarCupones}
              nombreRef={nombreRef}
              cantidadRef={cantidadRef}
              caducidadRef={caducidadRef}
              razonSocialRef={razonSocialRef}
              rutRef={rutRef}
              direccionRef={direccionRef}
              giroRef={giroRef}
            />
          )}
        </div>

        <div className="border-t border-border pt-3.5">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Historial de compras</div>
          {loadingHistorial ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : ventasCliente.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente todavía no tiene compras registradas.</p>
          ) : (
            // min-w-0: DialogContent es un grid (ver dialog.tsx) y sin esto
            // sus hijos no se dejan achicar por debajo del ancho natural de
            // la tabla, empujando TODO el diálogo más ancho — con solo
            // overflow-y-auto en el popup (sin overflow-x explícito), eso
            // termina scrolleando el diálogo completo hacia el costado en
            // vez de solo esta tabla. overflow-x-auto acá adentro contiene
            // el scroll horizontal donde corresponde. Sin límite de alto a
            // propósito (antes max-h-64): que se vean todas las filas de
            // una vez: el popup entero ya tiene su propio tope/scroll
            // vertical (max-h-[calc(100dvh-2rem)] en DialogContent) para
            // historiales muy largos.
            <div className="min-w-0 overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Comprobante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasCliente.map((v) => {
                    const detalle = detallePagos[v.id];
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(v.fecha)}</TableCell>
                        <TableCell className="whitespace-nowrap">{v.tipo}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtCLP(v.precio)}</TableCell>
                        <TableCell className="whitespace-nowrap">{v.creadoPor || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap capitalize">{v.metodoPago || "-"}</TableCell>
                        <TableCell>
                          {detalle ? (
                            <span title={`${detalle.origen === "webpay" ? "Webpay" : "Oneclick"} · buyOrder ${detalle.buyOrder}`}>
                              {detalle.authorizationCode || "-"} {detalle.responseCode === 0 ? "✓" : "✗"}
                            </span>
                          ) : (
                            v.voucher || "-"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <RecorridoCliente cliente={c} />

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
