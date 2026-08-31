<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Flujo de trabajo con Claude Code (skills)

Antes de dar por cerrado un cambio, según el tipo de trabajo:

- **Tocaste RLS/policies de Supabase, auth (operador/cliente), o el flujo de pago (Transbank)** → correr skill `security-review` sobre el diff antes de mergear.
- **Agregaste o modificaste un gráfico/dashboard** (ej. Stats del operador, splits como "Vencidos Web vs Local") → cargar skill `dataviz` antes de escribir el chart (paleta, tooltips, legends, forma de marca).
- **Antes de mergear cualquier rama de feature/fix** → correr skill `code-review` sobre el diff.
- **Cambio visual en landing, portal cliente (`/cliente`) u operador** → usar skill `run` para levantar la app y verificar el cambio en el navegador antes de darlo por bueno (no asumir por el código).
- **Después de una tanda de commits rápidos/parches sueltos** (ej. varios ajustes de mobile seguidos) → correr skill `simplify` antes de cerrar la rama.
- **Pregunta de negocio, no de código** (a quién mandar una campaña, si funcionó un descuento, cuánto se vendió en planes, qué clientes están en riesgo) → delegar al agente `comercial` (`.claude/agents/comercial.md`), que consulta la base en solo-lectura con `scripts/q.mts` y trae codificadas las trampas de clasificación de ventas. No improvisar SQL sobre `ventas` sin leerlo primero.

No aplica a este proyecto: `claude-api` (no hay SDK de Anthropic ni integración LLM en el stack).
