import Directory from '#/utf/directory.js'
import type File from '#/utf/file.js'
import BufferView from '#/utility/bufferview.js'
import { readHardpoints, writeHardpoints, type Hardpoint } from '#/compound/hardpoint.js'

/**
 * Procedural sphere model, used by `.sph` planet and star files.
 *
 * The file carries no geometry at all: the game tessellates a sphere at load time and skins it
 * with one material per cube face. `M0`..`M3` are the four equatorial faces, `M4` and `M5` the
 * polar caps, and `M6`, when present, a larger transparent shell drawn around the body for the
 * atmosphere.
 */
export interface Sphere {
  type: 'sphere'

  /**
   * Hardpoints mounted on the sphere, from a `Hardpoints` directory beside the `Sphere` one.
   *
   * **No retail `.sph` carries any — 0 of 86, and 85 of the 86 have a bare `Sphere`-only root** — so
   * this is not read off the corpus. A sphere placed in a system is an object like any other, and
   * its loadout addresses hardpoints by name the same way a `.3db`'s does; that is an observation in
   * the running game, and it is what this field rests on. Read and written exactly as {@link Rigid}
   * does, from and to the part directory rather than the `Sphere` one.
   */
  hardpoints: Hardpoint[]

  /** Material name per side, in `M0`..`M6` order. */
  sides: string[]

  /** Sphere radius. */
  radius: number
}

/** Six cube faces plus the optional atmosphere shell. */
const maximumSides = 7

/** Whether a part fragment is a procedural sphere rather than geometry. */
export const isSphere = (directory: Directory) => !!directory.getDirectory('Sphere')

/**
 * Material names are NUL-terminated, except in `sun.sph`, whose `M0` is exactly the four bytes
 * `none` with no room for a terminator. The terminator is therefore treated as optional.
 */
function readName(file: File): string {
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
  const end = bytes.indexOf(0)

  return BufferView.from(file).getString(0, end < 0 ? bytes.length : end)
}

/**
 * Reads a sphere part fragment: the radius, one material name per side with `Sides` saying how
 * many, and the hardpoints mounted beside it.
 * @param parent The part directory holding `Sphere`, not the `Sphere` directory itself
 * @throws Error when the directory, `Sides`, `Radius` or any named side file is absent.
 * @throws RangeError when the side count is outside 1..7.
 */
export function readSphere(parent: Directory): Sphere {
  const directory = parent.getDirectory('Sphere')
  if (!directory) throw new Error('Missing Sphere')

  const [count] = directory.getFile('Sides')?.readIntegers() ?? []
  if (count === undefined) throw new Error('Missing Sides in Sphere')
  if (count < 1 || count > maximumSides) throw new RangeError(`Invalid sphere side count: ${count}`)

  const [radius] = directory.getFile('Radius')?.readFloats() ?? []
  if (radius === undefined) throw new Error('Missing Radius in Sphere')

  const sides: string[] = []

  for (let i = 0; i < count; i++) {
    const file = directory.getFile(`M${i}`)
    if (!file) throw new Error(`Missing M${i} in Sphere`)

    sides.push(readName(file))
  }

  return { type: 'sphere', hardpoints: [...readHardpoints(parent)], sides, radius }
}

/**
 * Writes a sphere part into an unnamed directory, for the caller to name — the same shape
 * `writeRigid` returns, and for the same reason: a part is the `Sphere` directory *plus* the
 * hardpoints beside it, and a writer that emitted only the first while the reader returned both
 * would drop them silently.
 *
 * `Sides` is derived from the list rather than carried, so it cannot disagree with the `M<n>` files
 * beside it. Absent stays absent: no empty `Hardpoints` directory for a sphere carrying none, which
 * is what keeps all 86 retail spheres re-serialising as they were.
 * @throws RangeError when the side count is outside 1..7.
 */
export function writeSphere({ hardpoints, sides, radius }: Sphere): Directory {
  if (sides.length < 1 || sides.length > maximumSides)
    throw new RangeError(`Invalid sphere side count: ${sides.length}`)

  const sphere = new Directory('Sphere')

  for (const [index, name] of sides.entries()) sphere.setFile(`M${index}`).writeStrings(name)

  sphere.setFile('Radius').writeFloats(radius)
  sphere.setFile('Sides').writeIntegers(sides.length)

  const directory = new Directory(undefined, [sphere])

  if (hardpoints.length) directory.children.push(writeHardpoints(hardpoints))

  return directory
}
