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

El esquema completo (`clientes`, `ingresos`, `ventas`, `operadores`,
`administradores`, `precios`, `cupones`, `movimientos_contables`,
`categorias_gasto`, `config`) está en `supabase/schema.sql` y los `add-*.sql` —
córrelos una sola vez en el SQL Editor de tu proyecto de Supabase antes de usar
la app. Ese SQL sigue siendo la fuente de verdad del DDL; `src/db/schema.ts`
solo lo refleja para que Drizzle tipe las queries, no gestiona migraciones.

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

## Notas

- El logo se extrajo del HTML original (estaba embebido en base64) y quedó en `public/logo.jpg`.
- La carga y descarga masiva de clientes usa la librería `xlsx` (antes cargada por CDN, ahora como dependencia de npm).
- Los datos se migraron desde el Firebase/Firestore original. Durante la migración se
  detectaron 7 clientes con IDs duplicados (un bug de la generación de IDs de la
  versión anterior en cargas masivas) — se migraron todos sin perder datos, pero
  quedaron con un id/patente ligeramente distinto (sufijo `-dup`) y conviene
  revisarlos a mano en la pestaña Clientes.
