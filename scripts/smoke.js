#!/usr/bin/env node

/**
 * Publish gate. Packs the tarball, installs it into a throwaway project, and exercises it the way
 * a consumer does — because nothing else does.
 *
 * `npm test` runs against `src/`, so it says nothing about whether the *published* package
 * resolves: an `exports` map can be wrong in ways the source is not, and a version on the registry
 * is permanent. This checks the artifact instead of the sources.
 *
 * Three things, each guarding a decision in `package.json`:
 *
 * 1. Every subpath in `exports` imports from the installed package.
 * 2. `docs/` arrives — the knowledge is half the product, and `files` is an allowlist that
 *    silently drops whatever nobody listed.
 * 3. No `.d.ts.map` arrives — they point at a `src/` the tarball does not carry, so shipping them
 *    sends editors to files that are not there.
 *
 * Wired into `prepublishOnly`. Run it directly with `npm run smoke`.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * The environment for a nested npm, with the parent's `--dry-run` stripped.
 *
 * npm exports every option it was given to its lifecycle scripts as `npm_config_*`, so under
 * `npm publish --dry-run` the `prepublishOnly` chain reaches this script with
 * `npm_config_dry_run=true` set, and the `npm pack` below inherits it: it prints the tarball name
 * and exits 0 having written no file, after which the install fails on a path that is not there.
 * The gate is a local check either way — there is nothing for it to send — so it runs for real
 * whether or not the publish it is gating is a rehearsal.
 */
const environment = { ...process.env }
delete environment.npm_config_dry_run

/** Runs npm, letting its stderr through so a failure explains itself. */
const run = (args, cwd) =>
  execFileSync(npm, args, {
    cwd,
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'inherit'],
  })

/** Every file under a directory, recursively, as paths relative to it. */
function* walk(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) yield* walk(join(directory, entry.name), path)
    else yield path
  }
}

const work = mkdtempSync(join(tmpdir(), 'freelancer-smoke-'))
const failures = []

try {
  // Pack from the working tree. `npm pack` runs prepack/postpack, never prepublishOnly, so
  // calling this from prepublishOnly does not recurse.
  const packed = run(['pack', '--pack-destination', work, '--silent'], root).trim()
  const tarball = packed.split('\n').at(-1)
  if (!tarball) throw new Error('npm pack produced no tarball name')

  // Named but not written is what a dry run leaves behind, so check rather than let the install
  // fail on the missing path several lines later.
  if (!existsSync(join(work, tarball)))
    throw new Error(`npm pack named ${tarball} but wrote no file to ${work}`)

  console.log(`packed ${tarball}`)

  writeFileSync(
    join(work, 'package.json'),
    `${JSON.stringify({ name: 'freelancer-smoke', private: true, type: 'module' }, null, 2)}\n`,
  )

  // Zero runtime dependencies, so this touches only the local file. Not `--silent`: its stdout is
  // captured and nothing here parses it, and silencing npm takes the error text with it.
  run(['install', '--no-audit', '--no-fund', join(work, tarball)], work)

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const installed = join(work, 'node_modules', ...manifest.name.split('/'))

  if (!existsSync(installed)) throw new Error(`install left nothing at ${installed}`)

  // 1. Every subpath resolves. Run it as a child in the throwaway project so resolution goes
  //    through the installed package rather than this repository.
  const subpaths = Object.keys(manifest.exports).map(
    (key) => manifest.name + (key === '.' ? '' : key.slice(1)),
  )

  writeFileSync(
    join(work, 'imports.js'),
    [
      'let failed = 0',
      `for (const subpath of ${JSON.stringify(subpaths)}) {`,
      '  try {',
      '    const module = await import(subpath)',
      '    const count = Object.keys(module).length',
      "    if (count === 0) throw new Error('resolved but exports nothing')",
      '    console.log(`  ok   ${subpath.padEnd(38)} ${count} exports`)',
      '  } catch (error) {',
      '    failed++',
      '    console.log(`  FAIL ${subpath.padEnd(38)} ${error.message}`)',
      '  }',
      '}',
      'process.exit(failed ? 1 : 0)',
    ].join('\n'),
  )

  console.log(`\nimporting ${subpaths.length} subpaths:`)

  try {
    execFileSync(process.execPath, ['imports.js'], { cwd: work, stdio: 'inherit' })
  } catch {
    failures.push('one or more subpaths failed to import')
  }

  // 2. The documents shipped.
  const documents = existsSync(join(installed, 'docs'))
    ? readdirSync(join(installed, 'docs')).filter((name) => name.endsWith('.md'))
    : []

  if (documents.length === 0) failures.push('no documents under docs/ — check `files`')
  else console.log(`\nok   docs/ — ${documents.length} documents`)

  // 3. No declaration maps, which would point at a src/ this tarball does not carry.
  const dangling = [...walk(join(installed, 'dist'))].filter((path) => path.endsWith('.d.ts.map'))

  if (dangling.length > 0)
    failures.push(`${dangling.length} .d.ts.map files shipped — check the \`files\` exclusion`)
  else console.log('ok   no .d.ts.map files')
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) with the packed tarball:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('\ntarball is publishable')
