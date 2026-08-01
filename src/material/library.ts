import Directory from '#/directory.js'
import File from '#/file.js'
import { getResource, type Hashable } from '#/hash.js'
import { readMaterial, writeMaterial } from './material.js'
import type { Material } from './types.js'

/**
 * Reads materials from a directory, looking for a `Material library` within.
 *
 * Only the root level is searched, as {@link readTextures} does. Four retail assets hold a second
 * library nested under an `openFLAME 3D N-mesh` tree — Conquest: Frontier Wars leftovers the game
 * itself cannot load — and those stay out of reach here deliberately.
 * @param parent Parent directory (typically root)
 */
export function* readMaterials(parent: Directory): Generator<Material> {
  const library = parent.getDirectory('Material library')
  if (!library) return

  for (const child of library.directories) yield readMaterial(child)
}

/**
 * Writes a `Material library` directory.
 *
 * `Material count` leads the library, where retail put it in 1367 of the 1429 it wrote. It is
 * derived rather than carried: it equals the number of material directories in every one of them,
 * so a field for it on the library would only offer a way to disagree. One asset, `SOLAR/SUNS/
 * sun.sph`, has no count file at all and gains one here.
 */
export function writeMaterials(materials: Iterable<Material>): Directory {
  const children = [...materials].map((material) => writeMaterial(material))

  return new Directory('Material library', [
    new File('Material count').writeIntegers(children.length),
    ...children,
  ])
}

/** Finds a material by name or resource CRC, the way a mesh's material reference does. */
export const getMaterial = (materials: Material[], name: Hashable): Material | undefined =>
  getResource(materials, ({ name }) => name, name)
