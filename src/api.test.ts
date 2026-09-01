/**
 * [API.md](../docs/API.md) claims to be resolved from `src/` with the TypeScript checker rather than
 * transcribed. This is what makes that true: it resolves the exports the same way and fails when the
 * document and the barrels disagree in either direction.
 *
 * It exists because the document drifted once already — an `./ini` rework to classes left eleven
 * free functions listed that no longer existed, and `surface`'s whole construction layer went
 * undocumented for two days. Both are the kind of gap nothing else in the suite can see: every
 * export still compiled, every test still passed, and only a reader was misled.
 *
 * Adding an export means adding its row. The failure names the row to add.
 */

import { describe, it } from 'node:test'
import { deepEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Subpath → the source barrel `package.json` maps it to. Mirrors `exports` and `tsdown.config.ts`. */
const ENTRY_POINTS: Record<string, string> = {
  '.': 'src/index.ts',
  './utility': 'src/utility/index.ts',
  './math': 'src/math/index.ts',
  './utf': 'src/utf/index.ts',
  './alchemy': 'src/alchemy/index.ts',
  './animation': 'src/animation/index.ts',
  './vmesh': 'src/vmesh/index.ts',
  './compound': 'src/compound/index.ts',
  './rigid': 'src/rigid/index.ts',
  './surface': 'src/surface/index.ts',
  './texture': 'src/texture/index.ts',
  './material': 'src/material/index.ts',
  './deformable': 'src/deformable/index.ts',
  './ini': 'src/ini/index.ts',
  './ini/text': 'src/ini/text/index.ts',
  './ini/binary': 'src/ini/binary/index.ts',
  './ini/save': 'src/ini/save/index.ts',
  './thn': 'src/thn/index.ts',
  './thn/text': 'src/thn/text/index.ts',
  './thn/bytecode': 'src/thn/bytecode/index.ts',
  './thn/scene': 'src/thn/scene/index.ts',
  './resource': 'src/resource/index.ts',
}

/**
 * The `Kind` column's vocabulary, which is also what separates an export row from a member row.
 * `./math`'s companion-object tables are two-column and list names in the second cell, so requiring
 * a bare kind word there keeps `Vector3.dot` from being read as an export of `./math`.
 */
const KINDS = new Set(['function', 'interface', 'type', 'enum', 'const', 'class', 'namespace'])

/** Every export of every barrel, resolved through the checker exactly as the document claims. */
function resolveExports(): Record<string, string[]> {
  const config = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const program = ts.createProgram(
    Object.values(ENTRY_POINTS).map((path) => `${root}${path}`),
    parsed.options,
  )
  const checker = program.getTypeChecker()
  const result: Record<string, string[]> = {}

  for (const [subpath, path] of Object.entries(ENTRY_POINTS)) {
    const source = program.getSourceFile(`${root}${path}`)
    if (!source) throw new Error(`${path} is not in the program`)

    const symbol = checker.getSymbolAtLocation(source)
    if (!symbol) throw new Error(`${path} has no module symbol`)

    result[subpath] = checker
      .getExportsOfModule(symbol)
      .map((entry) => entry.getName())
      .sort()
  }

  return result
}

/** Every name API.md lists under a `## \`<subpath>\`` heading. */
function parseDocument(): Record<string, string[]> {
  const lines = readFileSync(`${root}docs/API.md`, 'utf8').split('\n')
  const result: Record<string, string[]> = {}
  let current: string | undefined

  for (const line of lines) {
    const heading = line.match(/^## `(\.[^`]*)`\s*$/)

    if (heading) {
      current = heading[1]
      result[current!] ??= []
      continue
    }

    if (line.startsWith('## ')) current = undefined
    if (!current || !line.startsWith('|')) continue

    // Split on unescaped pipes only: a description may carry `\|`, as `'binary' \| 'text'` does.
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim())

    if (cells.length !== 3 || !KINDS.has(cells[1]!)) continue

    const name = cells[0]!.match(/^`([A-Za-z0-9_]+)`$/)?.[1]
    if (name) result[current]!.push(name)
  }

  for (const subpath of Object.keys(result)) result[subpath]!.sort()

  return result
}

describe('API.md', () => {
  const resolved = resolveExports()
  const documented = parseDocument()

  for (const subpath of Object.keys(ENTRY_POINTS))
    it(`lists every export of \`${subpath}\`, and nothing else`, () => {
      deepEqual(documented[subpath] ?? [], resolved[subpath])
    })

  it('documents every entry point package.json exports', () => {
    const exported = Object.keys(
      (JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { exports: object }).exports,
    ).sort()

    deepEqual(exported, Object.keys(ENTRY_POINTS).sort())
  })

  /**
   * The counts are the document's own summary of itself, and a stale one is the same failure the
   * tables had — it reads as measured when it is not.
   */
  it('counts every entry point correctly in its summary table', () => {
    const document = readFileSync(`${root}docs/API.md`, 'utf8')
    const counted: Record<string, number> = {}

    for (const [, subpath, count] of document.matchAll(/^\| `(\.[^`]*)`\s*\| (\d+)\s*\|/gm))
      counted[subpath!] = Number(count)

    deepEqual(
      counted,
      Object.fromEntries(
        Object.keys(ENTRY_POINTS).map((subpath) => [subpath, resolved[subpath]!.length]),
      ),
    )
  })

  it('states the correct total', () => {
    const document = readFileSync(`${root}docs/API.md`, 'utf8')
    const total = Object.values(resolved).reduce((sum, names) => sum + names.length, 0)
    const points = Object.keys(ENTRY_POINTS).length

    deepEqual(
      document.match(/\*\*(\d+) exports across (\d+) entry points\.\*\*/)?.slice(1),
      [String(total), String(points)],
    )
  })
})
