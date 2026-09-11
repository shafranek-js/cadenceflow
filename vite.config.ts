import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? "/cadenceflow/" : "/"),
  plugins: [react()],
  publicDir: "public",
  build: {
    target: "es2025",
    sourcemap: true,
  },
});
