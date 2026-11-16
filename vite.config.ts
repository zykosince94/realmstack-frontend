/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  // xfwd adds X-Forwarded-For so the API can rate-limit per browser, not per proxy.
  // The API only honours it from TRUSTED_PROXIES.
  const apiTarget = { target: env.VITE_API_PROXY_TARGET || "http://localhost:8080", xfwd: true };
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/v1": apiTarget,
        "/healthz": apiTarget,
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      restoreMocks: true,
    },
  };
});
