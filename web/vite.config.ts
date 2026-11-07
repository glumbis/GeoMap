import { defineConfig } from "vite";

export default defineConfig({
  // Pre-bundling MapLibre breaks its web worker in dev. src/main.ts sets the worker URL for builds.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    port: 5173,
    // Browser calls /api/...; Vite forwards to the API, so no CORS setup.
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
});
