import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the production build work from any folder or sub-path
// (for example GitHub Pages at https://<user>.github.io/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, host: "localhost" },
  // ethers.js is a large library; one ~570 kB bundle is fine for this app.
  build: { chunkSizeWarningLimit: 800 },
});
