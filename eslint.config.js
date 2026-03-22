import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.netlify', 'dev-dist', 'scripts', 'cloudflare-worker', 'supabase-functions', 'supabase']),

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]|^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Standard React pattern: calling setState/async loaders inside useEffect is intentional
      'react-hooks/set-state-in-effect': 'off',
      // Context files deliberately export both a Provider component and a useX hook
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    files: ['netlify/functions/**/*.js', 'check_subs.js', 'modify_inputs.js', 'modify_patient_detail.js', 'update_plans.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.builtin,
      },
    },
  },
])
