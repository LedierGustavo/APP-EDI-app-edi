import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/soa-proxy": {
        target: "http://soa.braspress.com.br",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/soa-proxy/, ""),
      },
      "/rota-cep-proxy": {
        target: "http://dataservices.braspress.com.br",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rota-cep-proxy/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const cnpj = (req as any).headers["x-etiqueta-cnpj"];
            const senha = (req as any).headers["x-etiqueta-senha"];
            if (cnpj && senha) {
              const basic = Buffer.from(`${cnpj}:${senha}`).toString("base64");
              proxyReq.setHeader("Authorization", `Basic ${basic}`);
            }
          });
        },
      },
    },
  },
});
