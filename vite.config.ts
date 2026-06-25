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
      dts: false,
      shared: {
        react: { singleton: true, version: "0.0.0" },
        "react-dom": { singleton: true, version: "0.0.0" },
        "@apollo/client": { singleton: true, version: "0.0.0" },
        "prop-types": { singleton: true, version: "0.0.0" },
        graphql: { singleton: true, version: "0.0.0" },
        i18next: { singleton: true, version: "0.0.0" },
        "react-i18next": { singleton: true, version: "0.0.0" },
      },
    }),
  ],
}));
