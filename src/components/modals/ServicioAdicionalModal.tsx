"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import PriceInput from "@/components/PriceInput";
import { fmtCLP } from "@/lib/helpers";
import type { Venta } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const priceInputClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

// Edición reservada a Gerencia (módulo "permisos", ver puedeEditar en
// ServiciosAdicionalesLog): permite corregir un servicio ya registrado sin
// tener que borrarlo y volver a cargarlo desde cero. No toca patente, cliente
// ni la cita/agenda asociada — solo los datos propios de la venta.
export default function ServicioAdicionalModal({ data: v }: { data: Venta }) {
  const { data, commit, patchUi } = useAppData();

  const nombreRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const [precioTexto, setPrecioTexto] = useState(String(v.precio || 0));
  const [estadoPago, setEstadoPago] = useState<"pagado" | "abono50" | "pendiente">(v.estadoPago || "pendiente");
  const [montoAbonoTexto, setMontoAbonoTexto] = useState(String(v.montoCobrado ?? 0));
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | "">(v.metodoPago || "");
  const [fechaEntrega, setFechaEntrega] = useState(v.fechaEntrega || "");
  const [horaEntrega, setHoraEntrega] = useState(v.horaEntrega || "");
  const [err, setErr] = useState("");

  const precio = Number(precioTexto || "0");

  const cerrar = () => patchUi({ modal: null });

  const guardar = async () => {
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    if (!nombre) {
      setErr("El nombre es obligatorio");
      return;
    }
    const tipo = tipoRef.current?.value.trim() || "";
    if (!tipo) {
      setErr("El detalle del servicio es obligatorio");
      return;
    }
    if (!precio || precio <= 0) {
      setErr("El precio debe ser mayor a 0");
      return;
    }
    let montoCobrado = 0;
    if (estadoPago === "pagado") {
      montoCobrado = precio;
    } else if (estadoPago === "abono50") {
      montoCobrado = Number(montoAbonoTexto || "0");
      if (!montoCobrado || montoCobrado <= 0 || montoCobrado > precio) {
        setErr("El abono debe ser mayor a 0 y no superar el precio");
        return;
      }
    }

    const actualizado: Venta = {
      ...v,
      nombre,
      tipo,
      precio,
      estadoPago,
      montoCobrado,
      metodoPago: metodoPago || undefined,
      fechaEntrega: fechaEntrega || undefined,
      horaEntrega: horaEntrega || undefined,
      notas: notasRef.current?.value.trim() || undefined,
    };

    const ok = await commit({ ventas: data.ventas.map((x) => (x.id === v.id ? actualizado : x)) });
    if (!ok) {
      setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
      return;
    }
    cerrar();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar servicio de {v.patente}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sa-nombre">Nombre</Label>
            <Input id="sa-nombre" ref={nombreRef} defaultValue={v.nombre} autoFocus />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sa-tipo">Servicio / detalle</Label>
            <Input id="sa-tipo" ref={tipoRef} defaultValue={v.tipo} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sa-precio">Precio</Label>
            <PriceInput value={precioTexto} onChange={setPrecioTexto} className={priceInputClassName} />
          </div>

          <div className="grid gap-1.5">
            <Label>Estado de pago</Label>
            <Select value={estadoPago} onValueChange={(val) => setEstadoPago(val as typeof estadoPago)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Por pagar</SelectItem>
                <SelectItem value="abono50">Abono parcial</SelectItem>
                <SelectItem value="pagado">Pagado 100%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {estadoPago === "abono50" && (
            <div className="grid gap-1.5">
              <Label htmlFor="sa-abono">Monto abonado</Label>
              <PriceInput value={montoAbonoTexto} onChange={setMontoAbonoTexto} className={priceInputClassName} />
              <p className="text-xs text-muted-foreground">De un total de {fmtCLP(precio)}</p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Forma de pago</Label>
            <Select
              value={metodoPago || "sin-especificar"}
              onValueChange={(val) => setMetodoPago(val === "sin-especificar" ? "" : (val as typeof metodoPago))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin-especificar">Sin especificar</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Fecha y hora de Entrega</Label>
            <div className="flex gap-2.5">
              <Input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                className="flex-1"
              />
              <Input
                type="time"
                value={horaEntrega}
                onChange={(e) => setHoraEntrega(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sa-notas">Notas / Observaciones</Label>
            <Textarea id="sa-notas" ref={notasRef} rows={3} defaultValue={v.notas || ""} />
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
