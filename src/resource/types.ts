/**
 * The interim model: a resource DLL as a flat list of entries.
 *
 * Plain data, on the same terms as `ini/types.ts` — no classes, no cursors, no parent links — so a
 * list read from a retail DLL, decoded from strings and infocards, or written by hand is the same
 * thing, and the writer accepts any of them.
 *
 * **The tree is flattened deliberately.** A PE stores resources three levels deep, but the nesting
 * carries no information the leaves do not: a type directory is exactly the set of entries sharing
 * a type. Both orderings the format requires — named entries before numbered, each group sorted —
 * are recoverable from the leaves, and the writer re-derives them, which is what lets it reproduce
 * retail's `.rsrc` byte for byte from a list that was never in any particular order.
 */

/**
 * A resource type or entry identity: a number, or a name.
 *
 * Named entries are rare and never Freelancer's — retail's only one is `PREPSTUBDATA` in
 * `ebueula.dll`, the installer's EULA viewer — but they are part of the format, and a reader that
 * cannot represent one cannot round-trip the file it appears in.
 */
export type ResourceId = number | string

/** One resource: a leaf of the directory tree, with the path that reaches it. */
export interface Resource {
  /**
   * Resource type. `Type.String` and `Type.Html` are the two Freelancer reads; anything else in the
   * image is carried through untouched rather than dropped.
   */
  type: ResourceId

  /**
   * Entry id within the type. For `RT_HTML` this is the infocard's own local number; for
   * `RT_STRING` it is a **block** number covering sixteen strings, not a string id.
   */
  id: ResourceId

  /** Windows LANGID. `LANGUAGE_ENGLISH_US` for all retail content. */
  language: number

  /** Code page recorded on the data entry. `CODE_PAGE_WINDOWS_1252` throughout retail. */
  codePage: number

  /** Payload bytes, verbatim. A subarray of the source image on read, never a copy. */
  data: Uint8Array
}

/** Options shared by the writers that build resources from decoded text. */
export interface ResourceOptions {
  /** LANGID to stamp on what is written. Defaults to `LANGUAGE_ENGLISH_US`. */
  language?: number

  /** Code page to record. Defaults to `CODE_PAGE_WINDOWS_1252`. */
  codePage?: number
}
