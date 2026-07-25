"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  PATENTE_FORMATO_MSG,
  PLANES,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  esExentoFormatoCliente,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  normPlate,
  planStatus,
  precioLavadoUnico,
  precioNormal,
  todayYMD,
  uid,
  vencimientoPorDefectoISO,
} from "@/lib/helpers";
import type { Cliente, Empresa, Ingreso, PagoInfo, Venta } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function ClientModal({ data: c, contexto }: { data: Cliente | null; contexto?: "operador" | "admin" }) {
  const { data, commit, patchUi, ui } = useApp();
  const cli = c || ({} as Partial<Cliente>);

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
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">(cli.tipoDocumento === "Factura" ? "Factura" : "Boleta");
  // Determina si el cliente tiene plan o no. Para clientes existentes se basa en
  // si ya tenía vencimiento; sin esto, el formulario de admin no tenía forma de
  // representar "sin plan" y cualquier edición le asignaba un vencimiento.
  const [tipoCliente, setTipoCliente] = useState(cli.vencimiento ? "plan" : "unico");
  const [planSeleccionado, setPlanSeleccionado] = useState(cli.plan || PLANES[0]);
  const [origenSeleccionado, setOrigenSeleccionado] = useState<"LOCAL" | "WEB">(cli.origen === "WEB" ? "WEB" : "LOCAL");
  const [err, setErr] = useState("");

  const cerrar = () => patchUi({ modal: null });

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos en vez de tipearlos de nuevo.
  // Si no existe, guardar() la crea con este cliente como contacto.
  const onRutBlur = () => {
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (rutRef.current) rutRef.current.value = rutFormateado;
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rutFormateado);
    if (!empresa) return;
    if (razonSocialRef.current) razonSocialRef.current.value = empresa.razonSocial;
    if (direccionRef.current) direccionRef.current.value = empresa.direccion || "";
    if (giroRef.current) giroRef.current.value = empresa.giro || "";
  };

  const onTelefonoBlur = () => {
    const raw = telefonoRef.current?.value.trim() || "";
    if (!raw || !telefonoRef.current) return;
    telefonoRef.current.value = fmtTelefono(raw);
  };

  const guardar = () => {
    const exentoFormato = esExentoFormatoCliente(ui.perfilActual?.nombre);
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    const patente = normPlate(patenteRef.current?.value || "");
    if (!nombre || !patente) {
      setErr("Nombre y patente son obligatorios");
      return;
    }
    if (!exentoFormato && !isValidPatente(patente)) {
      setErr(PATENTE_FORMATO_MSG);
      return;
    }
    const dup = data.clientes.find((x) => normPlate(x.patente) === patente && x.id !== cli.id);
    if (dup) {
      setErr("Ya existe un cliente con esa patente");
      return;
    }
    const telefonoRaw = telefonoRef.current?.value.trim() || "";
    // El campo precarga "+569" como ayuda para tipear solo los 8 dígitos
    // restantes (ver defaultValue más abajo); si el operador lo deja intacto
    // porque el cliente no tiene teléfono, no hay dígitos que validar — sin
    // este chequeo, formatTelefono("+569") devuelve "+569" tal cual (no matchea
    // ningún caso de conversión) e isValidTelefono lo rechaza por formato,
    // bloqueando el guardado de un cliente que en realidad no quiso ingresar
    // teléfono.
    const telefono = telefonoRaw && telefonoRaw !== "+569" ? formatTelefono(telefonoRaw) : "";
    if (!exentoFormato && telefono && !isValidTelefono(telefono)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    const email = emailRef.current?.value.trim() || "";
    const vehiculo = vehiculoRef.current?.value.trim() || "";
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDocumento === "Factura" ? rutRef.current?.value.trim() || "" : "";
    const direccion = tipoDocumento === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? giroRef.current?.value.trim() || "" : "";
    if (tipoDocumento === "Factura" && !exentoFormato) {
      if (!email || !isValidEmail(email)) {
        setErr("Ingresa un email válido para la factura");
        return;
      }
      if (!razonSocial || !direccion || !giro) {
        setErr("Completa Razón Social, Dirección y Giro para la factura");
        return;
      }
      if (!isValidRut(rutRaw)) {
        setErr(RUT_FORMATO_MSG);
        return;
      }
    }
    const rut = tipoDocumento === "Factura" ? formatRut(rutRaw) : "";

    let plan: string;
    let vencimiento: string | null;
    if (contexto === "operador") {
      plan = tipoCliente === "plan" ? PLANES[0] : "";
      if (tipoCliente === "plan") {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        vencimiento = d.toISOString();
      } else {
        vencimiento = null;
      }
    } else if (tipoCliente === "plan") {
      plan = planSeleccionado;
      const vencVal = vencRef.current?.value;
      vencimiento = vencVal ? new Date(vencVal).toISOString() : null;
    } else {
      plan = "";
      vencimiento = null;
    }

    const origen: "WEB" | "LOCAL" = contexto === "operador" ? "LOCAL" : origenSeleccionado;

    const persistir = async (pago?: PagoInfo) => {
      let clientes: Cliente[];
      let ventas = data.ventas;
      let ingresos = data.ingresos;
      let nuevaEmpresa: Empresa | undefined;

      if (c) {
        const actualizado: Cliente = {
          ...(c as Cliente),
          nombre,
          patente,
          telefono,
          email,
          vehiculo,
          plan,
          tipoDocumento,
          razonSocial,
          rut,
          direccion,
          giro,
          vencimiento,
          origen,
        };
        clientes = data.clientes.map((x) => (x.id === c.id ? actualizado : x));
        if (tipoDocumento === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
          nuevaEmpresa = {
            id: uid(),
            razonSocial,
            rut,
            giro,
            direccion,
            telefono,
            contactoClienteId: actualizado.id,
            contactoNombre: actualizado.nombre,
            creadoEn: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || (contexto === "operador" ? "" : "Administrador"),
          };
        }
      } else {
        const nuevo: Cliente = {
          id: "c" + Date.now() + Math.floor(Math.random() * 1000),
          nombre,
          patente,
          telefono,
          email,
          vehiculo,
          plan,
          tipoDocumento,
          razonSocial,
          rut,
          direccion,
          giro,
          vencimiento,
          origen,
          // El alta desde el punto de venta del operador ("+ Agregar vehículo
          // nuevo") es el vehículo entrando físicamente en ese momento, así
          // que ya cuenta como su primera visita (ver Ingreso más abajo). Un
          // alta desde el admin (ClientesTab) no implica que el cliente haya
          // pasado por el local.
          visitas: contexto === "operador" ? 1 : 0,
          ultimaVisita: contexto === "operador" ? new Date().toISOString() : undefined,
          creadoEn: new Date().toISOString(),
          creadoPor: contexto === "operador" ? ui.perfilActual?.nombre || "" : "Administrador",
        };
        clientes = [...data.clientes, nuevo];
        if (tipoDocumento === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
          nuevaEmpresa = {
            id: uid(),
            razonSocial,
            rut,
            giro,
            direccion,
            telefono,
            contactoClienteId: nuevo.id,
            contactoNombre: nuevo.nombre,
            creadoEn: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || (contexto === "operador" ? "" : "Administrador"),
          };
        }
        if (vencimiento && contexto === "operador") {
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: nuevo.plan || "",
            precio: precioNormal(data.precios, plan),
            tipo: "Plan nuevo",
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        } else if (!vencimiento && contexto === "operador") {
          // Tipo "unico" (sin plan): igual se cobra un lavado único.
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: "",
            precio: precioLavadoUnico(data.precios),
            tipo: "Lavado único",
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        }
        if (contexto === "operador") {
          // Sin esto, el cliente y la venta quedaban registrados (aparecía
          // cobrado en Cierre de Caja) pero el vehículo nunca quedaba
          // constancia de haber entrado al túnel: Historial de Ingresos no
          // mostraba nada para esta alta.
          const ingreso: Ingreso = {
            id: "i" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            fecha: new Date().toISOString(),
            planEstadoAlIngreso: planStatus(nuevo).cls,
            creadoPor: ui.perfilActual?.nombre || "",
          };
          ingresos = [ingreso, ...ingresos];
        }
      }

      const ok = await commit({
        clientes,
        ventas,
        ingresos,
        ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
      });
      if (!ok) {
        setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
        return;
      }
      cerrar();
    };

    // Solo el operador (punto de venta) cobra: editar un cliente existente
    // desde el admin es un cambio en su ficha, nunca pide medio de pago ni
    // genera una venta/movimiento en el cierre de caja. Lo mismo aplica a un
    // cliente nuevo creado desde el admin.
    if (contexto === "operador") {
      const monto = vencimiento ? precioNormal(data.precios, plan) : precioLavadoUnico(data.precios);
      const descripcion = vencimiento ? `Contratación de plan para ${nombre}` : `Lavado único para ${nombre}`;
      patchUi({ modal: { type: "pago", monto, descripcion, onConfirm: (pago) => persistir(pago) } });
    } else {
      persistir();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
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
            <Input id="cli-patente" ref={patenteRef} defaultValue={cli.patente || ""} className="uppercase" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cli-telefono">Teléfono</Label>
            <Input
              id="cli-telefono"
              ref={telefonoRef}
              defaultValue={cli.telefono ? fmtTelefono(cli.telefono) : "+569"}
              onBlur={onTelefonoBlur}
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
              <Select value={tipoCliente} onValueChange={(v) => setTipoCliente(v ?? "unico")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plan">Con Plan Ilimitado Mensual</SelectItem>
                  <SelectItem value="unico">Lavado Full Túnel (sin plan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>Tipo de cliente</Label>
                <Select value={tipoCliente} onValueChange={(v) => setTipoCliente(v ?? "unico")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plan">Con plan</SelectItem>
                    <SelectItem value="unico">Sin plan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tipoCliente === "plan" && (
                <div className="grid gap-1.5">
                  <Label>Plan</Label>
                  <Select value={planSeleccionado} onValueChange={(v) => setPlanSeleccionado(v ?? PLANES[0])}>
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
              <Select value={origenSeleccionado} onValueChange={(v) => setOrigenSeleccionado(v as "LOCAL" | "WEB")}>
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
            <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as "Boleta" | "Factura")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Boleta">Boleta</SelectItem>
                <SelectItem value="Factura">Factura</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoDoc === "Factura" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="cli-rut">RUT</Label>
                <Input id="cli-rut" ref={rutRef} defaultValue={cli.rut || ""} placeholder="12.345.678-9" onBlur={onRutBlur} />
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
            ? tipoCliente === "plan" && (
                <div className="grid gap-1.5">
                  <Label>Vigencia del plan</Label>
                  <div className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-primary">
                    1 mes desde hoy — vence el {new Date(vencimientoPorDefectoISO()).toLocaleDateString("es-CL")}
                  </div>
                </div>
              )
            : tipoCliente === "plan" && (
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
