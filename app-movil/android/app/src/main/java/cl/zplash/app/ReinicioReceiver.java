package cl.zplash.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android borra las geocercas al reiniciar o al actualizar la app: las vuelve a registrar. */
public class ReinicioReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(accion) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) {
            PendingResult pendiente = goAsync();
            GeocercaRegistro.registrar(ctx, ok -> pendiente.finish());
        }
    }
}
