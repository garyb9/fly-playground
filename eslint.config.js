import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "target/",
      "crates/**/pkg/",
      "pipeline/",
      ".yarn/",
      "**/*.d.ts",
      "*.config.*",
      "node_modules/",
    ],
  },
  {
    files: ["src/**/*.{ts,js}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
);
