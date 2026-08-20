import config from '@retn0/oxfmt-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...config,
  ignorePatterns: ['apps/web/next-env.d.ts'],
  proseWrap: 'preserve',
});
