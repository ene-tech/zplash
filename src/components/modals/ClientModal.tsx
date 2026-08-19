"use client";

import { useRef, useState } from "react";
import { PLANES, fmtTelefono, todayYMD, vencimientoPorDefectoISO } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useClientModal } from "@/components/modals/useClientModal";
import SolicitudCambioPatenteAdmin from "@/components/modals/SolicitudCambioPatenteAdmin";

export default function ClientModal({
  data: c,
  contexto,
  patenteInicial,
}: {
  data: Cliente | null;
  contexto?: "operador" | "admin";
  patenteInicial?: string;
}) {
  const nombreRef = useRef<HTMLInputElement>(null);
  const patenteRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const vencRef = useRef<HTMLInputElement>(null);

  const r = useClientModal(c, contexto, {
    nombreRef,
    patenteRef,
    telefonoRef,
    emailRef,
    vehiculoRef,
    razonSocialRef,
    rutRef,
    direccionRef,
    giroRef,
    vencRef,
  });
  const cli = r.cli;
  // Estado propio (no pasa por AppContext.commit) para reflejar al toque el
  // resultado de solicitar/cancelar un cambio de patente diferido — ver
  // SolicitudCambioPatenteAdmin, que llama a los Server Actions directo.
  const [clienteConPatentePendiente, setClienteConPatentePendiente] = useState(c);

  return (
    <Dialog open onOpenChange={(open) => !open && r.cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{c ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cli-nombre">Nombre</Label>
            <Input id="cli-nombre" ref={nombreRef} defaultValue={cli.nombre || ""} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cli-patente">Patente</Label>
            <Input id="cli-patente" ref={patenteRef} defaultValue={cli.patente || patenteInicial || ""} className="uppercase" />
          </div>
          {contexto !== "operador" && clienteConPatentePendiente && clienteConPatentePendiente.vencimiento && (
            <SolicitudCambioPatenteAdmin cliente={clienteConPatentePendiente} onActualizado={setClienteConPatentePendiente} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cli-telefono">Teléfono</Label>
            <Input
              id="cli-telefono"
              ref={telefonoRef}
              defaultValue={cli.telefono ? fmtTelefono(cli.telefono) : "+569"}
              onBlur={r.onTelefonoBlur}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cli-email">Correo electrónico</Label>
            <Input id="cli-email" ref={emailRef} type="email" defaultValue={cli.email || ""} placeholder="correo@ejemplo.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cli-vehiculo">Vehículo (Marca y Modelo)</Label>
            <Input id="cli-vehiculo" ref={vehiculoRef} defaultValue={cli.vehiculo || ""} placeholder="Ej: Toyota Yaris" />
          </div>

          {contexto === "operador" ? (
            <div className="grid gap-1.5">
              <Label>Tipo de lavado</Label>
              <Select value={r.tipoCliente} onValueChange={(v) => r.setTipoCliente(v ?? "unico")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plan">Con Plan X5</SelectItem>
                  <SelectItem value="unico">Lavado Full Túnel (sin plan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>Tipo de cliente</Label>
                <Select value={r.tipoCliente} onValueChange={(v) => r.setTipoCliente(v ?? "unico")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plan">Con plan</SelectItem>
                    <SelectItem value="unico">Sin plan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {r.tipoCliente === "plan" && (
                <div className="grid gap-1.5">
                  <Label>Plan</Label>
                  <Select value={r.planSeleccionado} onValueChange={(v) => r.setPlanSeleccionado(v ?? PLANES[0])}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {contexto !== "operador" && (
            <div className="grid gap-1.5">
              <Label>Origen</Label>
              <Select value={r.origenSeleccionado} onValueChange={(v) => r.setOrigenSeleccionado(v as "LOCAL" | "WEB")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOCAL">Local</SelectItem>
                  <SelectItem value="WEB">Web</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Tipo de documento</Label>
            <Select value={r.tipoDoc} onValueChange={(v) => r.setTipoDoc(v as "Boleta" | "Factura")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Boleta">Boleta</SelectItem>
                <SelectItem value="Factura">Factura</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {r.tipoDoc === "Factura" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="cli-rut">RUT</Label>
                <Input id="cli-rut" ref={rutRef} defaultValue={cli.rut || ""} placeholder="12.345.678-9" onBlur={r.onRutBlur} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cli-razon">Razón Social</Label>
                <Input id="cli-razon" ref={razonSocialRef} defaultValue={cli.razonSocial || ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cli-direccion">Dirección</Label>
                <Input id="cli-direccion" ref={direccionRef} defaultValue={cli.direccion || ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cli-giro">Giro</Label>
                <Input id="cli-giro" ref={giroRef} defaultValue={cli.giro || ""} />
              </div>
            </>
          )}

          {contexto === "operador"
            ? r.tipoCliente === "plan" && (
                <div className="grid gap-1.5">
                  <Label>Vigencia del plan</Label>
                  <div className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-primary">
                    1 mes desde hoy — vence el {new Date(vencimientoPorDefectoISO()).toLocaleDateString("es-CL")}
                  </div>
                </div>
              )
            : r.tipoCliente === "plan" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="cli-venc">Vencimiento del plan</Label>
                  <Input
                    id="cli-venc"
                    ref={vencRef}
                    type="date"
                    defaultValue={cli.vencimiento ? cli.vencimiento.substring(0, 10) : todayYMD()}
                  />
                </div>
              )}

          {r.err && <p className="text-sm text-destructive">{r.err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={r.cerrar}>
            Cancelar
          </Button>
          <Button onClick={r.guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
