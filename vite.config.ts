import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

let previousIndexContents = "";
const staleAssetBridge = {
  name: "stale-asset-bridge",
  buildStart() {
    const currentIndex = resolve("dist/index.html");
    previousIndexContents = existsSync(currentIndex) ? readFileSync(currentIndex, "utf8") : "";
  },
  closeBundle() {
    const assets = resolve("dist/assets");
    const files = readdirSync(assets);
    const currentScript = files.find((file) => /^index-.*\.js$/.test(file));
    const currentStyles = files.find((file) => /^index-.*\.css$/.test(file));
    if (currentScript) copyFileSync(resolve(assets, currentScript), resolve(assets, "index-bwJgPW9Y.js"));
    if (currentStyles) copyFileSync(resolve(assets, currentStyles), resolve(assets, "index-B1jKkSO8.css"));
    const previousIndex = resolve("dist/.previous-index.html");
    const currentIndex = resolve("dist/index.html");
    if (previousIndexContents) {
      const previousScript = previousIndexContents.match(/\/assets\/(index-[^"']+\.js)/)?.[1];
      const previousStyles = previousIndexContents.match(/\/assets\/(index-[^"']+\.css)/)?.[1];
      if (currentScript && previousScript && !existsSync(resolve(assets, previousScript))) copyFileSync(resolve(assets, currentScript), resolve(assets, previousScript));
      if (currentStyles && previousStyles && !existsSync(resolve(assets, previousStyles))) copyFileSync(resolve(assets, currentStyles), resolve(assets, previousStyles));
    }
    writeFileSync(previousIndex, readFileSync(currentIndex));
  },
};

export default defineConfig({
  plugins: [
    react(),
    staleAssetBridge,
    VitePWA({
      registerType: "autoUpdate",
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
