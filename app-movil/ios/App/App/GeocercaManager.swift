import Foundation
import CoreLocation
import UIKit

/// Geocerca del local en iPhone (par de GeocercaRegistro/GeocercaReceiver en
/// Android). iOS vigila la región aunque la app esté cerrada: al entrar la
/// relanza en segundo plano y llama a didEnterRegion, que avisa al servidor
/// (/api/app/geocerca) con el token de push. El servidor decide si hay
/// descuento y lo manda como notificación.
///
/// Es un singleton creado al arrancar la app (AppDelegate): cuando iOS la
/// relanza por la región, el delegate tiene que existir antes del evento.
final class GeocercaManager: NSObject, CLLocationManagerDelegate {
    static let shared = GeocercaManager()

    private let manager = CLLocationManager()
    private let prefs = UserDefaults.standard
    private let idRegion = "zplash-local"
    private var pendiente: (() -> Void)?
    private var observadorActiva: NSObjectProtocol?

    private override init() {
        super.init()
        manager.delegate = self
    }

    func guardar(lat: Double, lng: Double, radio: Double, token: String, url: String) {
        prefs.set(lat, forKey: "geocerca.lat")
        prefs.set(lng, forKey: "geocerca.lng")
        prefs.set(radio, forKey: "geocerca.radio")
        prefs.set(token, forKey: "geocerca.token")
        prefs.set(url, forKey: "geocerca.url")
    }

    /// Al arrancar: si ya tiene zona y permiso, vuelve a registrar la región
    /// (equivale a ReinicioReceiver en Android).
    func reRegistrar() {
        if manager.authorizationStatus == .authorizedAlways { registrar() }
    }

    /// Estados iguales a los de Android: "activa", "sin_permiso" (negó la
    /// ubicación) o "sin_permiso_fondo" (solo "al usar la app": no alcanza para
    /// avisar con la app cerrada).
    func asegurarPermiso(pedir: Bool, listo: @escaping (String) -> Void) {
        switch manager.authorizationStatus {
        case .authorizedAlways:
            listo(registrar() ? "activa" : "sin_permiso")
        case .notDetermined:
            guard pedir else { listo("sin_permiso"); return }
            esperarRespuesta { self.asegurarPermiso(pedir: pedir, listo: listo) }
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // iOS muestra el pedido de "Siempre" una sola vez; después solo se
            // cambia desde Ajustes (botón "Abrir Ajustes" en la app).
            if pedir && !prefs.bool(forKey: "geocerca.pidioSiempre") {
                prefs.set(true, forKey: "geocerca.pidioSiempre")
                esperarRespuesta { self.asegurarPermiso(pedir: false, listo: listo) }
                manager.requestAlwaysAuthorization()
            } else {
                listo("sin_permiso_fondo")
            }
        default:
            listo("sin_permiso")
        }
    }

    // El diálogo del sistema deja la app inactiva y al cerrarse vuelve a
    // activa; si el usuario no cambia nada (ej. "Mantener solo al usar") iOS
    // no avisa por el delegate, así que se escucha también la vuelta.
    private func esperarRespuesta(_ siguiente: @escaping () -> Void) {
        pendiente = siguiente
        observadorActiva = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self?.resolverPendiente() }
        }
    }

    private func resolverPendiente() {
        guard let siguiente = pendiente else { return }
        pendiente = nil
        if let o = observadorActiva { NotificationCenter.default.removeObserver(o) }
        observadorActiva = nil
        siguiente()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .notDetermined { resolverPendiente() }
    }

    @discardableResult
    private func registrar() -> Bool {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self),
              prefs.object(forKey: "geocerca.lat") != nil else { return false }
        for r in manager.monitoredRegions where r.identifier == idRegion { manager.stopMonitoring(for: r) }
        let centro = CLLocationCoordinate2D(latitude: prefs.double(forKey: "geocerca.lat"), longitude: prefs.double(forKey: "geocerca.lng"))
        let radio = min(prefs.double(forKey: "geocerca.radio"), manager.maximumRegionMonitoringDistance)
        let region = CLCircularRegion(center: centro, radius: radio, identifier: idRegion)
        region.notifyOnEntry = true
        region.notifyOnExit = false
        manager.startMonitoring(for: region)
        return true
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == idRegion else { return }
        avisarServidor()
    }

    private func avisarServidor() {
        guard let token = prefs.string(forKey: "geocerca.token"),
              let texto = prefs.string(forKey: "geocerca.url"),
              texto.hasPrefix("https://zplash.cl/"),
              let url = URL(string: texto) else { return }
        var pedido = URLRequest(url: url, timeoutInterval: 8)
        pedido.httpMethod = "POST"
        pedido.setValue("application/json", forHTTPHeaderField: "Content-Type")
        pedido.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])
        // Con la app en segundo plano iOS da unos segundos: se pide tiempo
        // extra hasta que el servidor conteste.
        var tarea: UIBackgroundTaskIdentifier = .invalid
        tarea = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(tarea) }
        URLSession.shared.dataTask(with: pedido) { _, _, _ in
            UIApplication.shared.endBackgroundTask(tarea)
        }.resume()
    }
}
