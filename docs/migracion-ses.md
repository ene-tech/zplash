# Migración del correo automático de Resend a Amazon SES

Todo el correo automático (avisos, confirmaciones, facturas, campañas) sale por
una sola función: `enviarCorreoTransaccional` en `src/lib/mailing/proveedor.ts`.
El código ya está listo para SES, pero **apagado**: mientras en Vercel no exista
la variable `CORREO_PROVEEDOR=ses`, todo sigue saliendo por Resend como hoy.

El buzón de soporte (info@, SMTP de Banahost) **no** cambia con esto.

Calendario sugerido: dejar todo listo en AWS con unas semanas de margen antes de
que venza el plan de Resend (revisar la fecha real en su dashboard).

---

## 0. Qué ya hace el código (con cualquiera de los dos proveedores)

- **Limpia la dirección** antes de mandar: le saca espacios y la pasa a
  minúsculas (`" Juan Perez@Gmail.com"` → `juanperez@gmail.com`).
- **No manda a direcciones malas** (tildes o ñ, puntos al principio o al final,
  dominio sin punto, etc.). Queda anotado en Correo → Salida automática con el
  motivo ("dirección no enviable: …") y la ficha del cliente pierde el email
  para que el operador lo vuelva a pedir, igual que hoy.
- **Lista de supresión** (`correos_suprimidos`): a quien rebotó para siempre o
  marcó el correo como spam no se le vuelve a mandar. SES la llena solo (paso 6).
  También se pueden cargar a mano con motivo `manual`.

Antes de empezar, pegar en el SQL Editor de Supabase el archivo
`supabase/correos-suprimidos-2026-10-20.sql` (crea la tabla; si no está, el
correo sale igual, solo que sin revisar la lista).

---

## 1. Crear la cuenta de AWS

1. Entrar a <https://aws.amazon.com> → "Crear una cuenta de AWS".
2. Correo: usar uno de la empresa que se revise siempre (a ese correo llegan
   los avisos de AWS, incluida una eventual suspensión).
3. Pide tarjeta de crédito (cobra US$1 de prueba y lo devuelve) y verificación
   por SMS.
4. Plan de soporte: **Basic (gratis)**.
5. Ya adentro: arriba a la derecha, elegir la región **US East (N. Virginia)
   `us-east-1`**. Todo lo que sigue se hace en esa región (Vercel corre en
   Washington, queda al lado). Si se elige otra, usarla en todos los pasos y
   en `AWS_SES_REGION`.
6. Recomendado: activar MFA (código en el celular) en el usuario raíz:
   menú de la cuenta → "Credenciales de seguridad" → "Asignar dispositivo MFA".

---

## 2. Verificar el dominio zplash.cl

En la consola, buscar **"Amazon SES"** → menú izquierdo **"Identities"** →
**"Create identity"**.

1. Tipo: **Domain**. Dominio: `zplash.cl`.
2. Marcar **"Use a custom MAIL FROM domain"** y poner `bounce` (queda
   `bounce.zplash.cl`). Revisar antes en el DNS que `bounce.zplash.cl` no
   exista ya; si existe, usar otro nombre (por ejemplo `ses`). Resend ya usa
   `send.zplash.cl`: **no reusar ese**.
3. "Behavior on MX failure": **Use default MAIL FROM domain**.
4. DKIM: **Easy DKIM**, **RSA_2048_BIT**, "Publish DNS records to Route53":
   desmarcado (el DNS de zplash.cl no está en Route53).
5. "Create identity".

SES muestra los registros que hay que agregar en el panel DNS de zplash.cl
(donde hoy están los de Resend):

| Para qué | Tipo | Nombre | Valor |
|---|---|---|---|
| DKIM 1 | CNAME | `xxxx1._domainkey.zplash.cl` | `xxxx1.dkim.amazonses.com` |
| DKIM 2 | CNAME | `xxxx2._domainkey.zplash.cl` | `xxxx2.dkim.amazonses.com` |
| DKIM 3 | CNAME | `xxxx3._domainkey.zplash.cl` | `xxxx3.dkim.amazonses.com` |
| MAIL FROM (rebotes) | MX | `bounce.zplash.cl` | `10 feedback-smtp.us-east-1.amazonses.com` |
| SPF del MAIL FROM | TXT | `bounce.zplash.cl` | `v=spf1 include:amazonses.com ~all` |

Los `xxxx` los da SES: copiarlos tal cual desde la pantalla de la identidad.
Algunos paneles DNS agregan solos el `.zplash.cl` al final del nombre: en ese
caso escribir solo `xxxx1._domainkey` y `bounce`.

**No tocar** el SPF de `zplash.cl` (la raíz): ese es el del buzón de Banahost.
Con el MAIL FROM propio, SES no necesita estar ahí.

**DMARC**: revisar si ya existe un TXT en `_dmarc.zplash.cl` (Resend pide uno).
- Si existe, dejarlo como está.
- Si no existe, crear: TXT, nombre `_dmarc.zplash.cl`, valor
  `v=DMARC1; p=none; rua=mailto:info@zplash.cl`
  (`p=none` = solo informa, no bloquea nada; se puede endurecer después).

La verificación tarda de minutos a 72 horas. En SES la identidad tiene que
quedar **"Verified"** y DKIM **"Successful"**, y en "Custom MAIL FROM domain"
**"Successful"**.

---

## 3. Salir del sandbox (pedir acceso a producción)

Una cuenta nueva de SES está en *sandbox*: solo puede mandar a direcciones
verificadas una por una y máximo 200 al día. Para mandarle a clientes hay que
pedir salir.

SES → **"Account dashboard"** → **"Request production access"**:

- Mail type: **Transactional**.
- Website URL: `https://zplash.cl`
- Use case description (en inglés, se puede pegar esto ajustando números):

> ZPlash is a car wash in Temuco, Chile, with a membership plan and online
> payments. We send transactional email only to our own customers who gave us
> their address at our counter or when buying on zplash.cl: purchase
> confirmations, invoices (PDF), payment failure notices, plan expiration
> reminders and occasional offers to existing customers, about 10,000 emails
> per month. Every promotional email includes an unsubscribe link.
> We handle bounces and complaints automatically: a configuration set publishes
> Bounce and Complaint events to an SNS topic subscribed to our HTTPS endpoint,
> which verifies the SNS signature and adds the address to our own suppression
> list; we never send again to a suppressed address. Addresses are also
> validated and normalized before sending. We migrate from Resend, where we
> already send this volume from the zplash.cl domain.

- Additional contacts: el correo de la empresa.
- Idioma de contacto: inglés.

AWS responde en ~24 horas. A veces pide más detalle (cómo se consiguieron las
direcciones, cómo se dan de baja): contestar en el mismo caso con lo de arriba.
Mientras tanto se puede seguir con los pasos 4 a 6 y probar con direcciones
verificadas (paso 8).

---

## 4. Usuario IAM que solo puede mandar correo

La app **no** debe usar la cuenta raíz. Se crea un usuario que solo puede
`ses:SendEmail`, y solo desde `no-reply@zplash.cl`.

1. Consola → **"IAM"** → **"Users"** → **"Create user"**.
   Nombre: `zplash-ses-envio`. **Sin** acceso a la consola.
2. "Attach policies directly" → "Create policy" → pestaña **JSON**, pegar:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "ses:FromAddress": "no-reply@zplash.cl" }
      }
    }
  ]
}
```

   Nombre de la política: `zplash-ses-solo-enviar`. Volver al usuario,
   refrescar y marcarla. Crear el usuario.
3. Entrar al usuario → **"Security credentials"** → **"Create access key"** →
   "Application running outside AWS". Copiar el **Access key ID** y el
   **Secret access key** (el secreto se ve **una sola vez**). Van a Vercel en el
   paso 7; no mandarlos por WhatsApp ni correo.

Si `MAIL_FROM_ADDRESS` alguna vez cambia de `no-reply@zplash.cl`, hay que
cambiar también la condición de esta política o SES rechaza el envío.

---

## 5. Configuration set (para recibir rebotes y quejas)

SES → **"Configuration sets"** → **"Create set"**:

- Nombre: `zplash-transaccional`.
- Lo demás por defecto. "Create set".

(El destino de eventos se agrega en el paso 6, después de crear el topic.)

---

## 6. SNS: que SES le avise a la app de rebotes y quejas

1. Consola → **"Simple Notification Service" (SNS)** → **"Topics"** →
   **"Create topic"**. Tipo **Standard**, nombre `zplash-ses-eventos`. Crear.
   Copiar el **ARN** (algo como
   `arn:aws:sns:us-east-1:123456789012:zplash-ses-eventos`).
2. **Antes** de suscribir, cargar en Vercel (Production y Preview)
   `AWS_SES_SNS_TOPIC_ARN` = ese ARN y redeployar. Sin esa variable el
   webhook rechaza todo, incluida la confirmación.
3. En el topic → **"Create subscription"**: protocolo **HTTPS**, endpoint
   `https://zplash.cl/api/correo/ses/notificaciones`.
   Dejar desmarcado "Enable raw message delivery". Crear.
   La app confirma sola la suscripción (verifica la firma de AWS y que el
   topic sea el configurado). En unos segundos la suscripción tiene que pasar
   de "Pending confirmation" a **"Confirmed"**. Si se queda en pending, revisar
   la variable del paso 2 y usar "Request confirmation" de nuevo.
4. Volver a SES → Configuration sets → `zplash-transaccional` → pestaña
   **"Event destinations"** → **"Add destination"**:
   - Event types: **Hard bounces** y **Complaints** (opcional también
     "Rejects"; los "Deliveries" no hacen falta y solo agregan tráfico).
   - Destination: **Amazon SNS**, topic `zplash-ses-eventos`.

Si la suscripción está "Confirmed" pero los rebotes de prueba (paso 8) no
llegan: en el topic → "Edit" → "Access policy", verificar que permita
`sns:Publish` al servicio `ses.amazonaws.com` (la consola de SES normalmente
lo agrega sola al crear el destino).

Qué hace la app con cada aviso:
- **Rebote permanente** (la dirección no existe): la anota en
  `correos_suprimidos` con motivo `rebote`. Al próximo intento la ficha del
  cliente pierde el email, para que el operador lo vuelva a pedir.
- **Queja** (el cliente apretó "Es spam"): motivo `queja`. No se le vuelve a
  mandar, pero el email queda en la ficha.
- **Rebote transitorio** (buzón lleno, servidor caído): no hace nada.

Para sacar a alguien de la lista (por ejemplo, se equivocó al marcar spam),
en el SQL Editor de Supabase:
`delete from correos_suprimidos where email = 'correo@ejemplo.cl';`

---

## 7. Variables en Vercel

Proyecto → Settings → Environment Variables. Cargar primero **solo en
Preview** (para la prueba del paso 8):

| Variable | Valor |
|---|---|
| `AWS_SES_REGION` | `us-east-1` |
| `AWS_SES_ACCESS_KEY_ID` | el Access key ID del paso 4 |
| `AWS_SES_SECRET_ACCESS_KEY` | el Secret access key del paso 4 (marcar "Sensitive") |
| `AWS_SES_CONFIGURATION_SET` | `zplash-transaccional` |
| `AWS_SES_SNS_TOPIC_ARN` | el ARN del paso 6 (este sí en Production y Preview) |
| `CORREO_PROVEEDOR` | `ses` |

`MAIL_FROM_ADDRESS` ya existe (`ZPlash <no-reply@zplash.cl>`) y sirve igual.
`RESEND_API_KEY` se deja puesta: si hay que volver atrás, basta con borrar
`CORREO_PROVEEDOR` y redeployar.

Si `CORREO_PROVEEDOR=ses` está puesta pero falta alguna `AWS_SES_*`, la app
**no** cae a Resend sola: los correos quedan con error "no configurado" en
los disparos, para que se note.

---

## 8. Probar en un Preview antes de producción

Ojo: un Preview de Vercel usa la **misma base de producción**. Cualquier cosa
que se dispare ahí escribe datos reales y le puede llegar a un cliente real.

1. Si todavía está en sandbox: SES → Identities → "Create identity" →
   **Email address** → el correo propio. Confirmar el link que llega.
2. Hacer un deploy de Preview con las variables del paso 7.
3. Desde ese Preview, mandar un correo a la dirección propia por un camino
   que no toque clientes (por ejemplo, el descuento de bienvenida o reenviar
   una factura propia desde la pestaña Facturas).
4. Revisar:
   - Que llegó, que no cayó en spam, y en "Mostrar original" (Gmail):
     `SPF: PASS`, `DKIM: PASS` con `zplash.cl`, `DMARC: PASS`.
   - En Correo → Salida automática: estado "enviado" y un id de proveedor
     (el MessageId de SES).
   - Si llevaba adjunto (factura), que el PDF abra bien.
5. Probar un rebote y una queja sin tocar la base de clientes: SES →
   Identities → `zplash.cl` → **"Send test email"**. From: `no-reply`,
   Scenario: **"Bounce"** (y después **"Complaint"**), Configuration set:
   `zplash-transaccional`. Son direcciones de prueba de AWS
   (`bounce@simulator.amazonses.com`), no cuentan para la reputación. En un
   minuto debe aparecer `bounce@simulator.amazonses.com` en
   `correos_suprimidos` con motivo `rebote` (y `complaint@…` con `queja`).
   Después borrarlas de la tabla.

Recién con eso OK y con acceso a producción aprobado (paso 3): cargar las
variables en **Production** y redeployar. Mirar la bandeja de salida y el
"Account dashboard" de SES los primeros días.

**Umbrales que mira AWS** (SES → Account dashboard → "Reputation metrics"):
- Rebotes: sobre **5%** pone la cuenta en revisión; sobre 10% puede pausar los
  envíos.
- Quejas: sobre **0,1%** revisión; sobre 0,5% pausa.

Por eso conviene la primera campaña grande mandarla a clientes con correo ya
usado con éxito en Resend, no a la base completa de golpe.

---

## 9. Costo aproximado a ~10.000 correos al mes

- SES: US$0,10 por cada 1.000 correos → **~US$1 al mes**.
  (El primer año la capa gratuita cubre 3.000 correos al mes.)
- Adjuntos (facturas PDF): US$0,12 por GB → centavos.
- SNS (avisos de rebote/queja al webhook): los primeros 100.000 al mes son
  gratis → **US$0**.
- Sin IP dedicada (no hace falta a este volumen; costaría ~US$25/mes).

Total esperado: **~US$1 a US$2 al mes**, contra el plan pago de Resend.

---

## Volver atrás

Borrar `CORREO_PROVEEDOR` en Vercel y redeployar: todo vuelve a salir por
Resend. La lista de supresión y la validación de direcciones siguen
funcionando igual con Resend.
