import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/math/index.ts',
    './src/alchemy/index.ts',
    './src/vmesh/index.ts',
    './src/model/index.ts',
    './src/utility/index.ts',
    './src/surface/index.ts',
    './src/index.ts',
  ],
  platform: 'neutral',
})
