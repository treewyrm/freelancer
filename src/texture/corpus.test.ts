import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '../corpus.js'
import type Directory from '../utf/directory.js'
import type File from '../utf/file.js'
import { getResourceId } from '../hash.js'
import type { AnimatedTexture } from './animation.js'
import { readTextures } from './library.js'
import { readTexture, writeTexture } from './library.js'
import type { CubeTexture, Texture, TextureEntry } from './types.js'

/**
 * Every UTF container that carries a texture library. Libraries live in `.txm` and `.mat` files
 * and are embedded directly in models; `.ale`, `.utf` and `.vms` carry none at all.
 */
const extensions = ['txm', 'mat', '3db', 'cmp', 'dfm', 'sph']

const assets = () => load(...extensions)

function* walk(directory: Directory): Generator<Directory> {
  yield directory
  for (const child of directory.directories) yield* walk(child)
}

const libraryId = getResourceId('Texture library')

/** Every texture library in the corpus, including the ones nested inside an openFLAME tree. */
function* libraries(): Generator<{ path: string; library: Directory }> {
  for (const { path, root } of assets())
    for (const directory of walk(root))
      if (getResourceId(directory.name) === libraryId) yield { path, library: directory }
}

interface Entry {
  /** `<asset path> :: <entry name>`, for assertion messages. */
  where: string
  path: string
  entry: Directory
  texture: TextureEntry | undefined
}

/**
 * Decoding the whole corpus is the expensive part of this suite, so it happens once and every
 * case shares the result. No case depends on another having run first.
 */
let decoded: Entry[] | undefined

const entries = () =>
  (decoded ??= [...libraries()].flatMap(({ path, library }) =>
    library.directories.map((entry) => ({
      where: `${path} :: ${entry.name}`,
      path,
      entry,
      texture: readTexture(entry),
    })),
  ))

/**
 * Every flat texture: neither an animation, which carries no pixels, nor a cubemap, which has
 * six mip chains where these have one.
 */
const images = () =>
  entries().filter((entry): entry is Entry & { texture: Texture } => {
    const { texture } = entry
    return texture !== undefined && texture.type !== 'animated' && texture.storage !== 'cube'
  })

const cubemaps = () =>
  entries().filter(
    (entry): entry is Entry & { texture: CubeTexture } =>
      entry.texture !== undefined &&
      entry.texture.type !== 'animated' &&
      entry.texture.storage === 'cube',
  )

const named = (list: { where: string }[]) => list.map(({ where }) => where).sort()

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

/**
 * Whether every file the writer produced matches the source entry byte for byte. Extra files in
 * the source are not compared — the four entries carrying a dead Targa chain beside their `MIPS`
 * lose it, which `writeTexture drops...` covers on its own.
 */
const same = (source: Directory, written: Directory) => {
  for (const file of written.files) {
    const other = source.getFile(file.name)

    if (!other || other.byteLength !== file.byteLength) return false

    const x = bytes(file)
    const y = bytes(other)

    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  }

  return true
}

/**
 * Why a Targa chain cannot be written back verbatim. Colour maps and 16-bit pixels decode to
 * plain RGB and the palette is not carried, so re-encoding is a lossy operation the writer does
 * not attempt; attribute bits in the image descriptor are not modelled either.
 */
const lossy = (entry: Directory) => {
  const reasons = new Set<string>()

  for (let level = 0; ; level++) {
    const file = entry.getFile(`MIP${level}`)
    if (!file) break

    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)

    if (view.getUint8(2) === 1) reasons.add('colour map')
    if (view.getUint8(16) === 16) reasons.add('16-bit')
    if (view.getUint8(17) & ~0x20) reasons.add('attribute bits')
  }

  return reasons
}

/** Raw DirectDrawSurface header fields, read independently of the module under test. */
const header = (file: File) => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const u32 = (offset: number) => view.getUint32(offset, true)
  const pixelFlags = u32(80)

  return {
    view,
    payload: file.byteLength - 128,
    width: u32(16),
    height: u32(12),
    // DDSD_MIPMAPCOUNT; absent means a single level.
    levels: u32(8) & 0x20000 ? u32(28) : 1,
    compressed: (pixelFlags & 4) !== 0,
    fourCC: u32(84),
    bitCount: u32(88),
    alphaPixels: (pixelFlags & 1) !== 0,
    mask: [u32(92), u32(96), u32(100), u32(104)] as const,
    caps2: u32(112),
  }
}

const DXT1 = 0x31545844

/** Dimensions of the smallest level a DDS actually stores, following its own mip count. */
const smallest = ({ width, height, levels }: ReturnType<typeof header>) => {
  let w = width
  let h = height

  for (let i = 1; i < levels; i++) {
    w >>= 1
    h >>= 1
  }

  return Math.min(w, h)
}

/**
 * Whether any block in a DXT1 image selects index 3 while in 3-colour mode — the only thing that
 * makes a DXT1 texture genuinely transparent. A block with `color0 === color1` also enters
 * 3-colour mode, so testing the endpoints alone over-reports.
 */
const hasPunchThrough = (file: File) => {
  const { view, width, height, levels } = header(file)

  for (let i = 0, w = width, h = height, offset = 128; i < levels; i++, w >>= 1, h >>= 1) {
    const blocks = Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2)

    for (let block = 0; block < blocks; block++, offset += 8) {
      if (view.getUint16(offset, true) > view.getUint16(offset + 2, true)) continue

      for (let row = 0; row < 4; row++) {
        const indices = view.getUint8(offset + 4 + row)

        for (let pixel = 0; pixel < 4; pixel++)
          if (((indices >> (pixel * 2)) & 3) === 3) return true
      }
    }
  }

  return false
}

describe('retail asset corpus', { skip }, () => {
  it('finds every texture library in the data', () => {
    const found = [...libraries()]

    strictEqual(found.length, 1417, 'expected the full library corpus')
    strictEqual(entries().length, 6869, 'expected the full texture corpus')
  })

  describe('the library directory', () => {
    // Retail spells it three ways — 'Texture library', 'texture library' and 'Texture
    // Library' — so lookups must go through the resource id, never a string compare.
    it('is not spelled consistently, and is only findable case-insensitively', () => {
      const spellings = new Set([...libraries()].map(({ library }) => library.name))

      ok(spellings.size > 1, `expected mixed case, found ${[...spellings]}`)
      for (const spelling of spellings) strictEqual(getResourceId(spelling), libraryId)
    })

    // 1413 sit at the file root; the remaining four are nested inside an `openFLAME 3D N-mesh`
    // tree, which is why `readTextures` — which only looks at the root — cannot see them.
    it('sits at the file root except inside the openFLAME leftovers', () => {
      const nested = [...libraries()].filter(
        ({ path }) =>
          !assets()
            .find((asset) => asset.path === path)!
            .root.children.some((child) => getResourceId(child.name) === libraryId),
      )

      strictEqual(nested.length, 4)
      for (const { path } of nested) ok(/hardware/i.test(path), `unexpected nesting in ${path}`)
    })

    it('holds nothing but entry directories', () => {
      for (const { path, library } of libraries())
        strictEqual(library.files.length, 0, `${path}: loose file in the library`)
    })

    // Entries are resolved by CRC, so a collision inside one library would make a texture
    // unreachable. Retail has none.
    it('never collides two entry names within one library', () => {
      for (const { path, library } of libraries()) {
        const ids = new Set(library.children.map(({ name }) => getResourceId(name)))

        strictEqual(ids.size, library.children.length, `${path}: colliding entry names`)
      }
    })

    it('yields every root-level texture through readTextures without throwing', () => {
      let count = 0

      for (const { root } of assets()) count += [...readTextures(root)].length

      strictEqual(count, 6861)
    })
  })

  describe('every entry', () => {
    it('reads without throwing', () => {
      // entries() has already decoded the corpus; reaching here at all means nothing threw.
      ok(entries().length > 6000)
    })

    it('decodes into the eight pixel formats retail actually authored', () => {
      const kinds = new Map<string, number>()

      for (const { texture } of entries())
        if (texture) kinds.set(texture.type, (kinds.get(texture.type) ?? 0) + 1)

      deepStrictEqual(Object.fromEntries([...kinds].sort()), {
        animated: 12,
        dxt1: 4230,
        dxt3: 129,
        dxt5: 42,
        rgb16_565: 20,
        rgb24_888: 1789,
        rgba16_5551: 24,
        // 613 flat textures, plus the two cubemaps.
        rgba32_8888: 615,
      })
    })

    it('never produces an empty mip level', () => {
      for (const { where, texture } of images()) {
        ok(texture.levels.length > 0, `${where}: no levels`)
        for (const [index, level] of texture.levels.entries())
          ok(level.byteLength > 0, `${where}: level ${index} is empty`)
      }
    })
  })

  describe('DirectDrawSurface textures', () => {
    const surfaces = () =>
      images()
        .map((entry) => ({ ...entry, file: entry.entry.getFile('MIPS') }))
        .filter((entry): entry is typeof entry & { file: File } => entry.file !== undefined)

    it('backs most of the corpus, and four entries carry a Targa chain alongside it', () => {
      strictEqual(surfaces().length, 4447)

      // readTexture prefers MIPS, so for these four the MIP0.. chain is never decoded.
      const both = surfaces().filter(({ entry }) => entry.getFile('MIP0'))
      strictEqual(both.length, 4)
    })

    it('accounts for every payload byte across the mip chain', () => {
      for (const { where, texture, file } of surfaces()) {
        const total = texture.levels.reduce((sum, level) => sum + level.byteLength, 0)

        strictEqual(total, header(file).payload, `${where}: mip chain does not fill the file`)
      }
    })

    it('is stored top row first', () => {
      for (const { where, texture } of surfaces()) ok(texture.flip, where)
    })

    /**
     * The reason `readDirectDrawSurface` rounds block counts up rather than using `w >> 2`:
     * nothing in retail reaches a sub-4x4 block-compressed level, so the truncating form looked
     * correct against this corpus alone. Uncompressed chains do run to 1x1.
     */
    it('stops block-compressed chains at 4x4, while uncompressed chains reach 1x1', () => {
      const compressed = surfaces().filter(({ file }) => header(file).compressed)
      const raw = surfaces().filter(({ file }) => !header(file).compressed)

      // No block-compressed level anywhere in the game is smaller than one whole 4x4 block.
      for (const { where, file } of compressed) ok(smallest(header(file)) >= 4, where)

      // Every one that actually carries a chain lands on 4x4 exactly. The sole exception has no
      // chain to descend: FX/plasmaring.txm is a single 128x128 level.
      const chained = compressed.filter(({ file }) => header(file).levels > 1)

      strictEqual(compressed.length - chained.length, 1)
      for (const { where, file } of chained) strictEqual(smallest(header(file)), 4, where)

      strictEqual(Math.min(...raw.map(({ file }) => smallest(header(file)))), 1)
    })

    it('uses only three uncompressed pixel formats', () => {
      const formats = new Set(
        surfaces()
          .filter(({ file }) => !header(file).compressed)
          .map(({ file }) => {
            const { bitCount, mask } = header(file)
            return `${bitCount}:${mask.map((value) => value.toString(16)).join(',')}`
          }),
      )

      deepStrictEqual([...formats].sort(), [
        '16:7c00,3e0,1f,8000',
        '16:f800,7e0,1f,0',
        '24:ff0000,ff00,ff,0',
      ])
    })
  })

  /**
   * Pins the reason {@link import('./types.js').TextureType} has no `dxt1a` member: the container
   * cannot distinguish it, and almost nothing in retail is transparent anyway.
   */
  describe('DXT1 punch-through transparency', () => {
    const dxt1 = () =>
      images()
        .map((entry) => ({ ...entry, file: entry.entry.getFile('MIPS') }))
        .filter(
          (entry): entry is typeof entry & { file: File } =>
            entry.file !== undefined && header(entry.file).fourCC === DXT1,
        )

    it('is never signalled by DDPF_ALPHAPIXELS, so the header cannot be used to detect it', () => {
      strictEqual(dxt1().length, 4230)

      for (const { where, file } of dxt1()) ok(!header(file).alphaPixels, `${where}: flagged`)
    })

    it('occurs in exactly ten textures, all of which decode as plain dxt1', () => {
      const transparent = dxt1().filter(({ file }) => hasPunchThrough(file))

      deepStrictEqual(named(transparent), [
        'BASES/LIBERTY/li_resort_deck.cmp :: tree_64.tga021121174811tree_64.tga',
        'BASES/LIBERTY/li_resort_waterscape.cmp :: tree_64.tga021121174646tree_64.tga',
        'SHIPS/BRETONIA/br_capships.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga',
        'SHIPS/UTILITY/utility_liner.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga',
        'SOLAR/ast_loot.mat :: loot_artifact.tgaloot_artifact_alpha.tga',
        'SOLAR/solar_mat_dockable02.mat :: small_station_lod_a.tga',
        'SOLAR/solar_mat_dockable02.mat :: small_station_lod_b.tga',
        'SOLAR/solar_mat_space_dmg.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga',
        'SOLAR/solar_mat_tink.mat :: x_pnl_a.tga',
        'SOLAR/solar_mat_tlr.mat :: x_pnl_a.tga',
      ])

      for (const { where, texture } of transparent) strictEqual(texture.type, 'dxt1', where)
    })
  })

  describe('Targa textures', () => {
    const chains = () => images().filter(({ entry }) => entry.getFile('MIPS') === undefined)

    it('backs the rest of the corpus', () => {
      strictEqual(chains().length, 2400)
    })

    // The 16-bit palette branch in readUncompressedColorMap is unreachable against retail.
    it('only ever uses 256-colour BGR-888 palettes with 8-bit indices', () => {
      let levels = 0

      for (const { where, entry } of chains())
        for (let level = 0; ; level++) {
          const file = entry.getFile(`MIP${level}`)
          if (!file) break

          const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
          if (view.getUint8(2) !== 1) continue

          levels++
          strictEqual(view.getUint8(16), 8, `${where}: index depth`)
          strictEqual(view.getUint8(7), 24, `${where}: palette depth`)
          strictEqual(view.getUint16(5, true), 256, `${where}: palette size`)
        }

      strictEqual(levels, 11351)
    })

    /**
     * Nine textures set bit 5 of the image descriptor, putting their origin at the top left.
     * The reader reports that through `flip` rather than reordering rows, so a consumer that
     * discovers Freelancer ignores the bit can ignore the field without a decode change.
     */
    it('reports the vertical origin per image instead of assuming bottom-left', () => {
      deepStrictEqual(named(chains().filter(({ texture }) => texture.flip)), [
        'FX/animated.txm :: lightningaxm_0_0',
        'FX/animated.txm :: sparks1anim_0_0',
        'FX/kioncannon.txm :: kionflare_0',
        'FX/lightning2.txm :: lightning256_0',
        'FX/missleeffect.txm :: impact_0',
        'FX/standardeffects.txm :: XP_HERM_0',
        'INTERFACE/HUD/hud.txm :: backdrop',
        'INTERFACE/HUD/hud.txm :: static',
        'SOLAR/BLACKHOLE/blackhole.txm :: bhflash_0',
      ])
    })

    // readMIP throws if the levels disagree, which is only safe because retail never mixes them.
    it('keeps the origin and bit depth identical across every level of a chain', () => {
      for (const { where, entry } of chains()) {
        const origins = new Set<boolean>()
        const depths = new Set<number>()

        for (let level = 0; ; level++) {
          const file = entry.getFile(`MIP${level}`)
          if (!file) break

          const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
          origins.add((view.getUint8(17) & 0x20) !== 0)
          depths.add(view.getUint8(2) === 1 ? view.getUint8(7) : view.getUint8(16))
        }

        strictEqual(origins.size, 1, `${where}: mixed vertical origin`)
        strictEqual(depths.size, 1, `${where}: mixed bit depth`)
      }
    })
  })

  describe('animated textures', () => {
    const animations = () =>
      entries().filter(
        (entry): entry is Entry & { texture: AnimatedTexture } =>
          entry.texture?.type === 'animated',
      )

    it('finds all twelve, each with its frame rects fully consumed', () => {
      strictEqual(animations().length, 12)

      for (const { where, entry, texture } of animations())
        strictEqual(entry.getFile('Frame rects')?.byteLength, texture.frames.length * 20, where)
    })

    /**
     * `Texture count` is not carried on {@link AnimatedTexture} but derived on write: it is
     * always one more than the highest frame index, and the atlases it counts are sibling
     * entries named `<entry>_<index>`. This is what licenses that derivation.
     */
    it('counts exactly the sibling atlases its frames index into', () => {
      for (const { where, path, entry, texture } of animations()) {
        const file = entry.getFile('Texture count')
        ok(file, `${where}: no Texture count`)

        const count = new DataView(file.buffer, file.byteOffset, file.byteLength).getInt32(0, true)
        const highest = Math.max(...texture.frames.map(({ index }) => index))

        strictEqual(count, highest + 1, `${where}: Texture count disagrees with the frame indices`)

        const library = [...libraries()].find((entry) => entry.path === path)!

        for (let index = 0; index < count; index++)
          ok(
            library.library.getDirectory(`${texture.name}_${index}`),
            `${where}: missing atlas ${texture.name}_${index}`,
          )
      }
    })
  })

  describe('writing back', () => {
    const rewritten = () =>
      entries()
        .filter((entry): entry is Entry & { texture: TextureEntry } => !!entry.texture)
        .map((entry) => ({ ...entry, written: writeTexture(entry.texture) }))

    it('reproduces every DirectDrawSurface byte for byte', () => {
      const surfaces = rewritten().filter(({ entry }) => entry.getFile('MIPS'))

      strictEqual(surfaces.length, 4447)

      // The whole 128-byte header is derived, not carried: retail never varies dwDepth, the
      // reserved dwords, dwCaps2..4, and leaves DDSD_CAPS clear on every single surface.
      for (const { where, entry, written } of surfaces) ok(same(entry, written), where)
    })

    it('reproduces every animated texture, Texture count included', () => {
      const animations = rewritten().filter(({ texture }) => texture.type === 'animated')

      strictEqual(animations.length, 12)

      // Texture count is derived from the highest frame index rather than carried, which is
      // what makes these round-trip at all — nothing on AnimatedTexture holds it.
      for (const { where, entry, written } of animations) {
        ok(written.getFile('Texture count'), `${where}: no Texture count written`)
        ok(same(entry, written), where)
      }
    })

    /**
     * Targa chains only round-trip where retail already stored them the way the writer emits
     * them: uncompressed RGB. Colour-mapped and 16-bit levels decode to RGB and cannot go back
     * without a palette this library does not carry, so their files come back larger.
     */
    it('reproduces the Targa chains that were already uncompressed RGB', () => {
      const chains = rewritten().filter(
        ({ entry, texture }) =>
          texture.type !== 'animated' && texture.storage !== 'cube' && !entry.getFile('MIPS'),
      )

      strictEqual(chains.length, 2400)

      const exact = chains.filter(({ entry, written }) => same(entry, written))

      strictEqual(exact.length, 629)
      for (const { where, entry } of exact) strictEqual(lossy(entry).size, 0, `${where}: lossy`)

      // Every one that does not is accounted for, so nothing differs for an unknown reason.
      const reasons = new Map<string, number>()

      for (const { where, entry } of chains.filter(({ entry, written }) => !same(entry, written))) {
        const reason = [...lossy(entry)].sort().join(' + ')

        ok(reason, `${where}: differs for no recorded reason`)
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
      }

      deepStrictEqual(Object.fromEntries([...reasons].sort()), {
        '16-bit': 102,
        // SOLAR/RINGS/rings.txm :: ringdetail, the one chain declaring its 8 alpha bits.
        'attribute bits': 1,
        'colour map': 1668,
      })
    })

    /** Reading prefers `MIPS`, so the Targa chain beside it was already dead weight. */
    it('drops the dead Targa chain from the four entries that carry both', () => {
      const both = rewritten().filter(({ entry }) => entry.getFile('MIPS') && entry.getFile('MIP0'))

      deepStrictEqual(named(both), [
        'SHIPS/LIBERTY/li_capships.mat :: Damage_128.tga',
        'SHIPS/LIBERTY/li_capships.mat :: debris.TGA',
        'SHIPS/UTILITY/utility_transport.mat :: damage_128.tga',
        'SHIPS/UTILITY/utility_transport.mat :: utility_dmg.tga',
      ])

      for (const { where, written } of both)
        deepStrictEqual(
          written.children.map(({ name }) => name),
          ['MIPS'],
          where,
        )
    })

    /**
     * The invariant that holds where byte-for-byte does not: whatever the writer emits reads
     * back as the same texture and writes again to the same bytes. Without it, the lossy Targa
     * cases could drift on every save.
     */
    it('is a fixed point, so a second pass changes nothing', () => {
      for (const { where, texture, written } of rewritten()) {
        const reread = readTexture(written)

        ok(reread, `${where}: what was written no longer reads`)
        strictEqual(reread.type, texture.type, where)
        strictEqual(reread.name, texture.name, where)

        if (reread.type !== 'animated' && texture.type !== 'animated') {
          strictEqual(reread.storage, texture.storage, where)
          strictEqual(reread.width, texture.width, where)
          strictEqual(reread.height, texture.height, where)
          strictEqual(reread.flip, texture.flip, where)

          // Compared as chains so a cubemap's six are all checked, not just the first.
          const before = texture.storage === 'cube' ? texture.faces : [texture.levels]
          const after = reread.storage === 'cube' ? reread.faces : [reread.levels]

          strictEqual(after.length, before.length, where)

          for (const [face, chain] of after.entries()) {
            strictEqual(chain.length, before[face]!.length, `${where}: face ${face}`)

            for (const [index, level] of chain.entries())
              deepStrictEqual(level, before[face]![index], `${where}: face ${face} level ${index}`)
          }
        }

        ok(same(written, writeTexture(reread)), `${where}: second write differs`)
      }
    })
  })

  describe('cubemaps', () => {
    it('is two entries, and they are the only ones storing a CUBE file', () => {
      deepStrictEqual(named(cubemaps()), [
        'FX/envmapbasic.mat :: envmapbasic',
        'FX/envmapglass.txm :: envmapglass',
      ])

      // Nothing else in the corpus carries the file, so `MIPS` never has to compete with it.
      const files = entries().filter(({ entry }) => entry.getFile('CUBE'))
      strictEqual(files.length, 2)
      for (const { where, entry } of cubemaps()) ok(!entry.getFile('MIPS'), `${where}: also MIPS`)
    })

    it('decodes six single-level 64x64 A8R8G8B8 faces from one surface', () => {
      for (const { where, entry, texture } of cubemaps()) {
        const { width, height, bitCount, compressed, caps2, payload } = header(
          entry.getFile('CUBE')!,
        )

        strictEqual(width, 64, where)
        strictEqual(height, 64, where)
        strictEqual(bitCount, 32, where)
        ok(!compressed, `${where}: unexpected block compression`)
        // DDSCAPS2_CUBEMAP plus all six face bits.
        strictEqual(caps2, 0xfe00, where)
        strictEqual(payload, 6 * 64 * 64 * 4, `${where}: expected six uncompressed faces`)

        strictEqual(texture.type, 'rgba32_8888', where)
        strictEqual(texture.width, 64, where)
        strictEqual(texture.height, 64, where)
        ok(texture.flip, where)

        // The whole payload is accounted for: six faces of one level each, no bytes left over.
        strictEqual(texture.faces.length, 6, where)

        for (const [face, chain] of texture.faces.entries()) {
          strictEqual(chain.length, 1, `${where}: face ${face}`)
          strictEqual(chain[0]!.byteLength, 64 * 64 * 4, `${where}: face ${face}`)
        }
      }
    })

    /**
     * The header a cubemap carries is not the one `writeMIPS` emits — `DDSD_CAPS` is set, the mip
     * count is absent and zero, there is no pitch, and `dwCaps` adds `DDSCAPS_COMPLEX` and
     * `DDSCAPS_ALPHA`. Both files come back byte for byte only because the writer follows them
     * rather than the flat form.
     */
    it('writes back byte for byte', () => {
      for (const { where, entry, texture } of cubemaps()) {
        const written = writeTexture(texture)

        deepStrictEqual(
          written.children.map(({ name }) => name),
          ['CUBE'],
          where,
        )
        ok(same(entry, written), where)
      }
    })

    /** Faces are stored +X, -X, +Y, -Y, +Z, -Z, and nothing else in the file says so. */
    it('keeps the faces distinct and in the order the surface stores them', () => {
      for (const { where, entry, texture } of cubemaps()) {
        const file = entry.getFile('CUBE')!
        const source = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
        const size = 64 * 64 * 4

        for (const [face, chain] of texture.faces.entries())
          deepStrictEqual(
            chain[0]!,
            source.slice(128 + face * size, 128 + (face + 1) * size),
            `${where}: face ${face} decoded from the wrong offset`,
          )
      }
    })
  })

  /**
   * The one form `readTexture` deliberately returns undefined for: the openFLAME paletted
   * textures are out of scope because Freelancer cannot load them either.
   */
  describe('unsupported entries', () => {
    const unsupported = () => entries().filter(({ texture }) => texture === undefined)

    it('degrades to undefined rather than throwing', () => {
      strictEqual(unsupported().length, 8)
    })

    it('is the eight openFLAME paletted textures, which stay out of scope', () => {
      const paletted = unsupported().filter(({ entry }) => entry.getDirectory('Palette 8 bit'))

      strictEqual(paletted.length, 8)
      for (const { where } of paletted) ok(/hardware/i.test(where), `unexpected entry ${where}`)
    })
  })
})
