import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-robot/**", // npm run build:robot
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party build artefacts we ship verbatim and must not reformat:
    // the self-hosted Draco decoder from the `three` package.
    "public/draco/**",
    // Pyodide, copied from node_modules by tools/build/copy-pyodide.mjs, and the generated service worker.
    "public/pyodide/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
