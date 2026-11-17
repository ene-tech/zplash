package cl.zplash.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Geocerca del local: el sistema operativo vigila la zona (aunque la app esté
 * cerrada) y al entrar despierta a GeocercaReceiver, que avisa al servidor
 * (/api/app/geocerca). El servidor decide si corresponde descuento y lo manda
 * como push. Lo llama la web desde src/lib/appNativa.ts.
 *
 * Estados que devuelve activar(): "activa", "sin_permiso" (negó ubicación),
 * "sin_permiso_fondo" (solo "mientras se usa la app": no alcanza).
 */
@CapacitorPlugin(
    name = "Geocerca",
    permissions = {
        @Permission(alias = "ubicacion", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "fondo", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
    }
)
public class GeocercaPlugin extends Plugin {

    @PluginMethod
    public void activar(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        Float radio = call.getFloat("radio");
        String token = call.getString("token");
        String url = call.getString("url");
        if (lat == null || lng == null || radio == null || token == null || url == null) {
            call.reject("Faltan datos de la zona");
            return;
        }
        // El token solo viaja a nuestro servidor, aunque el JS que llame pida otra cosa.
        if (!url.startsWith("https://zplash.cl/")) {
            call.reject("URL no permitida");
            return;
        }
        GeocercaRegistro.guardar(getContext(), lat, lng, radio, token, url);

        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            if (call.getBoolean("pedirPermiso", false)) {
                requestPermissionForAlias("ubicacion", call, "trasUbicacion");
            } else {
                resolver(call, "sin_permiso");
            }
            return;
        }
        continuar(call);
    }

    @PermissionCallback
    private void trasUbicacion(PluginCall call) {
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            resolver(call, "sin_permiso");
            return;
        }
        continuar(call);
    }

    // Android 10+ pide aparte la ubicación "todo el tiempo"; sin ella el
    // sistema no avisa con la app cerrada. En Android 11+ este pedido lleva a
    // la pantalla de ajustes del permiso.
    private void continuar(PluginCall call) {
        boolean necesitaFondo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        if (necesitaFondo && getPermissionState("fondo") != PermissionState.GRANTED) {
            if (call.getBoolean("pedirPermiso", false) && !call.getBoolean("yaPidioFondo", false)) {
                call.getData().put("yaPidioFondo", true);
                requestPermissionForAlias("fondo", call, "trasFondo");
            } else {
                resolver(call, "sin_permiso_fondo");
            }
            return;
        }
        registrarYResolver(call);
    }

    @PermissionCallback
    private void trasFondo(PluginCall call) {
        if (getPermissionState("fondo") != PermissionState.GRANTED) {
            resolver(call, "sin_permiso_fondo");
            return;
        }
        registrarYResolver(call);
    }

    private void registrarYResolver(PluginCall call) {
        GeocercaRegistro.registrar(getContext(), ok -> resolver(call, ok ? "activa" : "sin_permiso"));
    }

    private void resolver(PluginCall call, String estado) {
        JSObject r = new JSObject();
        r.put("estado", estado);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
