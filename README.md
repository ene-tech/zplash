# ZPlash · Control de Acceso

Aplicación de control de acceso y gestión de planes para lavado de autos, migrada
desde un archivo HTML de página única (vanilla JS) a un proyecto Next.js con
componentes React, con datos persistidos en Postgres (Supabase) vía Drizzle ORM.

## Requisitos

- [Node.js](https://nodejs.org) 20 o superior (incluye npm)
- Un proyecto de [Supabase](https://supabase.com) con el esquema de `supabase/schema.sql` ya aplicado

## Cómo correr el proyecto

1. Instala las dependencias (solo la primera vez, o cada vez que cambie `package.json`):

   ```bash
   npm install
   ```

2. Crea un archivo `.env.local` en la raíz del proyecto con las credenciales de tu
   proyecto de Supabase (Settings → API en el dashboard) y la conexión directa a
   Postgres (Settings → Database → Connect → Connection string → "Transaction
   pooler", puerto 6543 — la que usa Drizzle):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-o-publishable-key
   DATABASE_URL=postgres://postgres.tu-proyecto:tu-password@aws-0-region.pooler.supabase.com:6543/postgres
   ```

3. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

4. Abre [http://localhost:3000](http://localhost:3000) en el navegador.

### Otros comandos

```bash
npm run build   # compila la app para producción (.next/)
npm run start   # sirve la build de producción (requiere "build" antes)
npm run lint    # corre ESLint
```

## Base de datos (Supabase + Drizzle)

El esquema vive en `src/db/schema.ts` (fuente de verdad) y `drizzle-kit`
gestiona las migraciones a partir de ahí:

```bash
npm run db:generate   # genera un SQL nuevo en drizzle/ a partir de los cambios en schema.ts
npm run db:migrate    # aplica contra DATABASE_URL las migraciones pendientes
```

`supabase/schema.sql` y los `add-*.sql` sueltos documentan cómo se llegó al
esquema actual (aplicados a mano antes de adoptar `drizzle-kit`) y ya no hace
falta correrlos en un proyecto nuevo: `drizzle/0000_baseline.sql` los
reemplaza. Si vas a apuntar `DATABASE_URL` a un proyecto de Supabase que
**ya tenía el esquema viejo aplicado a mano**, corre primero
`supabase/adopt-drizzle-migrations.sql` una sola vez en el SQL Editor — marca
esa migración base como ya aplicada sin volver a ejecutar sus `CREATE TABLE`
(que fallarían porque las tablas ya existen). En un proyecto de Supabase
nuevo y vacío, saltate ese paso y corre directamente `npm run db:migrate`.

Toda la lectura/escritura corre server-side con Drizzle (`src/lib/db.ts`, un
archivo de Server Actions) a través de una conexión directa a Postgres
(`DATABASE_URL`) — el navegador nunca habla con la base de datos directamente.
La única excepción es la subida de comprobantes de gastos, que sigue usando
`@supabase/supabase-js` para Supabase Storage (Drizzle no cubre Storage).

La app usa Row Level Security con una política abierta para el rol `anon` en
las tablas (relevante si algo llega a consultarlas por PostgREST/anon key),
porque no usa Supabase Auth: el PIN de administrador es una validación propia
de la aplicación, no de la base de datos. Si en algún momento se agrega
autenticación real de Supabase, conviene reemplazar esas políticas por unas
más restrictivas.

Cada acción de la app (registrar ingreso, renovar plan, editar cliente, etc.)
guarda solo las filas que realmente cambiaron (insert/update/delete puntual),
no reescribe tablas completas — esto evita que dos personas usando la app al
mismo tiempo se pisen cambios entre sí.

## Estructura del proyecto

```
src/
  app/                    # App Router de Next.js (layout, página raíz, estilos globales)
  db/
    schema.ts              # Tablas de Drizzle (espejo de supabase/schema.sql)
    index.ts                # Cliente de Drizzle (getDb()), conexión perezosa vía DATABASE_URL
  context/AppContext.tsx  # Estado global (datos + estado de UI); commit() decide qué filas
                          # insertar/actualizar/eliminar según lo que cambió
  lib/
    supabase.ts           # Cliente de Supabase (solo para Storage: subida de comprobantes)
    db.ts                 # Server Actions: mapeo entre los tipos de la app y las tablas de Drizzle
    helpers.ts             # Formateo, validaciones, estado de planes, etc.
    actions.ts              # Lógica de negocio (registrar ingreso, renovar plan, importar Excel, exportar Excel)
  components/
    LoginScreen.tsx        # Selección de rol, PIN de admin, login de operador
    OperadorView.tsx        # Validación de patente y registro de ingreso
    AdminView.tsx             # Shell de administrador con tabs
    tabs/                  # Clientes, Historial de ingresos, Cierre de caja, Operadores, Estadísticas, Configuración
    modals/                # Modales de cliente, confirmación, operador y carga masiva (Excel)
```

## Bot de WhatsApp (Twilio Sandbox)

El endpoint `src/app/api/whatsapp/route.ts` responde automáticamente a
mensajes de WhatsApp usando reglas fijas (sin IA): saludo → menú, patente →
estado del plan (consulta `clientes` con `planStatus` de `helpers.ts`),
"1"/"2"/"3" → precios / horario-ubicación / contacto humano. La lógica del
router vive en `src/lib/whatsapp/router.ts` y los textos en
`src/lib/whatsapp/contenido.ts`.

### Configuración inicial

1. Crea una cuenta en [Twilio Console](https://console.twilio.com) si no
   tienes una.
2. Ve a **Messaging → Try it out → Send a WhatsApp message** para activar el
   WhatsApp Sandbox. Te dará un número de Twilio y un código para unirte
   (`join palabra-clave`), que debes enviar una vez por WhatsApp desde el
   número que uses para probar.
3. Copia **Account SID** y **Auth Token** desde el dashboard principal de
   Twilio Console y agrégalos a `.env.local`:
   ```bash
   TWILIO_ACCOUNT_SID=tu-account-sid
   TWILIO_AUTH_TOKEN=tu-auth-token
   ```
4. En **Messaging → Settings → WhatsApp Sandbox Settings**, configura "WHEN
   A MESSAGE COMES IN" apuntando a `https://tu-dominio/api/whatsapp` con
   método `POST`.
5. Deploya los cambios para que el endpoint quede disponible en esa URL.
6. Prueba enviando "hola" al número del sandbox — debe responder con el
   menú. Envía una patente real de `clientes` para ver el estado del plan.

### Antes de compartir el número con clientes reales

Edita los placeholders de `src/lib/whatsapp/contenido.ts`
(`HORARIO_UBICACION` y `CONTACTO_HUMANO`) con la dirección, horario y datos
de contacto reales — están marcados con `// TODO`.

## Notas

- El logo se extrajo del HTML original (estaba embebido en base64) y quedó en `public/logo.jpg`.
- La carga y descarga masiva de clientes usa la librería `xlsx` (antes cargada por CDN, ahora como dependencia de npm).
- Los datos se migraron desde el Firebase/Firestore original. Durante la migración se
  detectaron 7 clientes con IDs duplicados (un bug de la generación de IDs de la
  versión anterior en cargas masivas) — se migraron todos sin perder datos, pero
  quedaron con un id/patente ligeramente distinto (sufijo `-dup`) y conviene
  revisarlos a mano en la pestaña Clientes.
