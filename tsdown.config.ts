import { defineConfig } from 'tsdown';

export default defineConfig({
  banner: {
    js: '#!/usr/bin/env node',
  },
  entry: ['src/cli.ts'],
  format: ['esm'],
  outExtensions: () => ({ js: '.js' }),
  platform: 'node',
  sourcemap: true,
  target: 'node24',
});
