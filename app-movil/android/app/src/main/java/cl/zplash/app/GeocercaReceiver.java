package cl.zplash.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * El sistema lo despierta al entrar a la zona del local. Solo avisa al
 * servidor con el token de Firebase del teléfono: el servidor decide si hay
 * descuento y, si lo hay, llega como push. No se manda la ubicación.
 */
public class GeocercaReceiver extends BroadcastReceiver {
    private static final String TAG = "Geocerca";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        GeofencingEvent evento = GeofencingEvent.fromIntent(intent);
        if (evento == null || evento.hasError() || evento.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;

        SharedPreferences p = GeocercaRegistro.prefs(ctx);
        String token = p.getString("token", null);
        String url = p.getString("url", null);
        if (token == null || url == null) return;

        PendingResult pendiente = goAsync();
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(url).openConnection();
                con.setRequestMethod("POST");
                con.setConnectTimeout(8000);
                con.setReadTimeout(8000);
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                byte[] cuerpo = new JSONObject().put("token", token).toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = con.getOutputStream()) {
                    os.write(cuerpo);
                }
                con.getResponseCode();
            } catch (Exception e) {
                Log.w(TAG, "No se pudo avisar la entrada a la zona", e);
            } finally {
                if (con != null) con.disconnect();
                pendiente.finish();
            }
        }).start();
    }
}
