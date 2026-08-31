/**
 * THORN's vocabulary, as data.
 *
 * Every number here is **measured from the retail corpus**, by pairing the 355 numeric-form scripts
 * against the 1,151 symbolic ones: `type = 9` in one is `type = SCENE` in the other, in the same
 * structural position. Nothing is inferred from `thorn.dll`'s string table, which establishes that a
 * name exists and nothing about its value — see [THORN.md](../../../docs/THORN.md), where each entry
 * below carries its provenance and the measurement behind it.
 *
 * **Names the binary carries but no script uses are listed without values**, in the `UNUSED_*`
 * exports. They are here so a reader can say "that name is real but its value is unknown" instead of
 * "no such name", and so nobody re-derives the list. Do not give them numbers.
 */

/** Name → value, for a THORN enum. */
export type Enum = Readonly<Record<string, number>>

/**
 * Entity `type`, and the discriminant of the entity union.
 *
 * The ten retail uses, all measured. The string table's order reproduces every one of them when read
 * descending from `UNKNOWN_ENTITY` — an independent check, not the source.
 */
export const ENTITY_TYPES = {
  COMPOUND: 1,
  DEFORMABLE: 2,
  CAMERA: 3,
  MONITOR: 4,
  LIGHT: 5,
  SOUND: 6,
  MARKER: 7,
  SCENE: 9,
  MOTION_PATH: 11,
  PSYS: 13,
} as const

/** An entity `type` name, and the discriminant of {@link Entity}. */
export type EntityTypeName = keyof typeof ENTITY_TYPES

/**
 * Entity-type names `thorn.dll` carries that no retail script uses.
 *
 * Their slots in the string table are 0, 8, 10 and 12, and the ten measured values leave no freedom
 * about that — but the block is the engine's C++ enum-name table rather than a dump of the globals
 * THORN registers, and `HARDPOINT` proves the difference: it sits at 8 there and is measured at **1**
 * as a `target_type`. So the interpolation is not carried into the tables above, and a script naming
 * one of these is rejected rather than guessed at.
 */
export const UNUSED_ENTITY_TYPES = ['UNKNOWN_ENTITY', 'HARDPOINT', 'SUB_SCENE', 'DELETED'] as const

/**
 * Event `action`, and the discriminant of the event union. The fifteen retail uses, all measured.
 *
 * **The string table is not in enum order for this block**, unlike the entity one: it would put
 * `SET_CAMERA` at 9 and `CONNECT_HARDPOINTS` at 10, where the corpus measures 2 and 9. Only 13
 * through 18 happen to agree. That is why the five free slots below stay empty.
 */
export const EVENT_TYPES = {
  SET_CAMERA: 2,
  START_SOUND: 3,
  START_LIGHT_PROP_ANIM: 4,
  START_CAMERA_PROP_ANIM: 5,
  START_PATH_ANIMATION: 6,
  START_SPATIAL_PROP_ANIM: 7,
  ATTACH_ENTITY: 8,
  CONNECT_HARDPOINTS: 9,
  START_MOTION: 10,
  START_IK: 11,
  START_PSYS: 13,
  START_PSYS_PROP_ANIM: 14,
  START_AUDIO_PROP_ANIM: 15,
  START_FOG_PROP_ANIM: 16,
  START_FLR_HEIGHT_ANIM: 18,
} as const

/** An event `action` name, and the discriminant of {@link Event}. */
export type EventTypeName = keyof typeof EVENT_TYPES

/** Event names in `thorn.dll` with no measured value. The free slots are 0, 1, 12, 17 and 19. */
export const UNUSED_EVENT_TYPES = [
  'UNDEFINED_EVENT',
  'START_SUB_SCENE',
  'USER_EVENT',
  'START_REVERB_PROP_ANIM',
  'SUBTITLE',
] as const

/**
 * The event vocabulary THORN accepted before the current one, kept in the binary and used by nothing.
 * Listed so a script carrying one is recognisable as old rather than as a typo.
 */
export const LEGACY_EVENT_TYPES = [
  'UNDEFINED',
  'SET_MONITOR',
  'CONNECT_ENTITY',
  'START_PATH_MOTION',
  'USER',
  'START_FOG_PROPERTY_ANIM',
  'START_AUDIO_PROPERTY_ANIM',
  'START_PSYS_PROPERTY_ANIM',
  'START_SPATIAL_PROPERTY_ANIM',
  'START_CAMERA_PROPERTY_ANIM',
  'START_LIGHT_PROPERTY_ANIM',
] as const

export const AXES = {
  X_AXIS: 0,
  Y_AXIS: 1,
  Z_AXIS: 2,
  NEG_X_AXIS: 3,
  NEG_Y_AXIS: 4,
  NEG_Z_AXIS: 5,
} as const

/** An axis name, as `up`, `front` and the axis half of an `axisrot` take it. */
export type AxisName = keyof typeof AXES

/**
 * What an event's `target_part` names.
 *
 * Settled by what sits beside it rather than by frequency: numeric `1` carries an `Hp…` name, numeric
 * `2` carries a part name, numeric `0` carries `""`.
 */
export const TARGET_TYPES = { ROOT: 0, HARDPOINT: 1, PART: 2 } as const

/** What an event's `target_part` names — see {@link TARGET_TYPES}. */
export type TargetTypeName = keyof typeof TARGET_TYPES

/** `lightprops.type`. Measured 1/2/3, which is `D3DLIGHTTYPE` — THORN passes it straight through. */
export const LIGHT_TYPES = { L_POINT: 1, L_SPOT: 2, L_DIRECT: 3 } as const

/** A `lightprops.type` name. */
export type LightTypeName = keyof typeof LIGHT_TYPES

/** `fogprops.fogmode`. Measured 0/1/2/3, which is `D3DFOGMODE`, likewise passed through. */
export const FOG_MODES = { F_NONE: 0, F_EXP: 1, F_EXP2: 2, F_LINEAR: 3 } as const

/** A `fogprops.fogmode` name. */
export type FogModeName = keyof typeof FOG_MODES

/**
 * The booleans.
 *
 * Lua 3.2 has no boolean type, so THORN registers two one-character globals. Measured `Y` = 1 and
 * `N` = 0 from `on`, with `fogon` and `fogtable` agreeing. They are identifiers, and writing `true`
 * or `false` in their place names a global THORN does not define.
 */
export const TRUTH = { N: 0, Y: 1 } as const

/** `Y` or `N` — the identifiers THORN uses where a boolean would go. Never quoted, never `true`. */
export type TruthName = keyof typeof TRUTH

/**
 * Entity `flags`, for everything that renders.
 *
 * **Bit 2 is `LIT_AMBIENT` here and `SPATIAL` on a sound** — THORN's flag globals are not one
 * namespace, and the two never appear on the same entity type in 41,250 entities, which is what makes
 * the ambiguity decidable. Use {@link entityFlagsOf} rather than picking a table by hand.
 */
export const RENDER_FLAGS = { REFERENCE: 1, LIT_AMBIENT: 2, LIT_DYNAMIC: 4, HIDDEN: 16 } as const

/** Entity `flags` on a `SOUND`, where bit 2 is `SPATIAL`. */
export const SOUND_ENTITY_FLAGS = { REFERENCE: 1, SPATIAL: 2, HIDDEN: 16 } as const

/** The flag table an entity of this type uses. The one place a decode depends on the entity type. */
export const entityFlagsOf = (type: EntityTypeName): Enum =>
  type === 'SOUND' ? SOUND_ENTITY_FLAGS : RENDER_FLAGS

/**
 * `flags` on an `ATTACH_ENTITY` or a `START_PATH_ANIMATION`.
 *
 * `PARENT_CHILD` = 64 is the weakest value in this file and worth knowing as such: it rests on one
 * attach that appears as numeric `70` in one script and as `POSITION+ORIENTATION+PARENT_CHILD` in
 * another with the same targets, `target_part` and `offset`, corroborated by the frequencies. It also
 * contradicts the order `thorn.dll`'s flag printer emits. The corpus wins because it measures a
 * value where the printer only suggests an order.
 */
export const ATTACH_FLAGS = {
  POSITION: 2,
  ORIENTATION: 4,
  LOOK_AT: 8,
  ENTITY_RELATIVE: 32,
  PARENT_CHILD: 64,
  ORIENTATION_RELATIVE: 128,
} as const

/** `flags` on a `START_SOUND`. Bit 8, which is `LOOK_AT` in the attach namespace. */
export const SOUND_FLAGS = { LOOP: 8 } as const

/**
 * Flag names in `thorn.dll` with no measured bit.
 *
 * Bit 16 is unclaimed in the attach namespace and `PATH_POSITION` and `USE_SCRIPT_DURATION` are the
 * two names left in it. That is suggestive and it is not evidence, so neither is given a value.
 */
export const UNUSED_FLAGS = [
  'STREAM',
  'FOG_PROPS_REMOVED',
  'PATH_POSITION',
  'USE_SCRIPT_DURATION',
] as const

/**
 * Parameter-curve components `thorn.dll` registers, for a `param_curve`'s `CLSID`.
 *
 * Retail uses two of them — `FreeFormPCurve` × 4,802 and `CatmullRomPCurve` × 43. The rest are named
 * by the binary and by nothing else, so the reader accepts any string here rather than an enum.
 */
export const CURVE_TYPES = [
  'FreeFormPCurve',
  'CatmullRomPCurve',
  'BumpInPCurve',
  'BumpOutPCurve',
  'RampDownPCurve',
  'RampUpPCurve',
  'StepPCurve',
  'SmoothPCurve',
  'ThornLPCurve',
  'LinearPCurve',
  'ThornParamCurve',
] as const

/**
 * `pathprops.path_type`, which decides how `path_data` reads.
 *
 * `CV_CROrientationSplinePath` in 936 of the 939 uses; `CV_CRSplinePath` is in the binary and in no
 * script. The other 3 say the string `NULL` — a `MOTION_PATH` the exporter wrote with no path on it
 * — and carry no `path_data` at all.
 */
export const PATH_TYPES = ['CV_CROrientationSplinePath', 'CV_CRSplinePath'] as const

/** A spline class name. It decides how `path_data` reads, which is why {@link PathProps} is a union. */
export type PathTypeName = (typeof PATH_TYPES)[number]

/**
 * The first token of `path_data`: whether the Catmull-Rom spline runs end to end or closes into a
 * loop. Both are in `thorn.dll`; all 936 retail paths are `OPEN`.
 */
export const PATH_FLAGS = ['OPEN', 'CLOSED'] as const

/** Whether a path's spline runs end to end or closes into a loop. */
export type PathFlagName = (typeof PATH_FLAGS)[number]

/**
 * `userprops` keys, which are **not THORN's**.
 *
 * None of these is in `thorn.dll`; the ones marked below are in `common.dll` and `Freelancer.exe`.
 * So `userprops` is Freelancer's extension point on top of a THORN script, and the block is carried
 * as a string map rather than typed — a consumer that is not Freelancer has no business interpreting
 * it. Two keys are in **no** binary in any casing and do nothing at all: `Priority` (set 3,426 times)
 * and `No_Fog` (22, a misspelling of the `nofog` the game does read).
 */
export const USER_PROPS = {
  read: [
    'category',
    'actor',
    'speaker',
    'nofog',
    'running_lights',
    'main_object',
    'loadout',
    'TextStart',
    'TextString',
  ],
  inert: ['Priority', 'No_Fog'],
} as const

/** `userprops.category`, which chooses the catalogue `template_name` is resolved against. */
export const CATEGORIES = [
  'Audio',
  'Character',
  'Prop',
  'Equipment',
  'Spaceship',
  'Asteroid',
  'Room',
  'Equipment Cart',
  'Solar',
] as const

/** Reverses a table, for decoding a numeric-form script. */
export const namesOf = (table: Enum): ReadonlyMap<number, string> =>
  new Map(Object.entries(table).map(([name, value]) => [value, name]))
