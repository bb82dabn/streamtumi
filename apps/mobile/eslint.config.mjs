import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  ...expoConfig,
  {
    ignores: [".expo/**"],
    rules: {
      "import/namespace": "off",
      "import/no-duplicates": "off",
      "import/no-unresolved": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
