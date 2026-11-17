import Foundation
import UIKit
import Capacitor

/// Plugin "Geocerca" para la web (src/lib/appNativa.ts): misma interfaz que
/// GeocercaPlugin.java en Android. La lógica vive en GeocercaManager.
@objc(GeocercaPlugin)
public class GeocercaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GeocercaPlugin"
    public let jsName = "Geocerca"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abrirAjustes", returnType: CAPPluginReturnPromise),
    ]

    @objc func activar(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"),
              let lng = call.getDouble("lng"),
              let radio = call.getDouble("radio"),
              let token = call.getString("token"),
              let url = call.getString("url") else {
            call.reject("Faltan datos de la zona")
            return
        }
        // El token solo viaja a nuestro servidor, aunque el JS que llame pida otra cosa.
        guard url.hasPrefix("https://zplash.cl/") else {
            call.reject("URL no permitida")
            return
        }
        let pedir = call.getBool("pedirPermiso") ?? false
        GeocercaManager.shared.guardar(lat: lat, lng: lng, radio: radio, token: token, url: url)
        DispatchQueue.main.async {
            GeocercaManager.shared.asegurarPermiso(pedir: pedir) { estado in
                call.resolve(["estado": estado])
            }
        }
    }

    @objc func abrirAjustes(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}
