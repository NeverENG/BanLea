import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 为后续接入 Tauri 预留：固定端口、清屏关闭，便于桌面外壳加载
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
