import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/lib/testUtils/serverOnlyStub.ts"),
    },
  },
  test: {
    environment: "node",
    // Los skills de agentes traen sus propios .test.mjs (otro runner) y
    // ensucian el resultado de `npm test`.
    exclude: ["**/node_modules/**", ".claude/**", ".agents/**"],
    // Dummy: alcanza para que createClient() en @/lib/supabase no reviente
    // al importarse transitivamente (ej. desde @/lib/dataAccess/storage) en
    // tests que no ejercitan código de Supabase de verdad.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
