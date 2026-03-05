import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    // GitHub Pages project site path. Override via VITE_BASE_PATH when needed.
    base: env.VITE_BASE_PATH || "/finance-tracker-web/",
    build: {
      sourcemap: true,
    },
  };
});
