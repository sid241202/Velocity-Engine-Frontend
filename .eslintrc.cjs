module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // This codebase doesn't use the prop-types package anywhere (plain JS,
    // no PropTypes declarations on any component, by established
    // convention) — enabling this would flag every prop of every component
    // in the repo, not a real gap.
    'react/prop-types': 'off',
    // Many files still `import React from 'react'` out of habit under the
    // new JSX transform (plugin:react/jsx-runtime, extended above, doesn't
    // require it) — harmless and widespread; not worth a repo-wide import
    // removal pass to satisfy this rule.
    'no-unused-vars': ['error', { varsIgnorePattern: '^React$' }],
  },
  overrides: [
    {
      // vite.config.js runs under Node (build tooling), not the browser —
      // it reads process.env, which the rest of the app (browser env) never does.
      files: ['vite.config.js'],
      env: { node: true, browser: false },
    },
  ],
}
