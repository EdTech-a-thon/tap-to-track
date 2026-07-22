import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws$/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Tap-to-Track",
        short_name: "TapTrack",
        description: "Touch-first classroom participation, skills, and attendance tracking",
        theme_color: "#173f35",
        background_color: "#f5f1e8",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      }
    })
  ],
  server: {
    port: 5173,
    allowedHosts: [".exe.xyz", ".edtechathon.com"],
    proxy: { "/api": "http://127.0.0.1:8000", "/ws": { target: "ws://127.0.0.1:8000", ws: true } }
  }
});