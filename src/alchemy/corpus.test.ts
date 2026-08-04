import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { list, load, skip, type TreeAsset as Asset } from '#/corpus.js'
import { getResourceId } from '#/hash.js'
import BufferView from '#/utility/bufferview.js'
import { DefaultId, readEffectLibrary, writeEffectLibrary, type NodeInstance } from './effect.js'
import { colorAt, curveAt, floatAt, transformAt } from './evaluation.js'
import { getNodeName, readNodeLibrary, writeNodeLibrary, type Node } from './node.js'
import { EaseType } from './animation.js'
import { PropertyType } from './property.js'

const assets = () => load('ale')

const bytes = ({ buffer, byteOffset, byteLength }: ArrayBufferView) =>
  new Uint8Array(buffer, byteOffset, byteLength)

const same = (a: Uint8Array, b: Uint8Array) =>
  a.byteLength === b.byteLength && a.every((value, index) => value === b[index])

/** Every `.ale` holds exactly these two files, each in a directory of the same name. */
const nodeFile = ({ root }: Asset) =>
  root.getDirectory('AlchemyNodeLibrary')?.getFile('AlchemyNodeLibrary')

const effectFile = ({ root }: Asset) => root.getDirectory('ALEffectLib')?.getFile('ALEffectLib')

const nodes = (asset: Asset) => readNodeLibrary(BufferView.from(nodeFile(asset)!))

const effects = (asset: Asset) => readEffectLibrary(BufferView.from(effectFile(asset)!))

function* walk(instances: NodeInstance[]): Generator<NodeInstance> {
  for (const instance of instances) {
    yield instance
    yield* walk(instance.children)
  }
}

/** Only Freelancer's own two node types carry properties absent from the Alchemy name list. */
const unresolvedProperties = new Map([
  ['0x1C65B7B9', { type: PropertyType.Boolean, owner: 'FLBeamAppearance' }],
  ['0x03503B61', { type: PropertyType.Boolean, owner: 'FLBeamAppearance' }],
  ['0x0ABE0402', { type: PropertyType.Boolean, owner: 'FLBeamAppearance' }],
  ['0x0BA0B3BB', { type: PropertyType.Transform, owner: 'FLBeamAppearance' }],
  ['0xE63AA248', { type: PropertyType.AnimatedCurve, owner: 'FLDustField' }],
])

describe('retail asset corpus', { skip }, () => {
  it('finds assets to read, each holding both libraries and nothing else', () => {
    const found = assets()

    strictEqual(found.length, list('ale').length)
    ok(found.length > 500, `expected the full effect corpus, found ${found.length}`)

    for (const asset of found) {
      deepStrictEqual(
        asset.root.children.map(({ name }) => name).sort(),
        ['ALEffectLib', 'AlchemyNodeLibrary'],
        asset.path,
      )
      ok(nodeFile(asset) && effectFile(asset), asset.path)
    }
  })

  describe('AlchemyNodeLibrary', () => {
    // One FxConeEmitter in gf_explosion_br_large01.ale carries a Node_Name of '', hashing to
    // zero. No instance anywhere references it, so it is authoring debris rather than a form
    // the reader has to resolve — but it does mean a name cannot be assumed non-empty.
    it('reads every node, all of them named, uniquely within their library', () => {
      let count = 0
      let blank = 0

      for (const asset of assets()) {
        const seen = new Set<string>()

        for (const node of nodes(asset).nodes) {
          const name = getNodeName(node)

          notStrictEqual(name, undefined, `${asset.path}: ${node.type} has no Node_Name`)
          if (name === '') blank++
          else {
            ok(!seen.has(name!), `${asset.path}: duplicate node name ${name}`)
            seen.add(name!)
          }
          count++
        }
      }

      strictEqual(count, 5575)
      strictEqual(blank, 1)
    })

    it('is always version 1.1', () => {
      for (const asset of assets())
        strictEqual(Math.fround(nodes(asset).version), Math.fround(1.1), asset.path)
    })

    it('only uses node types the reader knows about', () => {
      const seen = new Set<string>()

      for (const asset of assets()) for (const { type } of nodes(asset).nodes) seen.add(type)

      deepStrictEqual([...seen].sort(), [
        'FLBeamAppearance',
        'FLBeamField',
        'FLDustAppearance',
        'FLDustField',
        'FxAirField',
        'FxBasicAppearance',
        'FxCollideField',
        'FxConeEmitter',
        'FxCubeEmitter',
        'FxGravityField',
        'FxMeshAppearance',
        'FxParticleAppearance',
        'FxPerpAppearance',
        'FxRadialField',
        'FxRectAppearance',
        'FxSphereEmitter',
        'FxTurbulenceField',
      ])
    })

    // Retail encodes the empty string two ways: a prefix of 1 followed by a NUL and its
    // padding byte, and a bare zero prefix carrying no payload at all. Both decode to '' and
    // the game reads either. The writer emits the four-byte form, which is what all but two
    // files use, so those two come back two bytes longer. Nothing else about them changes.
    it('re-serialises every library byte for byte, bar two empty-string encodings', () => {
      const short: string[] = []

      for (const asset of assets()) {
        const original = bytes(nodeFile(asset)!)
        const written = bytes(writeNodeLibrary(nodes(asset)))

        if (same(written, original)) continue

        strictEqual(written.byteLength, original.byteLength + 2, asset.path)
        short.push(asset.path)
      }

      deepStrictEqual(short, ['FX/WEAPONS/flashgrenade.ale', 'FX/MISC/rtc_vanceimpact.ale'])
    })

    // Three things in this data used to break evaluation, all of them fixed in `evaluation.ts`
    // and covered singly in `evaluation.test.ts`: a curve of one keyframe spans no range and
    // divided by zero (10831 of the 26617 curves and 1155 of the 1289 enabled transforms came
    // back NaN), nine keyframes carry an easing byte outside the enum, and seven eased lists
    // are empty, which threw. Nothing here should now be anything but a finite number.
    it('evaluates every animated property to a finite number', () => {
      let curves = 0
      let transforms = 0

      const finite = (value: number, where: string) => ok(Number.isFinite(value), where)

      for (const asset of assets())
        for (const node of nodes(asset).nodes)
          for (const property of node.properties) {
            const where = `${asset.path}: ${node.type}/${property.name}`

            for (const p of [0, 0.5, 1])
              for (const t of [0, 0.5, 1, 2]) {
                switch (property.type) {
                  case PropertyType.AnimatedFloat:
                    finite(floatAt(property, p, t), where)
                    break

                  case PropertyType.AnimatedColor: {
                    const { x, y, z } = colorAt(property, p, t)
                    for (const value of [x, y, z]) finite(value, where)
                    break
                  }

                  case PropertyType.AnimatedCurve:
                    finite(curveAt(property, p, t), where)
                    if (!p && !t) curves++
                    break

                  case PropertyType.Transform: {
                    const { position, rotation, scale } = transformAt(property, p, t)
                    for (const { x, y, z } of [position, rotation, scale])
                      for (const value of [x, y, z]) finite(value, where)
                    if (!p && !t && property.position) transforms++
                    break
                  }
                }
              }
          }

      strictEqual(curves, 26617)
      strictEqual(transforms, 1289)
    })

    // The easing byte is meant to hold one of six values. Nine keyframes do not, and they fall
    // into two groups that should not be conflated — see [Easing outside the enum] in
    // ALCHEMY.md. Easing only does anything to a list of more than one keyframe, which is the
    // line this test draws: seven strays cannot be observed at all, and two can.
    it('keeps easing within the enum bar nine keyframes in three files', () => {
      const stray: {
        path: string
        node: string | undefined
        property: string
        easing: number
        keyframes: number
      }[] = []

      for (const asset of assets())
        for (const node of nodes(asset).nodes)
          for (const property of node.properties)
            switch (property.type) {
              // Only these two nest an eased list inside each keyframe; a curve nests a
              // looped one, which wraps by flags instead of easing.
              case PropertyType.AnimatedFloat:
              case PropertyType.AnimatedColor:
                for (const { easing, keyframes } of property.keyframes)
                  if (!(easing in EaseType))
                    stray.push({
                      path: asset.path,
                      node: getNodeName(node),
                      property: property.name,
                      easing,
                      keyframes: keyframes.length,
                    })

              // falls through
              case PropertyType.AnimatedCurve:
                ok(property.easing in EaseType, `${asset.path}: outer easing ${property.easing}`)
            }

      // Group one: junk in a slot nothing reads. Every value has its low three bits clear and
      // bit 3 set, every list holds a single keyframe, and all seven are in one unused effect.
      const junk = stray.filter(({ keyframes }) => keyframes === 1)

      deepStrictEqual(
        junk.map(({ path, node, easing }) => [path, node, easing]),
        [
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 120],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 120],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 120],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 8],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 136],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01.app', 8],
          ['FX/WEAPONS/gf_bolt01.ale', 'gf_bolt01_Cone.emt', 248],
        ],
      )

      for (const { easing } of junk)
        strictEqual(easing & 0b1111, 0b1000, `0x${easing.toString(16)}`)

      // Group two: a value one past `Auto`, on a curve that interpolates and is on screen
      // whenever the player is in space. This is the one that may be a type we have not named.
      deepStrictEqual(
        stray.filter(({ keyframes }) => keyframes > 1),
        [
          {
            path: 'FX/SPACE/dust.ale',
            node: 'gf_red_dustapp.app',
            property: 'BasicApp_Alpha',
            easing: 6,
            keyframes: 4,
          },
          {
            path: 'FX/SPACE/motionblur_dust.ale',
            node: 'motionblur_dust.app',
            property: 'BasicApp_Alpha',
            easing: 6,
            keyframes: 4,
          },
        ],
      )
    })

    // Easing 6 and `FLDustAppearance` imply one another across the whole corpus: the node type
    // has exactly two instances and both use it, and no other node type uses it anywhere. Every
    // other dust in the game — icedust, leedsdust, snowdust and the rest — builds the same
    // effect out of `FxBasicAppearance` with easing 4 over an identically configured emitter.
    // So the value is not one author's stray keystroke; it tracks Freelancer's own node type.
    it('confines easing 6 to the two FLDustAppearance nodes', () => {
      const dust: { path: string; easing: number[] }[] = []

      for (const asset of assets())
        for (const node of nodes(asset).nodes) {
          if (node.type !== 'FLDustAppearance') continue

          const alpha = node.properties.find(({ name }) => name === 'BasicApp_Alpha')
          ok(alpha?.type === PropertyType.AnimatedFloat, `${asset.path}: alpha is not animated`)

          dust.push({ path: asset.path, easing: alpha.keyframes.map(({ easing }) => easing) })
        }

      deepStrictEqual(dust, [
        { path: 'FX/SPACE/dust.ale', easing: [6] },
        { path: 'FX/SPACE/motionblur_dust.ale', easing: [6] },
      ])
    })

    // Half of every looped list in the game is empty and most of the rest holds a single
    // keyframe, so the shapes that span no range are the common case rather than the edge one.
    // A looped list carries a fallback for empty; an eased one does not, and evaluates to zero.
    it('spans no range in most of its curves, and none at all in half', () => {
      const lists = { empty: 0, single: 0, sameKey: 0, spanning: 0 }
      const eased: string[] = []

      for (const asset of assets())
        for (const node of nodes(asset).nodes)
          for (const property of node.properties)
            switch (property.type) {
              case PropertyType.AnimatedCurve:
                for (const { keyframes } of property.keyframes) {
                  if (!keyframes.length) lists.empty++
                  else if (keyframes.length === 1) lists.single++
                  else if (keyframes[0]!.key === keyframes.at(-1)!.key) lists.sameKey++
                  else lists.spanning++
                }
                break

              case PropertyType.AnimatedFloat:
              case PropertyType.AnimatedColor:
                for (const { keyframes } of property.keyframes)
                  if (!keyframes.length) eased.push(`${asset.path}/${property.name}`)
                break
            }

      deepStrictEqual(lists, { empty: 14127, single: 11791, sameKey: 40, spanning: 1704 })
      deepStrictEqual(eased, [
        'FX/MISC/rain_rtc.ale/BasicApp_Rotate',
        'FX/MISC/rain_rtc.ale/BasicApp_Rotate',
        'FX/MISC/standardeffects.ale/BasicApp_Rotate',
        'FX/MISC/standardeffects.ale/BasicApp_Alpha',
        'FX/MISC/standardeffects.ale/BasicApp_Size',
        'FX/MISC/standardeffects.ale/BasicApp_Alpha',
        'FX/MISC/standardeffects.ale/BasicApp_Size',
      ])
    })

    it('confines unnamed property hashes to the two Freelancer-specific node types', () => {
      const seen = new Map<string, { type: PropertyType; owner: string }>()

      for (const asset of assets())
        for (const { type: owner, properties } of nodes(asset).nodes)
          for (const { name, type } of properties) {
            if (!name.startsWith('0x')) continue

            const known = unresolvedProperties.get(name)
            ok(known, `${asset.path}: new unnamed property ${name} on ${owner}`)
            strictEqual(type, known.type, `${name} on ${owner}`)
            strictEqual(owner, known.owner, name)
            seen.set(name, { type, owner })
          }

      strictEqual(seen.size, unresolvedProperties.size)
    })
  })

  describe('ALEffectLib', () => {
    it('is version 1 or 1.1, the latter carrying four extra floats per effect', () => {
      let plain = 0
      let extended = 0

      for (const asset of assets()) {
        const { version, effects: list } = effects(asset)

        if (version === 1) {
          plain++
          for (const effect of list)
            deepStrictEqual(
              [effect.unknown1, effect.unknown2, effect.unknown3, effect.unknown4],
              [0, 0, 0, 0],
              asset.path,
            )
        } else {
          strictEqual(Math.fround(version), Math.fround(1.1), asset.path)
          extended++

          // The fourth component is never negative, which is what a radius would do; the
          // first three are unconstrained. Consistent with a bounding sphere, unconfirmed.
          for (const effect of list) ok(effect.unknown4! >= 0, `${asset.path}/${effect.name}`)
        }
      }

      strictEqual(plain, 95)
      strictEqual(extended, 501)
    })

    // The point of the whole module: alchemy is the one place Freelancer hashes with the
    // character case left alone. Folding it, as every other CRC lookup in this library does,
    // strands nearly half the references — most node names are mixed case.
    it('resolves every instance against its own library, case-sensitively', () => {
      let resolved = 0
      let containers = 0
      let foldedAway = 0

      for (const asset of assets()) {
        const library = nodes(asset).nodes
        const sensitive = new Set(library.map((node) => id(node, true)))
        const folded = new Set(library.map((node) => id(node, false)))

        for (const instance of walk(effects(asset).effects.flatMap(({ children }) => children))) {
          if (instance.crc === DefaultId) {
            containers++
            continue
          }

          ok(sensitive.has(instance.crc), `${asset.path}: unresolved 0x${hex(instance.crc)}`)
          resolved++
          if (!folded.has(instance.crc)) foldedAway++
        }
      }

      strictEqual(resolved, 5505)
      strictEqual(containers, 1143)
      strictEqual(foldedAway, 2691)
    })

    // Every effect hangs its instances off one synthetic root whose CRC names no node.
    it('gives all but 70 effects a single DefaultId root container', () => {
      let withContainer = 0
      let without = 0

      for (const asset of assets())
        for (const effect of effects(asset).effects) {
          const containers = [...walk(effect.children)].filter(({ crc }) => crc === DefaultId)

          if (!containers.length) {
            without++
            continue
          }

          strictEqual(containers.length, 1, `${asset.path}/${effect.name}`)
          const [container] = containers

          ok(effect.children.includes(container!), `${asset.path}/${effect.name}: not a root`)
          strictEqual(container!.flags, 1, `${asset.path}/${effect.name}`)
          strictEqual(container!.targets.length, 0, `${asset.path}/${effect.name}`)

          for (const child of container!.children)
            strictEqual(child.flags, 0, `${asset.path}/${effect.name}`)

          withContainer++
        }

      strictEqual(withContainer, 1143)
      strictEqual(without, 70)
    })

    it('is never itself a link target', () => {
      for (const asset of assets())
        for (const instance of walk(effects(asset).effects.flatMap(({ children }) => children)))
          for (const target of instance.targets) notStrictEqual(target.crc, DefaultId, asset.path)
    })

    // Entry identifiers are sparse, unordered handles the authoring tool left behind. Of the
    // 1213 effects, 593 use a set other than 1..n and 603 do not list them in ascending order,
    // so they cannot be derived from the tree — they are preserved verbatim on read and reused
    // on write, which is the only reason any effect round-trips at all.
    it('preserves the sparse entry identifiers rather than renumbering them', () => {
      let unordered = 0
      let notDense = 0

      for (const asset of assets())
        for (const effect of effects(asset).effects) {
          // `sort` restores the on-disk entry order, which the identifiers do not follow.
          const ids = [...walk(effect.children)]
            .sort(({ sort: a }, { sort: b }) => a - b)
            .map(({ id }) => id)

          for (const value of ids) notStrictEqual(value, undefined, `${asset.path}/${effect.name}`)

          if (ids.some((value, index) => value !== index + 1)) unordered++

          const dense = [...ids].sort((a, b) => a! - b!)
          if (dense.some((value, index) => value !== index + 1)) notDense++
        }

      strictEqual(unordered, 603)
      strictEqual(notDense, 593)
    })

    // Retail pair order follows no rule this corpus can recover: sorting by source, by target,
    // by entry order or by traversal order each explains at most 548 of the 727 effects that
    // carry more than one pair, and none of them explains all. The writer emits pairs in
    // traversal order, which reorders them in 146 files. The links themselves are identical,
    // so re-reading gives back the same model and writing again is a fixed point.
    it('re-serialises every library byte for byte, bar pair ordering in 146 files', () => {
      let reordered = 0

      for (const asset of assets()) {
        const original = bytes(effectFile(asset)!)
        const library = effects(asset)
        const written = writeEffectLibrary(library)

        if (same(bytes(written), original)) continue

        strictEqual(bytes(written).byteLength, original.byteLength, `${asset.path}: size changed`)
        reordered++
      }

      strictEqual(reordered, 146)
    })

    it('reaches a fixed point after one write, model and bytes alike', () => {
      for (const asset of assets()) {
        const library = effects(asset)
        const written = writeEffectLibrary(library)
        const reread = readEffectLibrary(BufferView.from(written))

        deepStrictEqual(reread, library, asset.path)
        ok(same(bytes(writeEffectLibrary(reread)), bytes(written)), `${asset.path}: unstable`)
      }
    })
  })
})

const id = (node: Node, caseSensitive: boolean) =>
  getResourceId(getNodeName(node) ?? '', caseSensitive)

const hex = (value: number) => (value >>> 0).toString(16)
