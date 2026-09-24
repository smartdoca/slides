import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { attachDemoServer } from "./demo/server";

export default defineConfig({
  plugins: [
    react(),
    { name: "eppt-local-demo", configureServer: attachDemoServer },
  ],
  server: { port: 5173 },
});
