import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDevServer = command === "serve";
  return {
    plugins: [react()],
    // Use root in local dev, but keep the GitHub Pages project path for builds.
    base: isDevServer ? "/" : env.VITE_BASE_PATH || "/finance-tracker-web/",
    build: {
      outDir: env.VITE_BUILD_OUT_DIR || "dist",
      sourcemap: true,
    },
  };
});
