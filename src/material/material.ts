import Directory from '#/directory.js'
import File from '#/file.js'
import Vector3 from '#/math/vector3.js'
import BufferView from '#/utility/bufferview.js'
import { TextureFlags, type Material, type TextureReference } from './types.js'

/** Reads a `float[3]` property, or undefined when the file is absent. */
function readColor(parent: Directory, name: string): Vector3 | undefined {
  const file = parent.getFile(name)
  return file && Vector3.read(BufferView.from(file))
}

/** Reads a `float` property, or undefined when the file is absent. */
function readScalar(parent: Directory, name: string): number | undefined {
  const [value] = parent.getFile(name)?.readFloats() ?? []
  return value
}

/** Reads a `uint32` property as a flag, or undefined when the file is absent. */
function readFlag(parent: Directory, name: string): boolean | undefined {
  const [value] = parent.getFile(name)?.readIntegers() ?? []
  return value === undefined ? undefined : value !== 0
}

/**
 * Reads a texture slot from its `<slot>_name` and `<slot>_flags` pair.
 *
 * The name carries the slot: a slot with flags and no name is nothing to bind, so it is dropped.
 * Retail has no half-populated slot in either direction, across all 8208 of them.
 */
function readTextureReference(parent: Directory, slot: string): TextureReference | undefined {
  const [name] = parent.getFile(`${slot}_name`)?.readStrings() ?? []
  if (!name) return

  const [flags = TextureFlags.None] = parent.getFile(`${slot}_flags`)?.readIntegers() ?? []
  return { name, flags }
}

/**
 * Reads one material from its directory.
 *
 * A property file that is not there leaves its key off the record rather than setting it to
 * undefined, so the keys a material carries are exactly the files it was stored with.
 */
export function readMaterial(parent: Directory): Material {
  const [type = ''] = parent.getFile('Type')?.readStrings() ?? []

  const material: Material = { name: parent.name, type }

  const set = <K extends keyof Material>(key: K, value: Material[K] | undefined) => {
    if (value !== undefined) material[key] = value
  }

  set('ambient', readColor(parent, 'Ac'))
  set('diffuse', readColor(parent, 'Dc'))
  set('diffuseTexture', readTextureReference(parent, 'Dt'))
  set('detailTexture', readTextureReference(parent, 'Bt'))
  set('nomadTexture', readTextureReference(parent, 'Nt'))
  set('emission', readColor(parent, 'Ec'))
  set('emissionTexture', readTextureReference(parent, 'Et'))
  set('specular', readColor(parent, 'Sc'))
  set('power', readScalar(parent, 'Sp'))
  set('opacity', readScalar(parent, 'Oc'))
  set('maskTexture', readTextureReference(parent, 'Dm'))
  set('maskTexture0', readTextureReference(parent, 'Dm0'))
  set('maskTexture1', readTextureReference(parent, 'Dm1'))
  set('tileRate', readScalar(parent, 'TileRate'))
  set('tileRate0', readScalar(parent, 'TileRate0'))
  set('tileRate1', readScalar(parent, 'TileRate1'))
  set('alpha', readScalar(parent, 'Alpha'))
  set('fade', readScalar(parent, 'Fade'))
  set('scale', readScalar(parent, 'Scale'))
  set('flipU', readFlag(parent, 'flip u'))
  set('flipV', readFlag(parent, 'flip v'))

  return material
}

/**
 * Writes one material as a directory of property files.
 *
 * Files are emitted in the order retail authored them — `Type` first, then each texture slot's
 * name beside its flags — which reproduces 6569 of the 7525 materials exactly. The other 956 are
 * stored in case-insensitive name order instead (`Ac Alpha Dc Dt_flags Dt_name Fade Scale Type`
 * and its like) and come back reordered.
 *
 * That split is a second authoring tool, not a meaningful distinction: it falls along asset
 * boundaries, 100 files sorted against 1329 authored, with no file mixing the two. Nothing reads a
 * material positionally — entries are found by name hash — and every property file is written back
 * byte for byte either way.
 */
export function writeMaterial(material: Material): Directory {
  const {
    name,
    type,
    ambient,
    diffuse,
    emission,
    specular,
    power,
    opacity,
    diffuseTexture,
    emissionTexture,
    detailTexture,
    nomadTexture,
    maskTexture,
    maskTexture0,
    maskTexture1,
    tileRate,
    tileRate0,
    tileRate1,
    alpha,
    fade,
    scale,
    flipU,
    flipV,
  } = material

  const files: File[] = [new File('Type').writeStrings(type)]

  const color = (name: string, value: Vector3 | undefined) => {
    if (value) files.push(new File(name, Vector3.write(value)))
  }

  const scalar = (name: string, value: number | undefined) => {
    if (value !== undefined) files.push(new File(name).writeFloats(value))
  }

  const flag = (name: string, value: boolean | undefined) => {
    if (value !== undefined) files.push(new File(name).writeIntegers(value ? 1 : 0))
  }

  const texture = (slot: string, value: TextureReference | undefined) => {
    if (!value) return

    files.push(
      new File(`${slot}_name`).writeStrings(value.name),
      new File(`${slot}_flags`).writeIntegers(value.flags),
    )
  }

  color('Ac', ambient)
  color('Dc', diffuse)
  texture('Dt', diffuseTexture)
  texture('Bt', detailTexture)
  texture('Nt', nomadTexture)
  color('Ec', emission)
  texture('Et', emissionTexture)
  color('Sc', specular)
  scalar('Sp', power)
  scalar('Oc', opacity)
  texture('Dm', maskTexture)
  texture('Dm0', maskTexture0)
  texture('Dm1', maskTexture1)
  scalar('TileRate', tileRate)
  scalar('TileRate0', tileRate0)
  scalar('TileRate1', tileRate1)
  scalar('Alpha', alpha)
  scalar('Fade', fade)
  scalar('Scale', scale)
  flag('flip u', flipU)
  flag('flip v', flipV)

  return new Directory(name, files)
}
