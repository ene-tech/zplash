# Comunicaciones del paso al Plan X5 — textos y reglas a cargar

Son **cuatro mensajes**: dos avisando que el ilimitado se termina (correo y
WhatsApp) y dos confirmando lo que quedó contratado (correo y WhatsApp). Esto
es configuración, no código: se carga a mano en la app.

Variables disponibles en los dos canales: `{{nombre}}`, `{{patente}}`,
`{{plan}}`, `{{fechaVencimiento}}`, `{{monto}}`, `{{precioRenovacion}}`. Ojo con
los typos: una variable que el motor no conoce sale vacía y no falla nada — la
campaña del 27-ago-2026 se mandó a 387 clientes diciendo "por solo $ —".

---

## A. Termina el ilimitado

Va a los **436 clientes con Plan Ilimitado Mensual vigente**. Lo importante es
que diga las tres cosas: que el plan viejo se acabó, que nadie les va a cobrar
solos, y qué tienen que hacer si quieren seguir.

### A1 · WhatsApp

**Dónde**: Web Settings → WhatsApp Plantillas → nueva.
**Categoría en Meta**: `utility`. Es un aviso sobre un servicio ya contratado;
mandado como marketing lo pueden rechazar.
**Nombre para Meta**: `aviso_termino_plan_ilimitado`

```
Hola {{nombre}}, te escribimos de ZPlash por el plan de tu patente {{patente}}.

Tu Plan Ilimitado Mensual dejó de ofrecerse. El plan que tenemos hoy es el Plan
X5: 5 lavados Full Túnel al mes, uno cada 24 horas, con aspirado incluido
después de cada uno.

No te vamos a cobrar nada de forma automática. Tu plan actual sigue igual hasta
el {{fechaVencimiento}}, y si quieres continuar, tú contratas el Plan X5 cuando
quieras: en zplash.cl/pagar con tu patente, en tu cuenta, o en el local.

Si no haces nada, simplemente no se te cobra.
```

### A2 · Correo

**Dónde**: Web Settings → Plantillas de correo → nueva.
**Asunto**: `Tu Plan Ilimitado se termina — no te vamos a cobrar sin que lo pidas`

Mismo cuerpo, más estos dos párrafos que en WhatsApp no caben:

```
Por qué cambia: el Plan Ilimitado Mensual salió de venta y ya no se renueva.

Si en algún mes necesitas más de 5 lavados, tienes el lavado adicional a precio
preferencial para tu patente por lo que quede del período. Las condiciones
completas están en zplash.cl/politicas.
```

### Las dos reglas (para que no dependa de una campaña puntual)

Una en **Reglas de correo** y otra en **Reglas de WhatsApp**, idénticas:

| Campo | Valor |
|---|---|
| Tipo de evento | `plan_proximo_vencer` |
| Filtro por plan | **solo** `Plan Ilimitado Mensual` |
| Días antes del vencimiento | 7 |
| Acción | `mensaje_simple` (no genera cupón) |

El filtro por plan lee `clientes.plan` tal cual, así que esto no le llega a
nadie que ya esté en el X5.

---

## B. Contrató el Plan X5

Confirmación de lo que quedó contratado, en el momento de la venta. Sirve de
respaldo: queda registro de qué se le dijo que estaba comprando.

### B1 · WhatsApp

**Nombre para Meta**: `confirmacion_plan_x5` — categoría `utility`.

```
Listo {{nombre}}, tu Plan X5 para la patente {{patente}} quedó activo.

Incluye 5 lavados Full Túnel hasta el {{fechaVencimiento}}, uno cada 24 horas,
con aspirado incluido después de cada uno. Pagaste {{monto}}.

Puedes ver tus lavados usados en tu cuenta en zplash.cl.
```

### B2 · Correo

**Asunto**: `Tu Plan X5 quedó activo hasta el {{fechaVencimiento}}`

Mismo cuerpo, agregando:

```
Si necesitas más de 5 lavados en el mes, el lavado adicional queda a precio
preferencial para tu patente. Las condiciones completas del plan están en
zplash.cl/politicas.
```

### Las dos reglas

| Campo | Valor |
|---|---|
| Tipo de evento | `venta_creada` |
| Filtro por plan | **solo** `Plan X5` |
| Condición tipo de venta | vacío (cualquiera) |
| Días de espera | 0 |
| Acción | `mensaje_simple` |

Dejar el tipo de venta vacío es a propósito: el X5 se contrata por ocho tipos de
venta distintos según el canal (`Plan nuevo`, `Renovación (Web)`, `Reactivación
promocional (Oneclick)`…) y una regla por tipo es inmantenible. El filtro por
plan ya deja fuera los lavados únicos y los servicios, que van con el plan
vacío.

**Efecto lateral a decidir**: así también le llega la confirmación al cliente que
ya estaba en X5 y solo renovó. A mi juicio está bien —es un comprobante de pago—
pero si lo quieres solo para el que viene del ilimitado, hay que agregar una
condición nueva al motor de reglas y eso sí es código.

---

## Lo que NO hay que hacer

- **No rellenar `acepto_x5_en` a nadie.** El candado ya impide que se migre a
  alguien sin su click; rellenar la columna hacia atrás inventaría un
  consentimiento que nunca existió, y esa fecha es justamente la prueba.
- **No tocar a los 150 que ya pasaron.** Su `plan` ya dice Plan X5 y el candado
  no los mira. Con ellos lo pendiente es la devolución del sobreprecio y la
  compensación a los de uso alto.
