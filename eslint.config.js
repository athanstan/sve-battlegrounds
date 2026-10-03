import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Import boundaries that keep the architecture honest. Each entry is one rule of the design. */
const banned = {
  pixi: {
    name: 'pixi.js',
    message: 'PixiJS is confined to @sve/playmat; the DOM chrome never touches it.',
  },
  gsap: { name: 'gsap', message: 'Animation lives inside @sve/playmat.' },
  react: { name: 'react', message: 'React is chrome only; @sve/playmat has no React.' },
  reactDom: { name: 'react-dom', message: 'React is chrome only; @sve/playmat has no React.' },
  colyseusServer: {
    name: 'colyseus',
    message: 'Server framework: never import it into client or shared code.',
  },
  colyseusCore: {
    name: '@colyseus/core',
    message: 'Server framework: never import it into client or shared code.',
  },
  colyseusSdk: { name: '@colyseus/sdk', message: 'Client SDK: only the web app talks to rooms.' },
};

const restrict = (...entries) => ({
  'no-restricted-imports': ['error', { paths: entries }],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', '**/coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            '*/*/vitest.config.ts',
            '*/*/tsup.config.ts',
            'scripts/*.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Tests may poke at crafted states and assert on loosely typed values.
  {
    files: ['**/*.test.ts', '**/testing/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  // The rules engine is pure and deterministic: no clocks, no ambient randomness, no framework.
  {
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/testing/**'],
    rules: {
      ...restrict(
        banned.pixi,
        banned.gsap,
        banned.react,
        banned.reactDom,
        banned.colyseusServer,
        banned.colyseusCore,
        banned.colyseusSdk,
      ),
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG in match state (rng.ts).',
        },
        { object: 'Date', property: 'now', message: 'Rules must not read the clock.' },
        { object: 'performance', property: 'now', message: 'Rules must not read the clock.' },
        { object: 'crypto', property: 'randomUUID', message: 'Use the seeded RNG in match state.' },
        {
          object: 'crypto',
          property: 'getRandomValues',
          message: 'Use the seeded RNG in match state.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Rules must not read the clock.',
        },
      ],
    },
  },

  // Shared contracts stay framework-free.
  {
    files: [
      'packages/protocol/src/**/*.ts',
      'packages/shadowshowdown/src/**/*.ts',
      'packages/cards/src/**/*.ts',
    ],
    rules: restrict(
      banned.pixi,
      banned.gsap,
      banned.react,
      banned.reactDom,
      banned.colyseusServer,
      banned.colyseusCore,
      banned.colyseusSdk,
    ),
  },

  // The playmat is Pixi only: no React, no networking. It receives views and emits intents.
  {
    files: ['packages/playmat/src/**/*.ts'],
    rules: restrict(
      banned.react,
      banned.reactDom,
      banned.colyseusServer,
      banned.colyseusCore,
      banned.colyseusSdk,
    ),
    languageOptions: { globals: globals.browser },
  },

  // The server never draws.
  {
    files: ['apps/server/src/**/*.ts'],
    rules: restrict(banned.pixi, banned.gsap, banned.react, banned.reactDom, banned.colyseusSdk),
    languageOptions: { globals: globals.node },
  },

  // Integration tests drive the server through the real client SDK, the way a browser does.
  {
    files: ['apps/server/src/**/*.test.ts', 'apps/server/src/testing/**/*.ts'],
    rules: restrict(banned.pixi, banned.gsap, banned.react, banned.reactDom),
  },

  // The web app is React chrome. Cards are drawn by the playmat, never in the DOM.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...restrict(banned.pixi, banned.gsap, banned.colyseusServer, banned.colyseusCore),
    },
    languageOptions: { globals: globals.browser },
  },

  // Plain JS tooling files are not type-checked.
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
