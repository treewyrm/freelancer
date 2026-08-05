import type { Document, Section } from '#/ini/types.js'
import { filterSections } from '#/ini/section.js'
import { getResourceId } from '#/hash.js'
import { list, rest, text } from '#/schema/field.js'
import type { VisEffect } from './types.js'

/**
 * `[VisEffect]` — where an INI reference becomes an Alchemy effect.
 *
 * An `.ale` holds several effects and a `[VisEffect]` picks one of them, by a CRC of the effect's
 * name rather than by the name itself. Which CRC is the whole content of this module, because
 * picking wrong yields a number rather than an error:
 *
 * > **`effect_crc` is `getResourceId(name, true)` — the case-SENSITIVE hash.**
 *
 * Measured across every `[VisEffect]` in retail: **the case-sensitive hash resolves 1,210 of the
 * 1,218; the folded hash resolves 1,150 — a strict subset. It loses 60 and gains none.**
 *
 * That is what makes the wrong choice hard to notice. The folded hash works for 94% of the corpus,
 * because most effect names are already lowercase and the two hashes agree there. It fails only on
 * the 60 names carrying a capital — `gf_TLR_exit`, `GravityWell1020`, `Intro_planetchunk_sun` — and
 * it fails by resolving to nothing rather than to an error.
 *
 * This is the INI side of the rule [ALCHEMY.md](../../docs/ALCHEMY.md) already states for the
 * inside of an `.ale`, where node instances reference their nodes case-sensitively too. Alchemy is
 * consistent with itself; it is the rest of the library that folds.
 *
 * The eight that resolve through neither are dead references, not a reader fault:
 * `gf_{br,ku,li,rh}_shield0{2,3}` each name a `…shield01.ale` that defines only `…shield01`. They
 * are the same kind of thing as the 20 material references that live outside the asset tree.
 */

const KNOWN = ['nickname', 'alchemy', 'effect_crc', 'textures']

/**
 * Reads one `[VisEffect]` section.
 * @throws RangeError when a required property is missing, naming which.
 */
export const readVisEffect = (section: Section): VisEffect => {
  const nickname = text(section, 'nickname')
  const alchemy = text(section, 'alchemy')
  const crc = text(section, 'effect_crc')

  if (nickname === undefined) throw new RangeError('[VisEffect] has no nickname')
  if (alchemy === undefined) throw new RangeError(`[VisEffect] '${nickname}' has no alchemy path`)
  if (crc === undefined) throw new RangeError(`[VisEffect] '${nickname}' has no effect_crc`)

  const textures = list(section, 'textures')

  return {
    nickname,
    alchemy,

    // Signed 32-bit, as the file writes it and as getResourceId returns it.
    effect_crc: Number.parseInt(crc, 10) | 0,

    ...(textures && { textures }),
    ...rest(section, KNOWN),
  }
}

/** Every `[VisEffect]` in a document, in file order. */
export function* readVisEffects(document: Document): Generator<VisEffect> {
  for (const section of filterSections(document, 'VisEffect')) yield readVisEffect(section)
}

/**
 * Finds the effect a `[VisEffect]` points at, inside the effect library of its `.ale`.
 *
 * Takes anything with a `name`, rather than importing the Alchemy types, so this module stays a
 * consumer of a shape instead of a dependent of a format. Pass
 * `readAlchemy(directory).effects.effects` straight in.
 *
 * @param effects Effects from the `.ale` the `alchemy` property named.
 * @param crc The `effect_crc`, or a whole {@link VisEffect}.
 * @returns The matching effect, or `undefined` when the `.ale` does not define it.
 */
export const findEffect = <T extends { name: string }>(
  effects: Iterable<T>,
  crc: number | VisEffect,
): T | undefined => {
  const id = typeof crc === 'number' ? crc : crc.effect_crc

  for (const effect of effects) if (getResourceId(effect.name, true) === id) return effect

  return undefined
}
