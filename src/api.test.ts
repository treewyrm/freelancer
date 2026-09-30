/**
 * Every module doc's `## API` section claims to be resolved from `src/` with the TypeScript checker
 * rather than transcribed. This is what makes that true: it resolves the exports the same way and
 * fails when a document and its barrel disagree in either direction. [CLAUDE.md](../CLAUDE.md)'s
 * entry-point table carries the same claim for the summary counts.
 *
 * It exists because the documentation drifted once already — an `./ini` rework to classes left eleven
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

/** Subpath → the module doc whose `## API` section documents it. Several subpaths share a doc. */
const DOC_OF: Record<string, string> = {
  '.': 'docs/modules/UTF.md',
  './utility': 'docs/modules/UTF.md',
  './math': 'docs/modules/MATH.md',
  './utf': 'docs/modules/UTF.md',
  './alchemy': 'docs/modules/ALCHEMY.md',
  './animation': 'docs/modules/ANIMATION.md',
  './vmesh': 'docs/modules/VMESH.md',
  './compound': 'docs/modules/COMPOUND.md',
  './rigid': 'docs/modules/RIGID.md',
  './surface': 'docs/modules/SURFACE.md',
  './texture': 'docs/modules/TEXTURE.md',
  './material': 'docs/modules/MATERIAL.md',
  './deformable': 'docs/modules/DEFORMABLE.md',
  './ini': 'docs/modules/INI.md',
  './ini/text': 'docs/modules/INI.md',
  './ini/binary': 'docs/modules/INI.md',
  './ini/save': 'docs/modules/INI.md',
  './thn': 'docs/modules/THN.md',
  './thn/text': 'docs/modules/THN.md',
  './thn/bytecode': 'docs/modules/THN.md',
  './thn/scene': 'docs/modules/THN.md',
  './resource': 'docs/modules/RESOURCE.md',
}

/**
 * The `Kind` column's vocabulary, which is also what separates an export row from a member row.
 * `./math`'s companion-object tables are two-column and list names in the second cell, so requiring
 * a bare kind word there keeps `Vector3.dot` from being read as an export of `./math`.
 */
const KINDS = new Set(['function', 'interface', 'type', 'enum', 'const', 'class', 'namespace'])

/** The checker over every barrel, built once and shared by both suites. */
const program = (() => {
  const config = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)

  return ts.createProgram(
    Object.values(ENTRY_POINTS).map((path) => `${root}${path}`),
    parsed.options,
  )
})()

const checker = program.getTypeChecker()

/** The exports of one barrel, by exported name, aliases resolved to what they name. */
function exportsOf(subpath: string): [name: string, symbol: ts.Symbol][] {
  const path = ENTRY_POINTS[subpath]!
  const source = program.getSourceFile(`${root}${path}`)
  if (!source) throw new Error(`${path} is not in the program`)

  const symbol = checker.getSymbolAtLocation(source)
  if (!symbol) throw new Error(`${path} has no module symbol`)

  return checker
    .getExportsOfModule(symbol)
    .map((entry) => [
      entry.getName(),
      entry.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry,
    ])
}

/** Every export of every barrel, resolved through the checker exactly as the document claims. */
function resolveExports(): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  for (const subpath of Object.keys(ENTRY_POINTS)) {
    const path = ENTRY_POINTS[subpath]!
    const source = program.getSourceFile(`${root}${path}`)!
    const symbol = checker.getSymbolAtLocation(source)!

    result[subpath] = checker
      .getExportsOfModule(symbol)
      .map((entry) => entry.getName())
      .sort()
  }

  return result
}

/** Every name listed under a `### \`<subpath>\`` heading inside a doc's `## API` section. */
function parseDocument(): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  for (const file of new Set(Object.values(DOC_OF))) {
    const lines = readFileSync(`${root}${file}`, 'utf8').split('\n')
    let inApi = false
    let current: string | undefined

    for (const line of lines) {
      if (/^## /.test(line)) {
        inApi = line.trim() === '## API'
        current = undefined
        continue
      }

      if (!inApi) continue

      const heading = line.match(/^### `(\.[^`]*)`\s*$/)
      if (heading) {
        current = heading[1]
        result[current!] ??= []
        continue
      }

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
  }

  for (const subpath of Object.keys(result)) result[subpath]!.sort()

  return result
}

describe('API documentation', () => {
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
   * The counts are CLAUDE.md's own summary of itself, and a stale one is the same failure the
   * tables had — it reads as measured when it is not.
   */
  it('counts every entry point correctly in the CLAUDE.md entry-point table', () => {
    const document = readFileSync(`${root}CLAUDE.md`, 'utf8')
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

  it('states the correct total in CLAUDE.md', () => {
    const document = readFileSync(`${root}CLAUDE.md`, 'utf8')
    const total = Object.values(resolved).reduce((sum, names) => sum + names.length, 0)
    const points = Object.keys(ENTRY_POINTS).length

    deepEqual(document.match(/\*\*(\d+) exports across (\d+) entry points\.\*\*/)?.slice(1), [
      String(total),
      String(points),
    ])
  })
})

/**
 * The naming and shape rules in ARCHITECTURE.md, as far as the checker can see them. Each failure
 * names the export that breaks the rule, so a new export that drifts is caught where it is added.
 */
describe('API conventions', () => {
  const TYPE_LIKE =
    ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum | ts.SymbolFlags.Class

  /** Whether a symbol is an exported constant: a variable that is neither callable nor a namespace. */
  const isConstant = (symbol: ts.Symbol): boolean => {
    if (!(symbol.flags & ts.SymbolFlags.Variable) || symbol.flags & TYPE_LIKE) return false

    const declaration = symbol.valueDeclaration
    if (!declaration) return false

    return !checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures().length
  }

  // C3. Companion objects (`Vector3`, an interface and a const of the same name) are types first
  // and keep the type's name.
  it('names exported constants in SCREAMING_SNAKE_CASE', () => {
    const offenders: string[] = []

    for (const subpath of Object.keys(ENTRY_POINTS))
      for (const [name, symbol] of exportsOf(subpath))
        if (isConstant(symbol) && !/^[A-Z][A-Z0-9_]*$/.test(name))
          offenders.push(`${subpath}: ${name}`)

    deepEqual(offenders, [])
  })

  // C2. Members are PascalCase, acronyms upper case within them (C4), never SCREAMING_SNAKE.
  it('names enum members in PascalCase', () => {
    const offenders: string[] = []

    for (const subpath of Object.keys(ENTRY_POINTS))
      for (const [name, symbol] of exportsOf(subpath))
        if (symbol.flags & ts.SymbolFlags.Enum)
          for (const member of checker.getExportsOfModule(symbol))
            if (!/^[A-Z][A-Za-z0-9]*$/.test(member.getName()))
              offenders.push(`${subpath}: ${name}.${member.getName()}`)

    deepEqual(offenders, [])
  })

  /** Whether a type is `null` or a union with `null` in it. */
  const hasNull = (type: ts.Type): boolean =>
    !!(type.flags & ts.TypeFlags.Null) || (type.isUnion() && type.types.some(hasNull))

  // C7. Absence is `undefined` or a missing key; a signature carrying `null` is how one leaks.
  it('never takes or returns null', () => {
    const offenders: string[] = []

    for (const subpath of Object.keys(ENTRY_POINTS))
      for (const [name, symbol] of exportsOf(subpath)) {
        const declaration = symbol.valueDeclaration
        if (!declaration) continue

        const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)

        for (const signature of type.getCallSignatures()) {
          const types = [
            signature.getReturnType(),
            ...signature
              .getParameters()
              .map((parameter) => checker.getTypeOfSymbolAtLocation(parameter, declaration)),
          ]

          if (types.some(hasNull)) offenders.push(`${subpath}: ${name}`)
        }
      }

    deepEqual(offenders, [])
  })

  /**
   * C11. Entry points whose data refers to one another, so that a consumer of one imports the
   * other into the same file. The foundations — identity, utilities, math, the UTF container —
   * relate to everything; past them, a pair is listed only where one module's data names or
   * contains the other's. Adding an entry point means saying what it relates to.
   */
  const FOUNDATIONS = ['.', './utility', './math', './utf']

  const RELATED: [string, string][] = [
    ['./alchemy', './thn/scene'],
    ['./alchemy', './texture'],
    ['./animation', './compound'],
    ['./animation', './rigid'],
    ['./animation', './deformable'],
    ['./animation', './thn/scene'],
    ['./compound', './rigid'],
    ['./compound', './deformable'],
    ['./compound', './vmesh'],
    ['./compound', './surface'],
    ['./rigid', './vmesh'],
    ['./rigid', './material'],
    ['./rigid', './texture'],
    ['./rigid', './surface'],
    ['./rigid', './deformable'],
    ['./vmesh', './material'],
    ['./vmesh', './deformable'],
    ['./material', './texture'],
    ['./material', './deformable'],
    ['./texture', './deformable'],
    ['./ini', './ini/text'],
    ['./ini', './ini/binary'],
    ['./ini', './ini/save'],
    ['./ini', './resource'],
    ['./thn', './thn/text'],
    ['./thn', './thn/bytecode'],
    ['./thn', './thn/scene'],
  ]

  const related = (a: string, b: string): boolean =>
    FOUNDATIONS.includes(a) ||
    FOUNDATIONS.includes(b) ||
    RELATED.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

  it('lists only entry points in its relations', () => {
    for (const subpath of [...FOUNDATIONS, ...RELATED.flat()])
      deepEqual(subpath in ENTRY_POINTS, true, subpath)
  })

  it('gives no two related entry points a type of the same name', () => {
    const types = new Map<string, string[]>()

    for (const subpath of Object.keys(ENTRY_POINTS))
      for (const [name, symbol] of exportsOf(subpath))
        if (symbol.flags & TYPE_LIKE) {
          // A re-export of the same declaration is one type under two paths, not two types.
          const declaration = symbol.declarations?.[0]
          const owners = types.get(name) ?? []
          owners.push(`${subpath}\0${declaration?.getSourceFile().fileName}:${declaration?.pos}`)
          types.set(name, owners)
        }

    const clashes: string[] = []

    for (const [name, owners] of types)
      for (const [i, a] of owners.entries())
        for (const b of owners.slice(i + 1)) {
          const [pathA, fileA] = a.split('\0')
          const [pathB, fileB] = b.split('\0')
          if (fileA !== fileB && related(pathA!, pathB!))
            clashes.push(`${name}: ${pathA}, ${pathB}`)
        }

    deepEqual(clashes, [])
  })
})
