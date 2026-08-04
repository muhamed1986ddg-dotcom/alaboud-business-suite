import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) return "react-vendor";
          if (id.includes("node_modules/axios")) return "http-vendor";
          if (id.includes("/src/screens/")) {
            const name=id.split("/src/screens/")[1]?.split(".")[0];
            if(name)return `screen-${name.toLowerCase()}`;
          }
        }
      }
    }
  }
});
