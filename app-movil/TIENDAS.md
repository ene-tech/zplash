# Fichas de Google Play y App Store

Textos para copiar y pegar al publicar la app. Las capturas se sacan desde
producción con la cuenta de revisión (ver "Cuenta de revisión" más abajo).

Desarrollador en las dos tiendas: **Servicio e Inversiones Las Águilas SpA**
(cuenta de organización, con D-U-N-S). Correo de contacto: contacto@zplash.cl.

---

## Datos comunes

| Campo | Valor |
|---|---|
| Nombre de la app | ZPlash Car Wash |
| Paquete / Bundle ID | `cl.zplash.app` |
| Categoría | Estilo de vida (Play) · Estilo de vida (App Store) |
| Sitio web | https://zplash.cl |
| Correo de soporte | contacto@zplash.cl |
| Política de privacidad | https://zplash.cl/privacidad |
| Eliminar la cuenta | https://zplash.cl/privacidad#eliminar-cuenta |
| Precio | Gratis, sin compras dentro de la app (los lavados se pagan con Transbank) |
| Público | Mayores de 18 años, sin publicidad |

## Cuenta de revisión

Para el formulario "Acceso a la app" (Play) y "Información de inicio de sesión" (App Store):

- Correo: `revision@zplash.cl`
- Código: el valor de `CODIGO_REVISION_TIENDAS` en Vercel (6 dígitos). No se escribe en el repo.
- Instrucciones (pegar tal cual):

> Inicia sesión con "Ya tengo cuenta", ingresa revision@zplash.cl y toca "Enviar código". No llega ningún correo: el código para esta cuenta de revisión es fijo y es el indicado arriba. La cuenta tiene un vehículo de prueba (patente ZZZZ99). Las compras se pagan en Webpay de Transbank (servicio de lavado presencial, no contenido digital); no es necesario completar un pago para revisar la app.

---

## Google Play

**Descripción breve** (máx. 80 caracteres):

> Tu plan de lavado, tickets y descuentos de ZPlash Car Wash Temuco en tu bolsillo.

**Descripción completa:**

> ZPlash es el túnel de lavado de autos de Prieto Norte 71, Temuco. Con la app tienes todo tu lavado a mano:
>
> • Tu plan X5 y tus tickets: cuántos lavados te quedan y hasta cuándo valen.
> • Compra tu plan, un lavado o un pack desde el teléfono y paga con Webpay.
> • Tus descuentos a la vista: los cupones de tu patente aparecen en Inicio, listos para usar en el mesón.
> • Aviso cuando pasas cerca: si tienes un descuento esperándote y pasas cerca del local, te avisamos (solo si activas la ubicación; no guardamos tus recorridos).
> • Regala $2.000 y gana $2.000: comparte tu link con tus amigos y gana descuentos cuando lo usen.
> • Administra tus patentes, tus tarjetas para el cobro automático y tus boletas.
>
> Entras con tu correo, sin contraseñas: te mandamos un código para verificar que eres tú.

**Clasificación de contenido** (cuestionario IARC): categoría "Utilidad, productividad, comunicación u otra"; responder **No** a todo (violencia, sexo, lenguaje, drogas, apuestas). Sí a "la app permite comprar bienes físicos o servicios" (no son compras dentro de la app de contenido digital).

**Anuncios:** No contiene anuncios.

**Público objetivo:** 18 años o más.

### Seguridad de los datos (Data safety)

- ¿Recopila o comparte datos? **Sí recopila, no comparte** (los proveedores que procesan por cuenta nuestra no cuentan como "compartir").
- ¿Datos cifrados en tránsito? **Sí**.
- ¿El usuario puede pedir que se borren? **Sí** → https://zplash.cl/privacidad#eliminar-cuenta

| Tipo de dato | ¿Recopilado? | Obligatorio | Para qué |
|---|---|---|---|
| Información personal → Correo | Sí | Obligatorio | Funcionalidad, gestión de la cuenta |
| Información personal → Nombre | Sí | Obligatorio | Funcionalidad, gestión de la cuenta |
| Información personal → Teléfono | Sí | Opcional | Funcionalidad, comunicaciones del desarrollador |
| Información personal → Otra (patente del vehículo, RUT y datos de factura si la pide) | Sí | Patente obligatoria, factura opcional | Funcionalidad |
| Información financiera → Historial de compras | Sí | Obligatorio | Funcionalidad, gestión de la cuenta |
| Información financiera → Información de pago (tipo y últimos 4 dígitos de la tarjeta) | Sí | Opcional | Funcionalidad |
| Ubicación → Ubicación aproximada | Sí | Opcional | Funcionalidad (aviso de descuento al pasar cerca del local) |
| Actividad en la app → Interacciones | Sí | Opcional (solo si acepta las cookies) | Estadísticas |
| ID de dispositivo u otros ID (token de notificaciones) | Sí | Opcional | Funcionalidad (notificaciones) |

### Permiso de ubicación en segundo plano

Play pide una declaración y un **video** (subido a YouTube como "no listado", menos de 30 s) que muestre la función.

**Declaración** (pegar):

> La app avisa al cliente cuando pasa cerca del local de ZPlash (radio de 400 metros) si tiene un descuento disponible. Para eso registra una geocerca del sistema alrededor del local, que debe funcionar con la app cerrada: el aviso solo sirve si llega mientras el cliente maneja cerca, no cuando abre la app. La app no lee ni guarda la ubicación ni los recorridos; el sistema solo le avisa que entró a la zona del local. El permiso es opcional: el cliente lo activa desde "Activar avisos" y puede quitarlo en los ajustes del teléfono.

**Qué grabar en el video:** abrir la app → Inicio → "Activar avisos" → aceptar notificaciones → aceptar ubicación "Permitir todo el tiempo" → mostrar la notificación "Estás cerca de ZPlash" (se puede mostrar una que ya llegó en la bandeja).

### Versiones

- El archivo es `android/app/build/outputs/bundle/release/app-release.aab` (`gradlew bundleRelease`).
- Antes de cada subida nueva, subir `versionCode` en `android/app/build.gradle` (1 → 2 → 3…). Play rechaza un número repetido.
- Activar "Firma de apps de Google Play" (la llave de `android/keystore/` queda como llave de subida).
- Cuenta de organización nueva: no exige la prueba cerrada de 12 personas por 14 días (eso es para cuentas personales).

---

## App Store

| Campo | Valor |
|---|---|
| Subtítulo (máx. 30) | Lavado de autos en Temuco |
| Palabras clave (máx. 100) | lavado,autos,car wash,temuco,túnel,plan,lavado de auto,descuentos,zplash,auto limpio |
| URL de soporte | https://zplash.cl |
| URL de marketing | https://zplash.cl |
| Copyright | 2026 Servicio e Inversiones Las Águilas SpA |
| Clasificación de edad | 4+ (todo "Ninguno") |

**Texto promocional** (máx. 170, se cambia sin nueva versión):

> Mira tus lavados, compra tu plan y recibe un aviso cuando pases cerca de ZPlash con un descuento esperándote.

**Descripción:** la misma descripción completa de Google Play.

**Notas para el revisor** (pegar, además de la cuenta de revisión):

> ZPlash es un túnel de lavado de autos físico en Temuco, Chile. La app es el portal de nuestros clientes y suma funciones nativas del teléfono: notificaciones push (aviso de vencimiento del plan y de descuentos) y una geocerca de la región del local que avisa al cliente, con la app cerrada, cuando pasa cerca y tiene un descuento. Las compras son de un servicio presencial (lavado del vehículo en el local) y se pagan con Webpay de Transbank, por lo que no corresponde compra dentro de la app (guía 3.1.3(e)). Para probar la eliminación de cuenta: Cuenta → Eliminar mi cuenta (en la cuenta de revisión no borra datos para que la cuenta siga sirviendo a otros revisores).

**Privacidad de la app** (etiquetas): mismos datos que la tabla de Play, todos "vinculados al usuario", **ninguno usado para rastreo** (no hay App Tracking Transparency). Ubicación: "Ubicación aproximada", fin "Funcionalidad de la app".

**Cifrado:** ya declarado en Info.plist (`ITSAppUsesNonExemptEncryption = false`), no pregunta nada al subir.

**Capturas:** iPhone de 6,5" (1284 × 2778). Con eso App Store acepta la ficha; iPad no hace falta porque la app es solo iPhone.
