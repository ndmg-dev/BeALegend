module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./tsconfig.app.json'], tsconfigRootDir: __dirname },
  plugins: ['react-refresh'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '*.cjs', '*.config.ts', '*.config.js', 'e2e'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // domain/ é puro: não importa React nem I/O. A regra abaixo é o guarda-corpo.
    'no-restricted-imports': 'off',
  },
  overrides: [
    {
      files: ['src/domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['react', 'react-*', '@/features/*', '@/data/*', '@/ui/*', '@/platform/*'], message: 'domain/ é puro: sem React, sem I/O.' },
            ],
          },
        ],
      },
    },
  ],
};
