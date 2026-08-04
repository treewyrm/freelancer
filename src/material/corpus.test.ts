import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '#/corpus.js'
import type Directory from '#/utf/directory.js'
import type File from '#/utf/file.js'
import { getResourceId } from '#/hash.js'
import { readTextures } from '#/texture/library.js'
import BufferView from '#/utility/bufferview.js'
import { readMaterials, writeMaterials } from './library.js'
import { readMaterial, writeMaterial } from './material.js'
import { TextureFlags, defaultNomadTextureName, materialTypes, type Material } from './types.js'

/** Texture slots, as the `<slot>_name`/`<slot>_flags` prefix and the property they read into. */
const slots = [
  ['Dt', 'diffuseTexture'],
  ['Et', 'emissionTexture'],
  ['Bt', 'detailTexture'],
  ['Nt', 'nomadTexture'],
  ['Dm', 'maskTexture'],
  ['Dm0', 'maskTexture0'],
  ['Dm1', 'maskTexture1'],
] as const

/**
 * Every UTF container that carries a material library. Libraries live in `.mat` and are embedded
 * directly in models; `.txm`, `.ale`, `.utf` and `.vms` carry none at all.
 */
const extensions = ['mat', '3db', 'cmp', 'dfm', 'sph']

const assets = () => load(...extensions)

interface Entry {
  /** `<asset path> :: <entry name>`, for assertion messages. */
  where: string
  path: string
  entry: Directory
  material: Material
}

/**
 * Decoding the whole corpus is the expensive part of this suite, so it happens once and every case
 * shares the result. No case depends on another having run first.
 */
let decoded: Entry[] | undefined

const entries = () =>
  (decoded ??= assets().flatMap(({ path, root }) => {
    const library = root.getDirectory('Material library')
    if (!library) return []

    return library.directories.map((entry) => ({
      where: `${path} :: ${entry.name}`,
      path,
      entry,
      material: readMaterial(entry),
    }))
  }))

const libraries = () =>
  assets().flatMap(({ path, root }) => {
    const library = root.getDirectory('Material library')
    return library ? [{ path, library }] : []
  })

const named = (list: { where: string }[]) => list.map(({ where }) => where).sort()

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

const identical = (a: File, b: File) => {
  if (a.byteLength !== b.byteLength) return false

  const x = bytes(a)
  const y = bytes(b)

  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  return true
}

/** Property files by name, so two directories can be compared without regard to order. */
const files = (directory: Directory) => new Map(directory.files.map((file) => [file.name, file]))

/** Whether two material directories hold the same property files with the same bytes. */
const equivalent = (source: Directory, written: Directory) => {
  const a = files(source)
  const b = files(written)

  if (a.size !== b.size) return false

  for (const [name, file] of b) {
    const other = a.get(name)
    if (!other || !identical(file, other)) return false
  }

  return true
}

const sortedByName = (directory: Directory) => {
  const names = directory.files.map(({ name }) => name)
  const order = [...names].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
  )

  return names.join() === order.join()
}

describe('material corpus', { skip }, () => {
  it('finds a material library to read', () => {
    ok(entries().length > 0)
    ok(libraries().length > 0)
  })

  it('reads every material in the corpus', () => {
    deepStrictEqual(named(entries().filter(({ material }) => !material.name || !material.type)), [])
  })

  /**
   * The closed property set. Every file under every retail material is one of these 25 names, so
   * nothing a material carries goes unread — a new name appearing here means the reader is
   * dropping something.
   */
  it('has no property file the reader does not know', () => {
    const known = new Set([
      'Type',
      'Ac',
      'Dc',
      'Ec',
      'Sc',
      'Sp',
      'Oc',
      'Alpha',
      'Fade',
      'Scale',
      'TileRate',
      'TileRate0',
      'TileRate1',
      'flip u',
      'flip v',
      ...['Dt', 'Et', 'Bt', 'Nt', 'Dm', 'Dm0', 'Dm1'].flatMap((slot) => [
        `${slot}_name`,
        `${slot}_flags`,
      ]),
    ])

    const unknown = new Set<string>()

    for (const { entry } of entries())
      for (const file of entry.files) if (!known.has(file.name)) unknown.add(file.name)

    deepStrictEqual([...unknown].sort(), [])
  })

  it('holds nothing but property files under a material', () => {
    deepStrictEqual(named(entries().filter(({ entry }) => entry.directories.length > 0)), [])
  })

  /** Writing a material back reproduces every property file it was read from, byte for byte. */
  it('writes every material back with identical property files', () => {
    deepStrictEqual(
      named(entries().filter(({ entry, material }) => !equivalent(entry, writeMaterial(material)))),
      [],
    )
  })

  /** What is written reads back the same and writes again to the same bytes. */
  it('is a fixed point over every material', () => {
    deepStrictEqual(
      named(
        entries().filter(({ material }) => {
          const once = writeMaterial(material)
          const twice = writeMaterial(readMaterial(once))

          return (
            once.files.length !== twice.files.length ||
            once.files.some(
              (file, index) =>
                file.name !== twice.files[index]!.name || !identical(file, twice.files[index]!),
            )
          )
        }),
      ),
      [],
    )
  })

  /**
   * File order is the one thing not reproduced, and it splits cleanly: a material either matches
   * the authored order the writer emits, or it is stored in case-insensitive name order by a
   * second tool. Nothing lands in between.
   */
  it('either matches the written file order or is stored in name order', () => {
    const authored: Entry[] = []
    const sorted: Entry[] = []
    const neither: Entry[] = []

    for (const entry of entries()) {
      const written = writeMaterial(entry.material)
      const a = entry.entry.files.map(({ name }) => name).join()
      const b = written.files.map(({ name }) => name).join()

      if (a === b) authored.push(entry)
      else if (sortedByName(entry.entry)) sorted.push(entry)
      else neither.push(entry)
    }

    deepStrictEqual(named(neither), [])
    strictEqual(authored.length, 6569)
    strictEqual(sorted.length, 956)
  })

  /** The two orderings are a property of the asset, not of the material. */
  it('never mixes the two file orderings inside one asset', () => {
    const mixed: string[] = []

    for (const { path, library } of libraries()) {
      const orders = new Set(
        library.directories.map((entry) =>
          entry.files.map(({ name }) => name).join() ===
          writeMaterial(readMaterial(entry))
            .files.map(({ name }) => name)
            .join()
            ? 'authored'
            : 'sorted',
        ),
      )

      if (orders.size > 1) mixed.push(path)
    }

    deepStrictEqual(mixed.sort(), [])
  })

  /**
   * `Material count` is derived on write, so it has to be redundant on read. It is, everywhere it
   * exists — `SOLAR/SUNS/sun.sph` is the one library shipped without one.
   */
  it('has a Material count equal to the number of materials', () => {
    const wrong: string[] = []
    const absent: string[] = []

    for (const { path, library } of libraries()) {
      const file = library.getFile('Material count')

      if (!file) absent.push(path)
      else if (BufferView.from(file.data).readInt32() !== library.directories.length)
        wrong.push(path)
    }

    deepStrictEqual(wrong.sort(), [])
    deepStrictEqual(absent.sort(), ['SOLAR/SUNS/sun.sph'])
  })

  it('writes a library back with the same materials in the same order', () => {
    const wrong: string[] = []

    for (const { path, library } of libraries()) {
      const written = writeMaterials(library.directories.map((entry) => readMaterial(entry)))

      if (
        written.directories.length !== library.directories.length ||
        written.directories.some(
          (entry, index) =>
            entry.name !== library.directories[index]!.name ||
            !equivalent(library.directories[index]!, entry),
        )
      )
        wrong.push(path)
    }

    deepStrictEqual(wrong.sort(), [])
  })

  it('reads a library through readMaterials the same way', () => {
    for (const { root } of assets().slice(0, 50)) {
      const library = root.getDirectory('Material library')
      if (!library) continue

      deepStrictEqual(
        [...readMaterials(root)],
        library.directories.map((entry) => readMaterial(entry)),
      )
    }
  })

  it('has no material name repeated inside one library', () => {
    const repeated: string[] = []

    for (const { path, library } of libraries()) {
      const names = library.directories.map(({ name }) => name.toLowerCase())
      if (new Set(names).size !== names.length) repeated.push(path)
    }

    deepStrictEqual(repeated.sort(), [])
  })

  /** Every retail type is one this module names, and every name it claims is retail is used. */
  it('names every material type in the corpus', () => {
    const used = new Set(entries().map(({ material }) => material.type))

    deepStrictEqual([...used].filter((type) => !materialTypes.includes(type as never)).sort(), [])
    deepStrictEqual(
      materialTypes.filter((type) => !used.has(type)),
      [],
    )
  })

  /** Texture slots are all-or-nothing: no material stores a name without flags, or the reverse. */
  it('has no half-populated texture slot', () => {
    const orphans: string[] = []

    for (const { where, entry } of entries())
      for (const [slot] of slots)
        if (!!entry.getFile(`${slot}_name`) !== !!entry.getFile(`${slot}_flags`))
          orphans.push(`${where} ${slot}`)

    deepStrictEqual(orphans.sort(), [])
  })

  /**
   * The observed flag words. Bit 6 is set on all of them, and bit 4 only ever on a `Bt` or `Et`
   * slot; neither mirror bit is ever used. See {@link TextureFlags}.
   */
  it('uses only six distinct texture flag words', () => {
    const words = new Map<number, number>()
    const mirrored: string[] = []
    const unmarked: string[] = []
    const secondSet = new Set<string>()

    for (const { where, material } of entries())
      for (const [slot, key] of slots) {
        const reference = material[key]
        if (!reference) continue

        const { flags } = reference

        words.set(flags, (words.get(flags) ?? 0) + 1)
        if (flags & (TextureFlags.MirrorU | TextureFlags.MirrorV)) mirrored.push(`${where} ${slot}`)
        if (!(flags & TextureFlags.Unknown1)) unmarked.push(`${where} ${slot}`)
        if (flags & TextureFlags.Unknown0) secondSet.add(slot)
      }

    deepStrictEqual(mirrored.sort(), [])
    deepStrictEqual(unmarked.sort(), [])
    deepStrictEqual([...secondSet].sort(), ['Bt', 'Et'])
    deepStrictEqual(
      [...words].sort((a, b) => b[1] - a[1]),
      [
        [0x40, 7297],
        [0x50, 468],
        [0x4a, 338],
        [0x5a, 53],
        [0x48, 39],
        [0x42, 13],
      ],
    )
  })

  /**
   * The default `Nt_name` compiled into `flmaterials.dll` resolves to exactly one texture, and no
   * material names it — the default is the only way a nomad hull reaches it.
   */
  it('resolves the default nomad texture to exactly one library entry', () => {
    const id = getResourceId(defaultNomadTextureName)
    const found: string[] = []

    for (const { path, root } of load(...extensions, 'txm'))
      for (const texture of readTextures(root))
        if (getResourceId(texture.name) === id)
          found.push(`${path} :: ${texture.name} ${texture.type}`)

    deepStrictEqual(found, ['SHIPS/NOMAD/nomad_fx.txm :: NomadRGB1_NomadAlpha1 rgba32_8888'])
  })

  it('has no material naming the default nomad texture', () => {
    const id = getResourceId(defaultNomadTextureName)

    deepStrictEqual(
      named(
        entries().filter(({ material }) =>
          slots.some(([, key]) => {
            const reference = material[key]
            return reference && getResourceId(reference.name) === id
          }),
        ),
      ),
      [],
    )
  })

  /** Properties the module models that retail never authored. */
  it('carries no specular or nomad property anywhere', () => {
    deepStrictEqual(
      named(
        entries().filter(
          ({ material }) =>
            material.specular !== undefined ||
            material.power !== undefined ||
            material.nomadTexture !== undefined,
        ),
      ),
      [],
    )
  })
})
