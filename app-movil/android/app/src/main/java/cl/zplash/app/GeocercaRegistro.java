package cl.zplash.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

/**
 * Guarda la zona y el token en SharedPreferences y la registra en el sistema.
 * Android borra las geocercas al reiniciar el teléfono o actualizar la app:
 * ReinicioReceiver las vuelve a registrar desde lo guardado.
 */
final class GeocercaRegistro {
    static final String PREFS = "geocerca";
    private static final String ID_ZONA = "zplash-local";

    interface Listo { void listo(boolean ok); }

    private GeocercaRegistro() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void guardar(Context ctx, double lat, double lng, float radio, String token, String url) {
        prefs(ctx).edit()
            .putString("lat", String.valueOf(lat))
            .putString("lng", String.valueOf(lng))
            .putFloat("radio", radio)
            .putString("token", token)
            .putString("url", url)
            .apply();
    }

    private static PendingIntent intent(Context ctx) {
        Intent i = new Intent(ctx, GeocercaReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 0, i, flags);
    }

    @SuppressLint("MissingPermission") // se verifica abajo: ReinicioReceiver llega sin pasar por el plugin
    static void registrar(Context ctx, Listo listo) {
        SharedPreferences p = prefs(ctx);
        String lat = p.getString("lat", null);
        String lng = p.getString("lng", null);
        if (lat == null || lng == null
            || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            listo.listo(false);
            return;
        }
        Geofence zona = new Geofence.Builder()
            .setRequestId(ID_ZONA)
            .setCircularRegion(Double.parseDouble(lat), Double.parseDouble(lng), p.getFloat("radio", 400f))
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
            // Hasta 2 min de demora a cambio de menos batería.
            .setNotificationResponsiveness(120_000)
            .build();
        // Sin disparo inicial: abrir la app estando YA en el local (en la
        // fila del túnel) no debe regalar un descuento.
        GeofencingRequest pedido = new GeofencingRequest.Builder()
            .setInitialTrigger(0)
            .addGeofence(zona)
            .build();
        GeofencingClient cliente = LocationServices.getGeofencingClient(ctx);
        PendingIntent pi = intent(ctx);
        cliente.removeGeofences(pi).addOnCompleteListener(t -> {
            try {
                cliente.addGeofences(pedido, pi)
                    .addOnSuccessListener(v -> listo.listo(true))
                    .addOnFailureListener(e -> listo.listo(false));
            } catch (SecurityException e) {
                // Le quitaron el permiso entre medio.
                listo.listo(false);
            }
        });
    }
}
