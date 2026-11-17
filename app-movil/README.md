# App ZPlash (Android; iOS después)

Capacitor que carga `https://zplash.cl/cliente`. Cada deploy en Vercel actualiza la app sin pasar por la tienda;
solo hay que publicar versión nueva si cambia algo de esta carpeta (código nativo, permisos, ícono).

Lo nativo propio está en `android/app/src/main/java/cl/zplash/app/`:
- `GeocercaPlugin` / `GeocercaRegistro`: registran la zona del local en el sistema (la pide la web en `/api/app/geocerca`).
- `GeocercaReceiver`: al entrar a la zona hace POST a `/api/app/geocerca` con el token de Firebase. El servidor decide el descuento (regla "cerca_local").
- `ReinicioReceiver`: vuelve a registrar la zona después de reiniciar el teléfono o actualizar la app.

## Preparar (una vez)
1. Instalar Android Studio (trae Java y el SDK).
2. Firebase: crear proyecto, agregar app Android con paquete `cl.zplash.app`, bajar `google-services.json` a `android/app/` (no se sube a git).
3. Firebase → Cuentas de servicio → Generar clave: el JSON entero va en Vercel como `FIREBASE_SERVICE_ACCOUNT`.

## Compilar
```
cd app-movil
npm install
npx cap sync android
npx cap open android   # Android Studio: Run (teléfono por USB) o Build > Generate Signed Bundle (Play Store)
```
