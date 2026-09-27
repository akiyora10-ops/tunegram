import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'resources/**', '*.cjs']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart']
    }
  },
  {
    // Build-time Node scripts (icon generation) run outside the bundler.
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },
  {
    // The example addon is plain JS, evaluated at runtime by plugin code.
    files: ['resources/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
)
