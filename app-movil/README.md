# App ZPlash (Android e iOS)

Capacitor que carga `https://zplash.cl/cliente`. Cada deploy en Vercel actualiza la app sin pasar por la tienda;
solo hay que publicar versión nueva si cambia algo de esta carpeta (código nativo, permisos, ícono).

## Lo nativo propio

Android, en `android/app/src/main/java/cl/zplash/app/`:
- `GeocercaPlugin` / `GeocercaRegistro`: registran la zona del local en el sistema (la pide la web en `/api/app/geocerca`).
- `GeocercaReceiver`: al entrar a la zona hace POST a `/api/app/geocerca` con el token de Firebase. El servidor decide el descuento (regla "cerca_local").
- `ReinicioReceiver`: vuelve a registrar la zona después de reiniciar el teléfono o actualizar la app.

iOS, en `ios/App/App/`:
- `GeocercaPlugin.swift` (misma interfaz que el de Android) y `GeocercaManager.swift` (monitoreo de región de iOS; al entrar, el mismo POST).
- `MainViewController.swift`: registra el plugin. `AppDelegate.swift`: Firebase y el token de push (iOS entrega el de Apple; se cambia por el de Firebase, que es el que usa `src/lib/push/fcm.ts`).

## Android

Preparar (una vez):
1. Instalar Android Studio (trae Java y el SDK).
2. Firebase (proyecto zplash-d3ad5): app Android `cl.zplash.app`, bajar `google-services.json` a `android/app/` (no se sube a git).
3. Firebase → Cuentas de servicio → Generar clave: el JSON entero va en Vercel como `FIREBASE_SERVICE_ACCOUNT`.

Llave de subida a Google Play: `android/keystore/zplash-upload.jks` + `keystore.properties` (fuera de git).
**Respaldarlas fuera del PC**: sin ellas no se puede actualizar la app en Play (hay que pedir a Google un cambio de llave).

Compilar (con `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`):
```
cd app-movil
npm install
npx cap sync android
cd android
gradlew assembleDebug    # APK para instalar por USB
gradlew bundleRelease    # app/build/outputs/bundle/release/app-release.aab para Play Console
```
Antes de cada subida a Play, subir `versionCode` en `android/app/build.gradle`.

## iOS (se compila en la nube: no hay Mac)

Preparar (una vez, con la cuenta Apple Developer de la empresa):
1. App Store Connect: crear la app con bundle id `cl.zplash.app`.
2. Apple Developer → Keys: crear una clave APNs (.p8) y subirla en Firebase → Configuración → Cloud Messaging → app iOS.
3. Firebase: agregar app iOS `cl.zplash.app` y bajar `GoogleService-Info.plist`.
4. codemagic.io: conectar el repo, integración "App Store Connect" (API key) llamada `ZPlash App Store Connect`,
   y grupo de variables `firebase_ios` con `GOOGLE_SERVICE_INFO_PLIST` = el plist en base64
   (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("GoogleService-Info.plist"))`).

Compilar: correr el workflow `ios-app-store` de `codemagic.yaml` (raíz del repo). Sube el build a TestFlight.
