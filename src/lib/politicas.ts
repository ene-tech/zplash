// Texto de las "Políticas de Funcionamiento y Garantía": se publica en
// /politicas y el cliente lo acepta desde Mi Cuenta (ver AvisoPoliticas).
// Vive en código y no en la base por el mismo criterio que PREGUNTAS en
// FaqTab — es contenido editorial, no configuración por local.
//
// POLITICAS_VERSION se guarda junto a cada aceptación (ver
// politicasAceptadas en @/db/schema/clientes): al subirla, el aviso vuelve a
// aparecer y se pide aceptar la versión nueva, sin borrar el registro de
// haber aceptado la anterior. Súbela cuando cambie algo que le importe al
// cliente (plazos, garantía, cobros), no por una corrección de redacción.
export const POLITICAS_VERSION = "2026-08-19";

// A propósito sin cifras que sean configurables desde Configuración
// (horasBloqueoReingresoPlan, vigenciaDiasPackEmpresa, tramos de promoción):
// un documento que el cliente acepta no puede quedar desfasado de la base
// sin que nadie se entere. Mismo criterio que la FAQ, que dice "cada 24
// horas" y no el 24:30 exacto del default.
//
// Las dos excepciones son promesas de plata que el cliente necesita ver
// escritas, y por eso van con su número acá aunque también vivan en la base:
//   - "15 días" para renovar conservando el precio = ConfigGlobal
//     .diasGraciaPagoAtrasado (Configuración → Pago de plan atrasado).
//   - "$3.990" del lavado adicional = Precios[LAVADO_ADICIONAL_KEY]
//     (Configuración → Lavado túnel suelto).
// Si cambias cualquiera de esos dos valores, cambia también este texto y
// sube POLITICAS_VERSION: si no, el documento que el cliente aceptó promete
// una cosa y el sistema le cobra otra.
export const POLITICAS: { titulo: string; puntos: string[] }[] = [
  {
    titulo: "1. Plan X5",
    puntos: [
      "Tiene una vigencia de 30 días corridos contados desde la fecha de contratación.",
      "Incluye 5 lavados Full Túnel dentro de ese período, con un máximo de un ingreso cada 24 horas.",
      "Usadas las 5 pasadas, el lavado Full Túnel adicional tiene un precio preferencial de $3.990 por lo que queda del período. Ese valor es exclusivo para el vehículo que tiene el plan.",
      "Los planes contratados antes del Plan X5 mantienen los lavados ilimitados que se les ofrecieron, y pasan al Plan X5 cuando renuevan.",
      "Incluye el uso de las máquinas aspiradoras de autoservicio sin límite de tiempo, después de cada uno de los 5 lavados del plan. El aspirado va asociado a la pasada por el túnel, no es un acceso libre aparte.",
      "Es válido para una sola patente y es personal e intransferible: no puede usarse para lavar otro vehículo.",
      "El cambio de patente se solicita desde Mi Cuenta y se aplica al inicio del período siguiente, no durante el período vigente.",
      "Está destinado a vehículos de uso particular o de empresa. No aplica a taxis, colectivos, transporte público ni vehículos de aplicaciones de transporte.",
    ],
  },
  {
    titulo: "2. Ingreso al túnel",
    puntos: [
      "Cada ingreso queda registrado con la patente del vehículo.",
      "Si el vehículo ya pasó dentro de las últimas 24 horas, el siguiente ingreso por plan queda bloqueado hasta cumplir ese plazo. Igualmente puedes lavar pagando un Lavado Único.",
      "Los ingresos se reciben dentro del horario de atención publicado en la sección Ubicación y Horarios.",
      "Tienen un recargo sobre el valor del lavado las camionetas, los vehículos que lleguen con barro en exceso y los que traigan accesorios que deban lavarse aparte (parrillas, portaequipajes, pisaderas, cubre pick up y similares). El operador te informa el monto antes de ingresar.",
      "Nos reservamos el derecho de rechazar el ingreso de un vehículo cuyo estado, tamaño, carga o accesorios no sean compatibles con el túnel.",
    ],
  },
  {
    titulo: "3. Estado del vehículo y responsabilidad",
    puntos: [
      "Antes de ingresar, el conductor debe cerrar completamente ventanas y techo corredizo, plegar o retirar la antena y los espejos exteriores, y retirar parrillas, portaequipajes, ganchos, adornos y cualquier accesorio suelto o desmontable.",
      "El conductor debe declarar al operador cualquier daño previo, modificación o accesorio no original antes de ingresar.",
      "No respondemos por daños derivados de piezas sueltas, mal fijadas, en mal estado o no declaradas: molduras despegadas, emblemas, tapabarros, plumillas, focos trizados, pintura escamada o con reparaciones no originales, ni por accesorios agregados al vehículo.",
      "En camionetas con el pick up descubierto, sin lona ni tapa, el agua se acumula en la batea durante el lavado y al secarse deja rastros de detergente. Es propio del formato del vehículo y no se considera un defecto del lavado.",
      "Cuida tus pertenencias: retira los objetos de valor del interior antes de entregar el vehículo o de usar el sector de aspirado.",
    ],
  },
  {
    titulo: "4. Garantía de relavado",
    puntos: [
      "Si el resultado del lavado no te dejó conforme, avísale al operador en el momento y repasamos tu vehículo sin costo.",
      "La garantía se hace efectiva en el local, el mismo día y dentro de la primera hora desde el lavado. Pasado ese plazo, el vehículo ya estuvo en circulación y el nuevo lavado se considera una pasada nueva.",
      "El relavado no tiene costo, no descuenta del plan y no requiere pagar un lavado único.",
      "La garantía cubre el resultado del lavado, es decir suciedad que no salió. No cubre daños previos ni suciedad adherida que requiera un tratamiento de Detailing (alquitrán, savia, pintura, cemento, adhesivos, manchas incrustadas).",
    ],
  },
  {
    titulo: "5. Reclamos por daños",
    puntos: [
      "Cualquier daño que atribuyas al lavado debe informarse al operador antes de salir del recinto, para revisar el vehículo en conjunto y dejar registro.",
      "Una vez que el vehículo sale del local no es posible verificar el origen del daño, por lo que no podemos hacernos cargo de reclamos posteriores.",
    ],
  },
  {
    titulo: "6. Pagos, renovación y cobro automático",
    puntos: [
      "En el local aceptamos efectivo, tarjeta y transferencia bancaria. Por la web, tarjetas de crédito o débito a través de Webpay Plus.",
      "Al inscribir una tarjeta con Oneclick autorizas el cobro automático del plan al vencimiento de cada período, al precio vigente en ese momento.",
      "El plan es mensual y puedes darlo de baja cuando quieras, eliminando la tarjeta inscrita desde Mi Cuenta o simplemente no renovando. El cobro automático se detiene desde el período siguiente y el plan que ya pagaste sigue vigente hasta su fecha de vencimiento.",
      "Puedes renovar hasta 15 días después del vencimiento conservando tu precio. El período nuevo se cuenta desde tu fecha de contratación y no desde el día en que pagas: los días que estuviste sin pagar quedan bloqueados, no se recuperan, y para lavar durante ese tiempo tienes que pagar un Lavado Único.",
      "Pasados los 15 días el plan se da de baja automáticamente. Volver a tenerlo es una contratación nueva: se cobra al precio vigente y el período parte desde ese día.",
      "Si das de baja tu plan, al volver a contratarlo no recuperas el precio promocional: se cobra el precio vigente en ese momento.",
      "Las promociones que te correspondan se muestran en Mi Cuenta solo mientras están disponibles, cada una con su vigencia.",
      "Los lavados ya realizados no son reembolsables. Si contrataste por error y aún no has usado el plan, escríbenos y lo revisamos caso a caso.",
    ],
  },
  {
    titulo: "7. Detailing y servicios agendados",
    puntos: [
      "Los servicios de Detailing se agendan con anticipación y su duración depende del estado del vehículo.",
      "Si no puedes llegar a tu hora, avísanos con anticipación para reasignar el horario.",
      "El resultado del Detailing depende del estado previo de la pintura y del interior; te informamos antes de comenzar si hay daños que no se pueden revertir.",
    ],
  },
  {
    titulo: "8. Tickets de empresa",
    puntos: [
      "Los tickets de lavado comprados por lote tienen la vigencia indicada al momento de la compra, contada desde su emisión.",
      "Cada ticket da derecho a un lavado y se consume al momento de usarlo. Los tickets vencidos no se reactivan ni se reembolsan.",
    ],
  },
  {
    titulo: "9. Datos personales y comunicaciones",
    puntos: [
      "Usamos tu correo, teléfono y patente únicamente para gestionar tu plan, emitir tus documentos tributarios y avisarte de vencimientos, renovaciones y promociones.",
      "Puedes desactivar las notificaciones del navegador cuando quieras, y pedir la baja de nuestros correos respondiendo cualquiera de ellos.",
    ],
  },
  {
    titulo: "10. Cambios en estas políticas",
    puntos: [
      "Podemos actualizar este documento. Cuando cambie, te pediremos revisar y aceptar la versión nueva la próxima vez que entres a Mi Cuenta.",
    ],
  },
];
