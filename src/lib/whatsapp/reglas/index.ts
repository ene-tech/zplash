// Motor de reglas WhatsApp, dividido por responsabilidad:
//   - motor.ts: ejecuta una regla ya disparada contra un cliente (variables,
//     cupón, envío) — usado por disparadores.ts y cron.ts, y por
//     @/lib/whatsapp/masivo (construirVariables/enviarSegunPlantilla).
//   - disparadores.ts: entra desde eventos de negocio (venta, ingreso, cobro
//     fallido, cambio de patente) y decide si corresponde disparar cada regla.
//   - cron.ts: el barrido diario (/api/whatsapp/reglas/evaluar) que procesa
//     disparos programados con delay y evalúa "plan_proximo_vencer".
// Este barrel reexporta todo para que los callers existentes
// (`from "@/lib/whatsapp/reglas"` o el relativo "./reglas") no necesiten cambiar.
export * from "./motor";
export * from "./disparadores";
export * from "./cron";
