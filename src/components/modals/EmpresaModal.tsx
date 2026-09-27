"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { RUT_FORMATO_MSG, fmtTelefono, formatRut, formatTelefono, isValidRut, uid } from "@/lib/helpers";
import type { Empresa } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const SIN_CONTACTO = "sin-contacto";

export default function EmpresaModal({ data: e, onGuardada }: { data: Empresa | null; onGuardada?: (empresa: Empresa) => void }) {
  const { data, commit, patchUi, ui } = useApp();
  const emp = e || ({} as Partial<Empresa>);

  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const [contacto, setContacto] = useState(emp.contactoClienteId || SIN_CONTACTO);
  const [err, setErr] = useState("");

  const cerrar = () => patchUi({ modal: null });

  const clientesOrdenados = [...data.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));

  // El RUT manda: si al salir del campo coincide con el RUT de un cliente ya
  // registrado, se usa ese cliente para completar el resto del formulario
  // (Razón Social, Dirección, Giro y Contacto), sin pisar campos que el
  // usuario ya haya llenado a mano.
  const onRutBlur = () => {
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (rutRef.current) rutRef.current.value = rutFormateado;
    const cliente = data.clientes.find((c) => c.rut && formatRut(c.rut) === rutFormateado);
    if (!cliente) return;
    if (razonSocialRef.current && !razonSocialRef.current.value.trim()) {
      razonSocialRef.current.value = cliente.razonSocial || cliente.nombre;
    }
    if (direccionRef.current && !direccionRef.current.value.trim() && cliente.direccion) {
      direccionRef.current.value = cliente.direccion;
    }
    if (giroRef.current && !giroRef.current.value.trim() && cliente.giro) {
      giroRef.current.value = cliente.giro;
    }
    if (contacto === SIN_CONTACTO) setContacto(cliente.id);
  };

  const onTelefonoBlur = () => {
    const raw = telefonoRef.current?.value.trim() || "";
    if (!raw || !telefonoRef.current) return;
    telefonoRef.current.value = fmtTelefono(raw);
  };

  const guardar = async () => {
    const razonSocial = razonSocialRef.current?.value.trim() || "";
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!razonSocial || !rutRaw) {
      setErr("Razón Social y RUT son obligatorios");
      return;
    }
    if (!isValidRut(rutRaw)) {
      setErr(RUT_FORMATO_MSG);
      return;
    }
    const rut = formatRut(rutRaw);
    const dup = data.empresas.find((x) => x.rut === rut && x.id !== emp.id);
    if (dup) {
      setErr("Ya existe una empresa registrada con ese RUT");
      return;
    }

    const giro = giroRef.current?.value.trim() || "";
    const direccion = direccionRef.current?.value.trim() || "";
    const telefonoRaw = telefonoRef.current?.value.trim() || "";
    const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
    const contactoClienteId = contacto === SIN_CONTACTO ? "" : contacto;
    const contactoNombre = contactoClienteId
      ? data.clientes.find((c) => c.id === contactoClienteId)?.nombre || ""
      : "";

    let empresas: Empresa[];
    let creada: Empresa | null = null;
    if (e) {
      const actualizado: Empresa = {
        ...(e as Empresa),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId,
        contactoNombre,
      };
      empresas = data.empresas.map((x) => (x.id === e.id ? actualizado : x));
    } else {
      const nuevo: Empresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId,
        contactoNombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "Administrador",
      };
      empresas = [...data.empresas, nuevo];
      creada = nuevo;
    }

    const ok = await commit({ empresas });
    if (!ok) {
      setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
      return;
    }
    if (creada) onGuardada?.(creada);
    cerrar();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{e ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="emp-rut">RUT</Label>
            <Input id="emp-rut" ref={rutRef} defaultValue={emp.rut || ""} placeholder="12.345.678-9" onBlur={onRutBlur} autoFocus={!e} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-razon">Razón Social</Label>
            <Input id="emp-razon" ref={razonSocialRef} defaultValue={emp.razonSocial || ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-giro">Giro</Label>
            <Input id="emp-giro" ref={giroRef} defaultValue={emp.giro || ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-direccion">Dirección</Label>
            <Input id="emp-direccion" ref={direccionRef} defaultValue={emp.direccion || ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="emp-telefono">Teléfono</Label>
            <Input
              id="emp-telefono"
              ref={telefonoRef}
              defaultValue={emp.telefono ? fmtTelefono(emp.telefono) : ""}
              placeholder="+569 -1111 1111"
              onBlur={onTelefonoBlur}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Persona de contacto</Label>
            <Select value={contacto} onValueChange={(v) => setContacto(v ?? SIN_CONTACTO)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CONTACTO}>Sin contacto asignado</SelectItem>
                {clientesOrdenados.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} — {c.rut ? formatRut(c.rut) : "sin RUT"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
