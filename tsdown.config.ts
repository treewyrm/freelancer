import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/text/index.ts',
    './src/binary/index.ts',
    './src/utility/index.ts',
    './src/index.ts',
  ],
  platform: 'neutral',
})
