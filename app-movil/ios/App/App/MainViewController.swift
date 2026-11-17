import UIKit
import Capacitor

/// Pantalla principal (Main.storyboard): registra los plugins propios de la
/// app, que no vienen de un paquete npm.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GeocercaPlugin())
    }
}
