export default [
  { ignores: ['vendor/', 'node_modules/'] },
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    // Classic scripts: one runs in <head>, the other is the service worker.
    files: ['theme.js', 'service-worker.js'],
    languageOptions: { sourceType: 'script' },
  },
];
