import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/math/index.ts',
    './src/alchemy/index.ts',
    './src/animation/index.ts',
    './src/vmesh/index.ts',
    './src/compound/index.ts',
    './src/rigid/index.ts',
    './src/utility/index.ts',
    './src/surface/index.ts',
    './src/texture/index.ts',
    './src/material/index.ts',
    './src/deformable/index.ts',
    './src/index.ts',
  ],
  platform: 'neutral',
})
