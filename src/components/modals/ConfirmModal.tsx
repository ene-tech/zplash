"use client";

import { useAppAcciones } from "@/context/AppContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmModal({
  mensaje,
  onConfirm,
  confirmLabel = "Eliminar",
  danger = true,
}: {
  mensaje: string;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const { patchUi } = useAppAcciones();
  const cerrar = () => patchUi({ modal: null });

  return (
    <AlertDialog open onOpenChange={(open) => !open && cerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar</AlertDialogTitle>
          {/* pre-line: hay confirmaciones que llegan con un resumen de varias
              líneas (ver resumenCierreTexto en @/lib/helpers/cierre). */}
          <AlertDialogDescription className="whitespace-pre-line">
            {mensaje || "¿Confirmas esta acción?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cerrar}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={danger ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              cerrar();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
