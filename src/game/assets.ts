import type { Directory } from '#/utf/index.js'
import type { Material } from '#/material/index.js'
import type { TextureEntry } from '#/texture/index.js'
import type { VMeshData } from '#/vmesh/index.js'
import type { Node } from '#/alchemy/index.js'
import { readMaterials } from '#/material/index.js'
import { readTextures } from '#/texture/index.js'
import { readVMeshLibrary } from '#/vmesh/index.js'
import { getNodeName, hasAlchemy, readAlchemy } from '#/alchemy/index.js'
import { getResourceId } from '#/hash.js'

/**
 * The one namespace every UTF reference resolves in.
 *
 * A `.cmp` names its material by a CRC and does **not** name the file that material is in. Neither
 * does a material name the file holding its textures, nor a mesh reference the file holding its
 * mesh. All of it resolves against whatever the game has loaded, by
 * {@link import('#/hash.js').getResourceId} of the name — **one flat, global, case-folded namespace,
 * not a per-file scope.** A viewer that resolves a model's materials against that model's own file
 * gets the right answer for most retail models and the wrong one for the rest, which is why this is
 * a single set of maps and not a per-file structure.
 *
 * **Alchemy is the exception and hashes case-sensitively.** Node names go in under
 * `getResourceId(name, true)`; folding them the way everything else folds strands roughly half the
 * node instance references in retail. That difference is a single boolean at one call site here and
 * is the reason this module exists rather than four `Map`s in a consumer.
 *
 * Loading is on demand, which is what the game does: nothing walks the tree looking for assets, a
 * reference arrives and the file that satisfies it is loaded. What to load, when, and what to evict
 * is the consumer's policy — Invariant 6 — so there is no budget and no eviction here, only
 * {@link Assets.clear}.
 *
 * The maps are public and mutable on purpose. A consumer that already has a `Directory` in hand —
 * an uploaded file, a generated asset — adds it with {@link Assets.add} without going near a
 * filesystem.
 */

/**
 * The ids one file put into the namespace, in the order they were added.
 *
 * {@link Assets.add} reports what it wrote rather than how much, because a consumer that reloads or
 * closes a file has to undo exactly that file's contribution and the namespace is flat: nothing in a
 * `Material` says which file it came from, so after the fact the footprint is unrecoverable. Counts
 * fall out of `length`.
 *
 * Reporting is not eviction. Which definition should surface once an id has been written twice is a
 * consumer's question — the answer needs a definition stack this class deliberately does not keep —
 * so `add` says what happened and stops there. Invariant 6.
 */
export interface Contribution {
  /** `getResourceId` of every mesh name defined. */
  meshes: number[]

  /** `getResourceId` of every material name defined. */
  materials: number[]

  /** `getResourceId` of every texture name defined. */
  textures: number[]

  /** Case-sensitive `getResourceId` of every Alchemy node name defined. */
  nodes: number[]
}

export default class Assets {
  /** Mesh data by `getResourceId` of its name. */
  readonly meshes = new Map<number, VMeshData>()

  /** Materials by `getResourceId` of their name. */
  readonly materials = new Map<number, Material>()

  /** Texture entries by `getResourceId` of their name. */
  readonly textures = new Map<number, TextureEntry>()

  /** Alchemy nodes by **case-sensitive** `getResourceId` of `Node_Name`. */
  readonly nodes = new Map<number, Node>()

  /** Paths already read, so loading the same file twice is free. Real paths, not authored ones. */
  readonly loaded = new Set<string>()

  /**
   * Merges everything a UTF root defines into the namespace.
   *
   * Later definitions win, which is what the game's load order means: a mod's file loaded after
   * retail's replaces the entry rather than being ignored.
   *
   * @param root A UTF file's root directory.
   * @returns The ids the file contributed, of each kind.
   */
  add(root: Directory): Contribution {
    const contribution: Contribution = { meshes: [], materials: [], textures: [], nodes: [] }

    for (const mesh of readVMeshLibrary(root)) {
      const id = getResourceId(mesh.name)
      this.meshes.set(id, mesh)
      contribution.meshes.push(id)
    }

    for (const material of readMaterials(root)) {
      const id = getResourceId(material.name)
      this.materials.set(id, material)
      contribution.materials.push(id)
    }

    // readTextures yields what it could read and throws for the rest at the end, so the successes
    // are kept and the failures are the caller's to see.
    for (const texture of readTextures(root)) {
      const id = getResourceId(texture.name)
      this.textures.set(id, texture)
      contribution.textures.push(id)
    }

    if (hasAlchemy(root))
      for (const node of readAlchemy(root)?.nodes.nodes ?? []) {
        const name = getNodeName(node)
        if (name === undefined) continue

        // Case-SENSITIVE. See the note above; this is the one place in the library that differs.
        const id = getResourceId(name, true)
        this.nodes.set(id, node)
        contribution.nodes.push(id)
      }

    return contribution
  }

  /** Whether a name resolves to a material, whatever file it came from. */
  material(name: string | number): Material | undefined {
    return this.materials.get(getResourceId(name))
  }

  /** Whether a name resolves to a texture entry. */
  texture(name: string | number): TextureEntry | undefined {
    return this.textures.get(getResourceId(name))
  }

  /** Whether a name resolves to mesh data. */
  mesh(name: string | number): VMeshData | undefined {
    return this.meshes.get(getResourceId(name))
  }

  /** Whether a name resolves to an Alchemy node. Hashes case-sensitively, as Alchemy does. */
  node(name: string | number): Node | undefined {
    return this.nodes.get(getResourceId(name, true))
  }

  /** Empties the namespace. Eviction policy beyond this belongs to the consumer. */
  clear(): void {
    this.meshes.clear()
    this.materials.clear()
    this.textures.clear()
    this.nodes.clear()
    this.loaded.clear()
  }
}
