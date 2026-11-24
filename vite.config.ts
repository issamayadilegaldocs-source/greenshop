import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Vite only exposes prefixed variables to the browser bundle. NEXT_PUBLIC_ is
  // accepted as well so copy-pasted snippet names from the Supabase dashboard
  // keep working, but VITE_* is the preferred spelling in this project.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: { host: "::", port: 8080 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts is the custom SSR entry (error wrapper); it is not the
      // default `src/server.ts` convention only because we opt in explicitly.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Nitro bundles the SSR server for production builds. NITRO_PRESET selects
    // the deploy target: vercel (auto when VERCEL=1), node-server (default)…
    ...(command === "build"
      ? [
          nitro({
            preset:
              process.env["NITRO_PRESET"] ||
              (process.env["VERCEL"] ? "vercel" : "node-server"),
          }),
        ]
      : []),
    react(),
  ],
}));
