import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
      // Variabel/argumen berawalan _ sengaja tidak dipakai; sisa destrukturisasi ({ id, ...rest }) juga.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Aturan untuk React Compiler (tidak dipakai di proyek ini). Tetap ditampilkan sebagai
      // peringatan agar bisa dibereskan bertahap saat file-file besar dipecah.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Hanya memengaruhi hot-reload saat pengembangan, bukan perilaku aplikasi.
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Berjalan di Node: konfigurasi Vite dan Vercel Function.
    files: ['vite.config.js', 'api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])
