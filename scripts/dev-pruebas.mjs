// Levanta la app contra la BASE DE PRUEBAS (.env.pruebas) en el puerto 3100.
// Next no acepta --env-file vía NODE_OPTIONS, así que se cargan las
// variables acá y se le pasan al proceso hijo ya resueltas.
import { spawn } from "node:child_process";

process.loadEnvFile(".env.pruebas");
// Build aparte: si no, next dev choca con el lock del servidor de producción.
process.env.NEXT_DIST_DIR = ".next-pruebas";
spawn(process.execPath, ["./node_modules/next/dist/bin/next", "dev", "-p", "3100"], {
  stdio: "inherit",
  env: process.env,
}).on("exit", (code) => process.exit(code ?? 0));
