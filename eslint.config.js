import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    tseslint.configs.strict,
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    {
        rules: {
            // Allow explicit any in plugin context
            "@typescript-eslint/no-explicit-any": "off",
            // Allow non-null assertions for state management
            "@typescript-eslint/no-non-null-assertion": "off",
            // Allow empty object types for extensibility
            "@typescript-eslint/no-empty-object-type": "off",
        },
    },
)
