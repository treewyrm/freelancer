import type { Document, Section } from '#/ini/types.js'
import { filterSections } from '#/ini/section.js'
import { equals as sameName } from '#/utility/string.js'
import { list, number, rest, text, tuple } from '#/schema/field.js'
import type { Beam, Effect, EffectLOD, EffectType, TextureShapes } from './types.js'

/**
 * The nickname-addressable effect tables, and the two appearance kinds a beam uses.
 *
 * `[Effect]` is the entry point the rest of the data references: a gun's `[Munition]` names an
 * effect nickname, and the effect says which `[VisEffect]`, which sound, which light and which beam
 * appearance make it up. Every one of those is optional — 705 `[Effect]` sections in retail and only
 * `nickname` is on all of them, `effect_type` on 704, `vis_effect` on 660, `lgt_effect` on 25.
 *
 * `[EffectLOD]` identifies itself by **`type`, not `nickname`**, which is why it does not go through
 * the same reader as the rest.
 *
 * The two beam sections are folded into one discriminated type rather than two unrelated ones,
 * because `[BeamBolt]` is `[BeamSpear]` plus a middle section: `core_length`, `sec_core_width`,
 * `sec_core_color` and `sec_outter_color`. Modelling them as siblings on a `kind` tag means reading
 * `sec_core_color` off a spear is a compile error instead of `undefined` at runtime.
 */

const EFFECT = [
  'nickname',
  'effect_type',
  'vis_effect',
  'vis_generic',
  'vis_beam',
  'snd_effect',
  'lgt_effect',
  'lgt_range_scale',
  'lgt_radius',
]

const withNickname = (section: Section, kind: string): string => {
  const nickname = text(section, 'nickname')
  if (nickname === undefined) throw new RangeError(`[${kind}] has no nickname`)
  return nickname
}

/** Reads one `[Effect]`. */
export const readEffect = (section: Section): Effect => {
  const effect: Effect = { nickname: withNickname(section, 'Effect') }

  for (const name of [
    'effect_type',
    'vis_effect',
    'vis_generic',
    'vis_beam',
    'snd_effect',
    'lgt_effect',
  ] as const) {
    const value = text(section, name)
    if (value !== undefined) effect[name] = value
  }

  for (const name of ['lgt_range_scale', 'lgt_radius'] as const) {
    const value = number(section, name)
    if (value !== undefined) effect[name] = value
  }

  return { ...effect, ...rest(section, EFFECT) }
}

/** Every `[Effect]` in a document, in file order. */
export function* readEffects(document: Document): Generator<Effect> {
  for (const section of filterSections(document, 'Effect')) yield readEffect(section)
}

const EFFECT_TYPE = [
  'nickname',
  'priority',
  'generic_priority',
  'lod_type',
  'radius',
  'visibility',
  'update',
  'run_time',
  'pbubble',
]

/** Reads one `[EffectType]`. */
export const readEffectType = (section: Section): EffectType => {
  const type: EffectType = { nickname: withNickname(section, 'EffectType') }

  for (const name of ['lod_type', 'visibility', 'update'] as const) {
    const value = text(section, name)
    if (value !== undefined) type[name] = value
  }

  for (const name of ['priority', 'generic_priority', 'radius', 'run_time'] as const) {
    const value = number(section, name)
    if (value !== undefined) type[name] = value
  }

  const pbubble = tuple(section, 'pbubble', 2)
  if (pbubble) type.pbubble = pbubble

  return { ...type, ...rest(section, EFFECT_TYPE) }
}

/** Every `[EffectType]` in a document, in file order. */
export function* readEffectTypes(document: Document): Generator<EffectType> {
  for (const section of filterSections(document, 'EffectType')) yield readEffectType(section)
}

const EFFECT_LOD = ['type', 'max_lod_screen_size', 'min_lod_screen_size', 'min_screen_size']

/** Reads one `[EffectLOD]`, which identifies itself by `type` rather than `nickname`. */
export const readEffectLOD = (section: Section): EffectLOD => {
  const type = text(section, 'type')
  if (type === undefined) throw new RangeError('[EffectLOD] has no type')

  const lod: EffectLOD = { type }

  for (const name of ['max_lod_screen_size', 'min_lod_screen_size', 'min_screen_size'] as const) {
    const value = number(section, name)
    if (value !== undefined) lod[name] = value
  }

  return { ...lod, ...rest(section, EFFECT_LOD) }
}

/** Every `[EffectLOD]` in a document, in file order. */
export function* readEffectLODs(document: Document): Generator<EffectLOD> {
  for (const section of filterSections(document, 'EffectLOD')) yield readEffectLOD(section)
}

const BEAM = [
  'nickname',
  'tip_length',
  'tail_length',
  'head_width',
  'core_width',
  'tip_color',
  'core_color',
  'outter_color',
  'tail_color',
  'head_brightness',
  'trail_brightness',
  'head_texture',
  'trail_texture',
  'flash_size',
]

const BOLT = [...BEAM, 'core_length', 'sec_core_width', 'sec_core_color', 'sec_outter_color']

/**
 * Reads one `[BeamSpear]` or `[BeamBolt]`.
 * @param section The section.
 * @param kind Which it is, taken from the section name by {@link readBeams}.
 */
export const readBeam = (section: Section, kind: Beam['kind']): Beam => {
  const nickname = withNickname(section, kind === 'bolt' ? 'BeamBolt' : 'BeamSpear')
  const beam = { kind, nickname } as Beam

  for (const name of ['head_texture', 'trail_texture'] as const) {
    const value = text(section, name)
    if (value !== undefined) beam[name] = value
  }

  for (const name of [
    'tip_length',
    'tail_length',
    'head_width',
    'core_width',
    'head_brightness',
    'trail_brightness',
    'flash_size',
  ] as const) {
    const value = number(section, name)
    if (value !== undefined) beam[name] = value
  }

  for (const name of ['tip_color', 'core_color', 'outter_color', 'tail_color'] as const) {
    const value = tuple(section, name, 3)
    if (value) beam[name] = value
  }

  if (beam.kind === 'bolt') {
    for (const name of ['core_length', 'sec_core_width'] as const) {
      const value = number(section, name)
      if (value !== undefined) beam[name] = value
    }

    for (const name of ['sec_core_color', 'sec_outter_color'] as const) {
      const value = tuple(section, name, 3)
      if (value) beam[name] = value
    }
  }

  return { ...beam, ...rest(section, beam.kind === 'bolt' ? BOLT : BEAM) }
}

/**
 * Every `[BeamSpear]` and `[BeamBolt]` in a document, in file order.
 *
 * Both in one pass rather than a generator each, because `beam_effects.ini` interleaves them and
 * the order is the file's.
 */
export function* readBeams(document: Document): Generator<Beam> {
  for (const section of document) {
    if (sameName(section.name, 'BeamSpear')) yield readBeam(section, 'spear')
    else if (sameName(section.name, 'BeamBolt')) yield readBeam(section, 'bolt')
  }
}

/** Reads one `[Texture]` from `effect_shapes.ini`. */
export const readTextureShapes = (section: Section): TextureShapes => {
  const file = text(section, 'file')
  if (file === undefined) throw new RangeError('[Texture] has no file')

  const tex_shape = list(section, 'tex_shape')

  return { file, ...(tex_shape && { tex_shape }), ...rest(section, ['file', 'tex_shape']) }
}

/** Every `[Texture]` in a document, in file order. */
export function* readTextureLibraries(document: Document): Generator<TextureShapes> {
  for (const section of filterSections(document, 'Texture')) yield readTextureShapes(section)
}
