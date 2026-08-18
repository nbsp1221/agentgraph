import retn0 from '@retn0/eslint-config';
import eslintConfigOxlint from '@retn0/eslint-config-oxlint';

const config = retn0(
  {
    environments: ['node', 'vitest'],
  },
  eslintConfigOxlint,
);

export default [
  ...config,
  {
    name: 'agentgraph/ignore-generated',
    ignores: ['**/dist/**', '**/.turbo/**'],
  },
];
