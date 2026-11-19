import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const PALETTE_FAMILIES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TOKEN_UTILITIES =
  "bg|text|border|divide|ring|from|via|to|fill|stroke|shadow|outline|decoration|placeholder|caret|accent";
const VARIANT = "(?:[a-z0-9-]+:)*";

const RAW_PALETTE = new RegExp(
  `(?:^|[\\s"'\`:!])(${VARIANT}(?:${TOKEN_UTILITIES})-(?:${PALETTE_FAMILIES})-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\\/[0-9.]+)?)(?=[\\s"'\`]|$)`,
  "g"
);
const MICRO_TYPE = /(?:^|[\s"'`:!])((?:[a-z0-9-]+:)*text-\[(?:[0-9]|1[01])px\])(?=[\s"'`]|$)/g;
const OFF_SCALE_TYPE = /(?:^|[\s"'`:!])((?:[a-z0-9-]+:)*text-lg)(?=[\s"'`]|$)/g;

const stringVisitor = (rule) => ({
  Literal(node) {
    if (typeof node.value === "string") rule(node.value, node);
  },
  TemplateElement(node) {
    rule(node.value.raw, node);
  },
});

const reportMatches = (context, pattern, messageId, value, node, data) => {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(value))) {
    context.report({ node, messageId, data: { token: match[1], ...data } });
  }
};

const designTokens = {
  rules: {
    "no-raw-palette": {
      meta: {
        type: "suggestion",
        docs: { description: "Disallow raw Tailwind palette utilities" },
        schema: [],
        messages: { palette: "'{{token}}' is a raw palette utility. Use a semantic token from tailwind.config.ts." },
      },
      create(context) {
        return stringVisitor((value, node) => reportMatches(context, RAW_PALETTE, "palette", value, node));
      },
    },
    "no-micro-type": {
      meta: {
        type: "suggestion",
        docs: { description: "Disallow arbitrary type below the 12px metadata floor" },
        schema: [],
        messages: { micro: "'{{token}}' renders below the 12px metadata floor." },
      },
      create(context) {
        return stringVisitor((value, node) => reportMatches(context, MICRO_TYPE, "micro", value, node));
      },
    },
    "no-off-scale-type": {
      meta: {
        type: "suggestion",
        docs: { description: "Disallow type steps outside the five-step scale" },
        schema: [],
        messages: { offScale: "'{{token}}' is not one of the five type steps (12 / 14 / 16 / 20–24 / 28–48)." },
      },
      create(context) {
        return stringVisitor((value, node) => reportMatches(context, OFF_SCALE_TYPE, "offScale", value, node));
      },
    },
    "no-local-font": {
      meta: {
        type: "suggestion",
        docs: { description: "Disallow font-family choices outside the typography token file" },
        schema: [],
        messages: { font: "Font family is chosen once in src/styles/typography.css. Use font-sans or font-display." },
      },
      create(context) {
        return {
          Property(node) {
            const key = node.key;
            const isFontFamily = key && (key.name === "fontFamily" || key.value === "fontFamily");
            // Tenant-brand fonts and API payloads pass values through; only a
            // literal family written in a component is a local font decision.
            if (isFontFamily && node.value && node.value.type === "Literal" && typeof node.value.value === "string") {
              context.report({ node, messageId: "font" });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "design-tokens": { rules: designTokens.rules },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "design-tokens/no-raw-palette": "error",
      "design-tokens/no-micro-type": "error",
      "design-tokens/no-off-scale-type": "error",
      "design-tokens/no-local-font": "error",
    },
  },
);
