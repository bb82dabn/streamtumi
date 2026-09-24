import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  ...expoConfig,
  {
    ignores: [".expo/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);
