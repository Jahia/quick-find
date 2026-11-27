import { defineConfig } from "vite";
import jahia from "@jahia/vite-federation-plugin";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "./src/main/resources/javascript/apps/",
    minify: mode !== "development",
    sourcemap: mode === "development",
  },
  plugins: [
    jahia({
      exposes: {
        "./init": "./src/javascript/init.ts",
      },
    }),
  ],
}));
