import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/ini/text/index.ts',
    './src/ini/binary/index.ts',
    './src/ini/index.ts',
    './src/thn/bytecode/index.ts',
    './src/thn/text/index.ts',
    './src/thn/index.ts',
    './src/utility/index.ts',
    './src/index.ts',
  ],
  platform: 'neutral',
})
