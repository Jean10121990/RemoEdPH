import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    /** Map default browser /favicon.ico probe to our SVG so devtools stays clean */
    {
      name: "remoed-favicon-ico",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/favicon.ico" || req.url?.startsWith("/favicon.ico?")) {
            req.url = "/favicon.png";
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/uploads": { target: "http://localhost:8080", changeOrigin: true },
      "/images": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
