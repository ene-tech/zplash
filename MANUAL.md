# Manual de ZPlash

Manual de uso y funcionamiento de ZPlash, la aplicación de control de acceso, planes y administración de un lavado de autos. Este documento explica **qué hace la app y cómo se usa cada módulo**, pensado para quienes operan el negocio día a día (operadores, administración, contabilidad) y para quienes atienden el portal del cliente. Para instrucciones de instalación y despliegue técnico, ver [README.md](README.md).

## Índice

1. [Visión general](#1-visión-general)
2. [Roles y permisos](#2-roles-y-permisos)
3. [Ingreso a la aplicación](#3-ingreso-a-la-aplicación)
4. [Módulo Operador](#4-módulo-operador)
5. [Módulo Servicios Adicionales](#5-módulo-servicios-adicionales)
6. [Administrador de ingresos](#6-administrador-de-ingresos)
7. [Módulo Contabilidad](#7-módulo-contabilidad)
8. [Portal del Cliente (`/cliente`)](#8-portal-del-cliente-cliente)
9. [Pago web y renovación automática (`/pagar`)](#9-pago-web-y-renovación-automática-pagar)
10. [Bot de WhatsApp](#10-bot-de-whatsapp)
11. [Glosario de estados y conceptos](#11-glosario-de-estados-y-conceptos)
12. [Limitaciones conocidas](#12-limitaciones-conocidas)

---

## 1. Visión general

ZPlash administra el ciclo completo de un lavado de autos con planes mensuales:

- **Control de acceso**: valida la patente de cada vehículo que entra al túnel y registra el ingreso.
- **Clientes y planes**: ficha de cada cliente, estado de su Plan Ilimitado Mensual (vigente / por vencer / vencido / sin plan) y su historial de visitas.
- **Ventas**: lavado único, contratación/renovación de plan, servicios adicionales (detailing, tapiz, motor, chasis, etc.), venta a empresas (tickets/cupones), todo con distintos métodos de pago.
- **Caja y contabilidad**: cierre de caja por período, cuentas por cobrar/pagar, gastos, rendiciones y Estado de Resultados (EERR).
- **Canales externos**: portal web para clientes (`/cliente`), pago online con Webpay/Oneclick (`/pagar`) y un bot de WhatsApp con respuestas automáticas.

La app corre en el navegador (PC o celular) y guarda todo en una base de datos Postgres (Supabase) — no requiere instalar nada en el equipo del operador, solo abrir la URL.

## 2. Roles y permisos

Al entrar a ZPlash no hay un "usuario y contraseña" clásico: se elige un **perfil** (persona) de una lista y se ingresa su contraseña. Cada perfil tiene asignados uno o más **módulos**, y solo ve/usa lo que tiene habilitado:

| Módulo | Qué permite |
|---|---|
| Operador | Validar patente y registrar el ingreso de un vehículo, canjear cupones |
| Servicios Adicionales | Vender detailing, tapiz, motor, chasis, etc. y dejarlos agendados |
| Clientes | Ver/crear/editar fichas de clientes y sus planes |
| Historial de Ingresos | Ver todos los ingresos registrados por Operador |
| Cierre de Caja | Ver el resumen de ventas y medios de pago por período, descargar Excel |
| B2B/Tickets/Dsctos | Vender lotes de cupones/tickets y descuentos a empresas |
| Empresas (Facturación) | Mantener la ficha de empresas (razón social, RUT, giro, dirección) |
| Perfiles | Crear/editar perfiles y (con "Permisos") asignarles módulos |
| Estadísticas | Ver indicadores del negocio por período |
| Agenda | Ver y administrar las horas reservadas (servicios/citas) |
| Configuración | Editar precios, horario del módulo Operador y cambiar la propia contraseña |
| Contabilidad | Acceso al módulo separado de Contabilidad (ver sección 7) |
| Permisos | Además de "Perfiles", permite asignar/quitar módulos a otros perfiles y resetear sus contraseñas |

Un perfil con acceso a **Configuración** (típicamente Administración/Gerencia) queda **exento del bloqueo de horario** del módulo Operador — puede registrar ingresos a cualquier hora, el resto de los operadores no.

Al elegir un perfil que tiene más de un módulo, la app muestra primero un **Hub** con un botón por módulo (🚗 Operador, 🧽 Servicios Adicionales, 🗂️ Administrador de ingresos, 📊 Contabilidad); si solo tiene un módulo entra directo a él.

## 3. Ingreso a la aplicación

1. Se abre la URL de la app. Aparece la lista de perfiles (nombre + ícono).
2. Se elige el propio perfil y se escribe la contraseña.
3. Si es correcta, entra al Hub (o directo al único módulo habilitado).
4. "Cerrar sesión" en cualquier pantalla vuelve a la lista de perfiles.

Cada perfil puede cambiar su propia contraseña desde **Configuración → Cambiar mi contraseña**. Un perfil con módulo **Permisos** puede resetear la contraseña de otro perfil desde **Perfiles → Resetear contraseña**, pidiendo su propia contraseña como confirmación.

## 4. Módulo Operador

Pantalla que usa quien recibe los vehículos en la entrada del túnel.

- **Validar patente**: se escribe la patente (formato `AB1234` o similar) y "Validar". Si el cliente existe, muestra su estado de plan y permite registrar el ingreso; si no existe, ofrece crearlo como cliente nuevo.
- **Escanear patente**: en vez de tipear, se puede tomar una foto de la patente con la cámara del celular; un servicio de reconocimiento (Plate Recognizer) intenta leerla y la deja escrita en el campo para que el operador la revise antes de validar — es una ayuda, no reemplaza la revisión manual.
- **Canjear cupón**: para vehículos que llegan con un cupón de una Venta Empresa (ver sección 6), se ingresa el código del cupón y la patente; el cupón se marca como usado y queda un registro en el Historial de Ingresos sin volver a cobrar (el monto del lote ya se contabilizó cuando se vendió).
- **Bloqueo por horario**: fuera del horario configurado en Configuración → Horario de registro, un operador estándar no puede registrar ingresos (ve un aviso y debe contactar a Administración/Gerencia). Administración y Gerencia no tienen esta restricción.
- **Últimos 10 ingresos**: lista abajo de la pantalla para que el operador confirme que su registro quedó guardado.

## 5. Módulo Servicios Adicionales

Para vender servicios que no son el lavado por túnel: detailing (limpieza completa), tapiz, alfombra, techo, motor, chasis-grafitado, etc.

- Se busca o crea el cliente/vehículo, se eligen uno o varios servicios del catálogo (con su precio), y se registra la venta con su método de pago.
- Si el servicio implica que el vehículo pase por el túnel (limpieza completa/detailing), la venta queda **agendada** en la Agenda; el ingreso real al Historial de Ingresos se genera después, cuando el operador registra la patente al llegar el vehículo — no en el momento de la venta.
- Cada venta queda asociada a una **cita** (`citaId`), lo que permite editar su estado (circuito interno del vehículo: pendiente → en proceso → listo/retirado, etc.) desde el mismo listado.
- El catálogo de servicios (nombre, categoría, duración, si está activo) se administra desde este módulo; los precios se editan desde **Configuración**.

## 6. Administrador de ingresos

Módulo con pestañas para la gestión diaria del negocio:

### Clientes
Ficha de cada cliente: nombre, patente, teléfono, email, vehículo, tipo de documento (Boleta/Factura y datos de facturación si aplica), plan y fecha de vencimiento. Se puede buscar por patente o nombre, filtrar por estado de plan (Vigente / Por vencer / Vencido / Sin plan) y ordenar por vencimiento o cantidad de visitas. Incluye carga y descarga masiva de clientes vía Excel.

### Historial de Ingresos
Todos los vehículos que han entrado al túnel, con fecha, patente, cliente y el tipo de ingreso (por plan, lavado único $9.990, cupón, garantía, etc.), filtrable por rango de fechas.

### Cierre de Caja
El reporte operativo del día (o del período que se elija): cantidad y monto de ventas por producto (lavado único, contratación/renovación de plan, servicios adicionales, ingresos de Módulo Contabilidad, etc.), desglose por método de pago (efectivo, tarjeta, transferencia, cuentas por cobrar), autos ingresados con/sin plan, clientes nuevos, facturas pendientes de emitir y el detalle línea por línea de ingresos y servicios adicionales vendidos. Se puede descargar en Excel para archivo o para el contador.

### B2B/Tickets/Dsctos (Venta Empresa)
Venta de lotes de cupones o descuentos a empresas (para que las regalen a sus clientes/empleados): se define nombre del lote, cantidad de cupones, valor (o "gratis"), fecha de caducidad y datos de facturación de la empresa. Cada cupón generado tiene un código único que se canjea después en el módulo Operador.

### Empresas (Facturación)
Ficha de las empresas con las que se emite Factura (razón social, RUT, giro, dirección) — se reutiliza automáticamente al escribir un RUT ya registrado, tanto en la ficha de un Cliente como en una Venta Empresa.

### Perfiles
Alta, edición y eliminación de perfiles de usuario. Quien tiene el módulo **Permisos** además puede asignar/quitar módulos a otros perfiles y resetear su contraseña.

### Estadísticas
Indicadores del negocio: total de clientes por estado de plan, autos ingresados hoy, y un resumen por período (rango de fechas elegible) que separa los ingresos entre "por plan", "lavado único ($9.990)", "vía cupón" (gratis o pagado) y "limpieza completa", cada uno con su cantidad, porcentaje y monto vendido.

### Agenda
Vista de las horas/citas reservadas (servicios agendados desde Servicios Adicionales u horas de atención configuradas), para coordinar capacidad del local.

### Configuración
- **Horario de registro — Operador**: rango horario (lunes a viernes / fin de semana y festivos) en que un operador estándar puede registrar ingresos, y el listado de fechas festivas.
- **Precios y renovación preferencial**: precio normal y precio promoción por plan, precio del lavado único, precio del "upgrade a plan" que se le ofrece al cliente tras pagar un lavado único, precio del plan con renovación automática (Oneclick) para `/pagar`, y precios de cada servicio adicional.
- **Cambiar mi contraseña**: cambio de la propia contraseña (mínimo 6 caracteres).

## 7. Módulo Contabilidad

Módulo aparte (acceso vía módulo **Contabilidad**), con su propio menú lateral:

- **Egresos / Gastos**: registro de gastos del negocio (categoría, monto, fecha, comprobante).
- **Rendiciones**: gastos marcados "a rendir" (por ejemplo, adelantos a un trabajador) pendientes de justificar.
- **Ingresos**: movimientos de ingreso registrados manualmente en Contabilidad (fuera de las ventas del día a día), que también se suman en el Cierre de Caja bajo "Ingreso por Módulo Contabilidad".
- **Cuentas por Cobrar**: ventas con pago pendiente (p. ej. transferencias no confirmadas) que aún no se han cobrado.
- **Cuentas por Pagar**: gastos u obligaciones pendientes de pago.
- **EERR (Estado de Resultados)**: reporte mensual con los ingresos de explotación y los gastos agrupados en 5 categorías fijas (Otros Costos Directos, Remuneraciones, Administración, etc.), separando lo operacional de lo no operacional, para ver el resultado del mes.
- **Configuración**: categorías de gasto y su agrupación dentro del EERR.

## 8. Portal del Cliente (`/cliente`)

Página pública (sin login) para que cualquier cliente consulte información del lavado:

- **Ubicación y Horarios**
- **Tipos de Lavados**: catálogo y precios (se cargan en vivo desde la app)
- **Venta a Empresa**: información para empresas interesadas en comprar tickets/descuentos
- **Plan Mensual**: explica el Plan Full Túnel Ilimitado y sus dos modalidades de pago (mes a mes, o renovación automática más barata), con botón a `/pagar`
- **Preguntas Frecuentes**
- **Mi Cuenta**: pensada para que el cliente vea sus vehículos, estado de plan e historial de compras iniciando sesión con Google. **Hoy es solo una vista previa/maqueta con datos de ejemplo** — el inicio de sesión real y el vínculo con la ficha del cliente todavía no están implementados.

## 9. Pago web y renovación automática (`/pagar`)

Flujo de pago para clientes que quieren contratar o renovar el Plan Ilimitado Mensual sin ir al local:

- **Webpay Plus**: pago único con tarjeta (débito o crédito) vía Transbank. El cliente es redirigido a Transbank, paga, y vuelve a `/pagar/resultado` con la confirmación.
- **Oneclick**: inscripción de la tarjeta una sola vez para que el sistema cobre automáticamente cada mes (precio preferencial, ver Configuración). Incluye inscripción inicial, confirmación de retorno desde Transbank, y el cobro recurrente mensual.
- El precio que se cobra siempre se valida contra los precios configurados en el servidor (`/api/pagos/precios`), no se confía en un monto que venga del navegador.
- Un pago confirmado renueva/activa el plan del cliente automáticamente, de forma equivalente a que Administración lo haga manualmente tras recibir una transferencia bancaria (ver **DatosTransferencia** en Servicios/Venta Empresa).

## 10. Bot de WhatsApp

Número de WhatsApp con respuestas automáticas (reglas fijas, sin IA), configurado sobre Twilio Sandbox:

- Saludo → menú con 5 opciones (precios y servicios, contratar plan, horario y ubicación, hablar con una persona, descuento primera vez).
- Enviar una **patente** → responde el estado del plan de ese cliente.
- Opción de **descuento primera vez**: genera un código de descuento válido por 7 días para quien nunca ha sido cliente.
- Opción "Hablar con una persona" → deriva a contacto humano.

La configuración inicial (cuenta Twilio, webhook) y los textos editables antes de salir a producción están detallados en el [README.md](README.md#bot-de-whatsapp-twilio-sandbox).

## 11. Glosario de estados y conceptos

- **Vigente / Por vencer / Vencido / Sin plan**: estado del Plan Ilimitado Mensual de un cliente según su fecha de vencimiento. "Por vencer" aparece cuando quedan 7 días o menos.
- **Lavado único**: cobro de $9.990 a un vehículo sin plan vigente.
- **Cupón**: código canjeable una sola vez, generado en una Venta Empresa; puede ser gratis o con un valor.
- **Glosa**: nombre libre que identifica un ingreso que no es "por plan" ni "lavado único" (p. ej. una limpieza completa vendida en Servicios Adicionales).
- **Garantía**: relavado gratuito por reclamo del cliente; no se cuenta como venta en las Estadísticas.
- **Origen WEB**: cliente/venta que se originó en el flujo de pago online (`/pagar`), a diferencia de una venta hecha en el local.
- **Renovación preferencial**: promoción de renovación anticipada que ofrece el operador cuando un plan está por vencer.

## 12. Limitaciones conocidas

- **Mi Cuenta** (portal del cliente) es una vista previa con datos de ejemplo; el login con Google todavía no está conectado a los datos reales.
- La migración de datos desde el sistema anterior (Firebase/Firestore) dejó **7 clientes con IDs duplicados**, identificables por el sufijo `-dup` en su patente/id — conviene revisarlos a mano en la pestaña Clientes (ver [README.md](README.md#notas)).
- La app no usa transacciones de base de datos para operaciones de varios pasos (por ejemplo, registrar un pago y extender el vencimiento del plan son dos escrituras separadas). Esto se detalla, junto con el resto de la revisión técnica de fórmulas y procesos, en el reporte de auditoría entregado aparte — los puntos de mayor impacto son el posible doble cobro en la renovación automática (Oneclick) y una inconsistencia de huso horario en el cálculo de "plan vigente/vencido" entre el navegador y el servidor.
