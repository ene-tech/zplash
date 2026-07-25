// "server-only" (node_modules/server-only) tira un error incondicional al
// importarse fuera de un build de Next.js — hace falta este stub para poder
// testear módulos que empiezan con `import "server-only"` bajo Vitest (ver
// alias en vitest.config.ts).
export {};
