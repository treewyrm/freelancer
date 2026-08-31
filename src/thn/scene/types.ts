/**
 * The typed layer: a scene script as entities and events rather than as tables.
 *
 * Where [`../types.ts`](../types.ts) models *Lua*, this models *THORN*. The difference that matters
 * is that this layer **folds the two export forms together**: the interim layer keeps `type = SCENE`
 * and `type = 9` apart because they are different bytecode, and here they are both `'SCENE'`, which
 * is only possible because the enums in [`data.ts`](data.ts) are measured rather than assumed. See
 * [THORN.md](../../../docs/THORN.md).
 *
 * Consequences worth knowing before using it:
 *
 * - **Every property is independently optional.** The entity type does not predict which keys are
 *   present — the same position as `Material` in the UTF material library and `[Object]` in INI — and a property that
 *   was absent stays absent on the way out rather than being written with a default. A default
 *   emitted is a claim about the engine that the file did not make.
 * - **Unrecognised keys are kept, not dropped**, in `unknown`. A modded script survives a
 *   read-modify-write; retail exercises this exactly once, on `template_id`.
 * - **This layer is a fixed point, not byte-exact.** `typed → interim → typed` is identity;
 *   `interim → typed → interim` normalises the numeric form to the symbolic one and reformats number
 *   literals, because a number here is a `number` and not the text it was written as.
 */

import type { Value } from '#/thn/types.js'
import type {
  AxisName,
  EntityTypeName,
  EventTypeName,
  FogModeName,
  LightTypeName,
  PathFlagName,
  PathTypeName,
  TargetTypeName,
  TruthName,
} from './data.js'

export type {
  AxisName,
  EntityTypeName,
  EventTypeName,
  FogModeName,
  LightTypeName,
  PathFlagName,
  PathTypeName,
  TargetTypeName,
  TruthName,
}

/** A whole script: what the three globals mean. */
export interface Script {
  /** Seconds. Every retail script sets it. */
  duration: number
  entities: Entity[]
  events: Event[]
}

/** Three numbers as a Lua array. A position, a colour or an axis, depending on the key. */
export type Vector3 = readonly [number, number, number]

/** A rotation matrix, as three rows. */
export type Matrix3 = readonly [Vector3, Vector3, Vector3]

/** Four numbers as a Lua array. The animation form of an orientation; `orient` places instead. */
export type Quaternion = readonly [number, number, number, number]

/** Degrees about an axis. The animation form, and never on an entity. */
export type AxisRotation = readonly [number, AxisName]

/** Keys the vocabulary does not name, kept verbatim so a read-modify-write does not delete them. */
export type Unknown = Record<string, Value>

/**
 * `userprops` — **read by Freelancer, not by THORN**.
 *
 * A string map rather than a typed record, because none of its keys is in `thorn.dll`: the block is
 * the game's extension point on top of a scene script, and interpreting it is the game's business.
 * Every retail value is a string, including the ones that look like numbers (`TextString`) and the
 * ones that look like booleans (`nofog = "Y"`, `running_lights = "true"`).
 */
export type UserProps = Record<string, string>

/** Position and orientation. `orient` places, `q_orient` and `axisrot` animate. */
export interface SpatialProps {
  pos?: Vector3
  orient?: Matrix3
  q_orient?: Quaternion
  axisrot?: AxisRotation
}

/** `cameraprops` on a `CAMERA` entity. */
export interface CameraProps {
  fovh?: number
  hvaspect?: number
  nearplane?: number
  farplane?: number
}

/**
 * `cameraprops` on a `START_CAMERA_PROP_ANIM` — **a different block with different key names**.
 *
 * Only `fovh` is shared. The animation form says `aspect`, `near` and `far` where the entity says
 * `hvaspect`, `nearplane` and `farplane`, and both spellings are in `thorn.dll`, so this is the
 * engine's inconsistency rather than an authoring one.
 */
export interface CameraAnimProps {
  fovh?: number
  aspect?: number
  near?: number
  far?: number
}

/** `lightprops` on a `LIGHT` entity, and on a `START_LIGHT_PROP_ANIM` — the same keys either way. */
export interface LightProps {
  on?: TruthName
  color?: Vector3
  diffuse?: Vector3
  specular?: Vector3
  ambient?: Vector3
  direction?: Vector3
  range?: number
  cutoff?: number
  type?: LightTypeName
  theta?: number
  atten?: Vector3
}

/** `audioprops` on a `SOUND` entity, and on a `START_AUDIO_PROP_ANIM`. Attenuation and 3D falloff. */
export interface AudioProps {
  attenuation?: number
  pan?: number
  dmin?: number
  dmax?: number
  ain?: number
  aout?: number
  atout?: number
  rmix?: number
}

/**
 * `psysprops` on a `PSYS` entity, and on a `START_PSYS_PROP_ANIM`. One key: `sparam`, the external
 * control value an Alchemy effect blends its animation states with.
 */
export interface PsysProps {
  sparam?: number
}

/** One keyframe of an oriented path: where the object is, and which way it faces. */
export interface OrientedPoint {
  position: Vector3
  orientation: Quaternion
}

/**
 * A path an object is moved along, sampled at keyframes and interpolated as a Catmull-Rom spline.
 *
 * `path_data` is a *string* in the file — `thorn.dll` writes it with `path_data = "%s"` — holding
 * the `flag` token and then the keyframes, each one formatted `{%f,%f,%f}, ` and, for an oriented
 * path, followed by `{%f,%f,%f,%f}, `. It is parsed here rather than carried verbatim, because its
 * shape is not free-form: `path_type` decides it, which is the one thing in this layer a property
 * does decide about another, and why `pathprops` is a union where every other block is a bag of
 * independently optional keys.
 */
export type PathProps = OrientationSplinePath | SplinePath | NullPath

/** Position and orientation per keyframe. Every retail path that has one is this. */
export interface OrientationSplinePath {
  path_type: 'CV_CROrientationSplinePath'
  flag: PathFlagName
  points: readonly OrientedPoint[]
}

/** Position only. Named by `thorn.dll`, used by no retail script. */
export interface SplinePath {
  path_type: 'CV_CRSplinePath'
  flag: PathFlagName
  points: readonly Vector3[]
}

/**
 * A `MOTION_PATH` with no path on it: `path_type = "NULL"` and no `path_data`.
 *
 * Three retail entities, and `NULL` is not a spline class — the exporter writes the literal string
 * where the class name would go. An arm rather than an optional `path_data`, so a consumer that
 * reads `points` has to acknowledge the case where there are none.
 */
export interface NullPath {
  path_type: 'NULL'
}

/** `compoundprops` on a `DEFORMABLE` entity. One key, animated by `START_FLR_HEIGHT_ANIM`. */
export interface CompoundProps {
  floor_height?: number
}

/**
 * Fog.
 *
 * A `fogprops` block on a `START_FOG_PROP_ANIM`, and **the same keys written inline** on a `SCENE`
 * entity — seven retail entities do that. Grouped here either way, and splatted back out flat when a
 * scene entity is written.
 */
export interface FogProps {
  fogon?: TruthName
  fogmode?: FogModeName
  fogcolor?: Vector3
  fogstart?: number
  fogend?: number
  fogdensity?: number
  fogtable?: TruthName
}

/** A parameter curve. Every retail `points` row is exactly four numbers, over 13,297 rows. */
export interface ParamCurve {
  CLSID?: string
  points?: readonly (readonly [number, number, number, number])[]
}

/** What every entity carries, whatever its type. */
export interface EntityCommon {
  entity_name: string
  template_name?: string
  lt_grp?: number
  srt_grp?: number
  usr_flg?: number

  /** Exporter residue: always `0`, and in none of the game's binaries. Nothing reads it. */
  template_id?: number

  userprops?: UserProps
  unknown?: Unknown
}

/** An entity that renders, and therefore has a place to be. */
export interface Placed extends EntityCommon {
  flags?: string[]
  spatialprops?: SpatialProps
}

/** The scene descriptor. One per script — except in `SCRIPTS/BASES/st_03b_cityscape_hardpoint_01.thn`. */
export interface Scene extends Placed {
  type: 'SCENE'
  up?: AxisName
  front?: AxisName
  ambient?: Vector3

  /** Written flat on the entity, not as a block. See {@link FogProps}. */
  fog?: FogProps
}

/** The render target. The one entity type with no `spatialprops`: it is not in the scene. */
export interface Monitor extends EntityCommon {
  type: 'MONITOR'
  flags?: string[]
}

/** A viewpoint. Made current by a `SET_CAMERA` event, and animated by `START_CAMERA_PROP_ANIM`. */
export interface Camera extends Placed {
  type: 'CAMERA'
  cameraprops?: CameraProps
}

/** A light source. `lightprops.type` says which of the three kinds it is. */
export interface Light extends Placed {
  type: 'LIGHT'
  lightprops?: LightProps
}

/** A rigid model. Carries no block of its own — everything about it is spatial. */
export interface Compound extends Placed {
  type: 'COMPOUND'
}

/** A `.dfm` character. `START_MOTION` animates it; `compoundprops` is what it adds over a compound. */
export interface Deformable extends Placed {
  type: 'DEFORMABLE'
  compoundprops?: CompoundProps
}

/** An Alchemy particle effect. Started by `START_PSYS`. */
export interface Psys extends Placed {
  type: 'PSYS'
  psysprops?: PsysProps
}

/** A sound emitter, positioned in the scene. Started by `START_SOUND`. */
export interface Sound extends Placed {
  type: 'SOUND'
  audioprops?: AudioProps
}

/** A placeholder with no visual. Also what the game attaches the player's ship and characters to. */
export interface Marker extends Placed {
  type: 'MARKER'
}

/** A path other entities are moved along by `START_PATH_ANIMATION`. */
export interface MotionPath extends Placed {
  type: 'MOTION_PATH'
  pathprops?: PathProps
}

/**
 * One entity.
 *
 * Ten arms, which is every type retail uses. `thorn.dll` names four more — `UNKNOWN_ENTITY`,
 * `HARDPOINT`, `SUB_SCENE`, `DELETED` — and none of them has a measured value or a known shape, so
 * reading one is an error rather than an eleventh arm full of guesses.
 */
export type Entity =
  Scene | Monitor | Camera | Light | Compound | Deformable | Psys | Sound | Marker | MotionPath

/** What every event carries. */
export interface EventCommon {
  /** Seconds from the start of the script. */
  time: number

  /**
   * Entity names the action applies to, in order.
   *
   * Not a tuple, because the arity varies within a single action — a `START_LIGHT_PROP_ANIM` takes
   * one target 796 times and two 204 times.
   */
  targets: string[]

  duration?: number
  param_curve?: ParamCurve

  /** Milliseconds, unlike `duration`. Negative means "match the event duration". */
  pcurve_period?: number

  unknown?: Unknown
}

/** Where the action addresses part of an entity rather than the whole of it. */
export interface Targeted {
  target_type?: TargetTypeName
  target_part?: string
}

/** Where the action orients something. */
export interface Oriented {
  offset?: Vector3
  up?: AxisName
  front?: AxisName
}

/** Makes a camera the one the scene renders through. */
export interface SetCamera extends EventCommon {
  action: 'SET_CAMERA'
}

/** Plays a `SOUND` entity, optionally from part-way in. */
export interface StartSound extends EventCommon {
  action: 'START_SOUND'
  flags?: string[]
  start_time?: number
}

/** Animates a `LIGHT` towards the given properties over the event's duration. */
export interface StartLightPropAnim extends EventCommon {
  action: 'START_LIGHT_PROP_ANIM'
  lightprops?: LightProps
}

/** Animates a `CAMERA`'s frustum. **The key names differ from the entity's** — see {@link CameraAnimProps}. */
export interface StartCameraPropAnim extends EventCommon {
  action: 'START_CAMERA_PROP_ANIM'
  cameraprops?: CameraAnimProps
}

/** Moves an entity along a `MOTION_PATH`, between two points on it given as percentages. */
export interface StartPathAnimation extends EventCommon, Oriented {
  action: 'START_PATH_ANIMATION'
  start_percent?: number
  stop_percent?: number
  flags?: string[]
}

/** Animates an entity's position or orientation. `q_orient` and `axisrot` are the forms that animate. */
export interface StartSpatialPropAnim extends EventCommon, Targeted {
  action: 'START_SPATIAL_PROP_ANIM'
  spatialprops?: SpatialProps
}

/** Parents one entity to another, or to a part of it, for the event's duration. */
export interface AttachEntity extends EventCommon, Targeted, Oriented {
  action: 'ATTACH_ENTITY'
  flags?: string[]
}

/** Joins two entities by name at a hardpoint on each. */
export interface ConnectHardpoints extends EventCommon {
  action: 'CONNECT_HARDPOINTS'
  hardpoint?: string
  parent_hardpoint?: string
}

/** Plays a named animation script on a `DEFORMABLE`, blending it against whatever is already running. */
export interface StartMotion extends EventCommon {
  action: 'START_MOTION'
  animation?: string
  time_scale?: number
  weight?: number
  heading?: number
  trans_time?: number
  trans_scale?: number
  start_time?: number
  locked_bone?: string

  /** A bitfield with bits 1, 2 and 128 in use, and no measured meaning. See THORN.md's TODO. */
  event_flags?: number
}

/** Inverse kinematics — the event the guide leaves blank, and the third most common in retail. */
export interface StartIk extends EventCommon, Targeted, Oriented {
  action: 'START_IK'
  end_effector?: string
  count_to_root?: number
  damping?: number
  point_at?: number
  move_to?: number
  transition_duration?: number
  event_flags?: number
}

/** Starts a `PSYS` entity's effect. Carries nothing beyond what every event does. */
export interface StartPsys extends EventCommon {
  action: 'START_PSYS'
}

/** Animates a `PSYS`'s `sparam`, driving the effect between its authored states. */
export interface StartPsysPropAnim extends EventCommon {
  action: 'START_PSYS_PROP_ANIM'
  psysprops?: PsysProps
}

/** Animates a `SOUND`'s attenuation and falloff. */
export interface StartAudioPropAnim extends EventCommon {
  action: 'START_AUDIO_PROP_ANIM'
  audioprops?: AudioProps
}

/** Animates the scene's fog. The same keys a `SCENE` entity writes inline — see {@link FogProps}. */
export interface StartFogPropAnim extends EventCommon {
  action: 'START_FOG_PROP_ANIM'
  fogprops?: FogProps
}

/** Animates a `DEFORMABLE`'s `floor_height`. */
export interface StartFlrHeightAnim extends EventCommon, Targeted {
  action: 'START_FLR_HEIGHT_ANIM'
  floor_height?: number
}

/**
 * One event.
 *
 * Fifteen arms, which is every action retail uses. Five more are named in `thorn.dll` —
 * `UNDEFINED_EVENT`, `START_SUB_SCENE`, `USER_EVENT`, `START_REVERB_PROP_ANIM`, `SUBTITLE` — with no
 * measured value and, for four of them, no measured property set either.
 */
export type Event =
  | SetCamera
  | StartSound
  | StartLightPropAnim
  | StartCameraPropAnim
  | StartPathAnimation
  | StartSpatialPropAnim
  | AttachEntity
  | ConnectHardpoints
  | StartMotion
  | StartIk
  | StartPsys
  | StartPsysPropAnim
  | StartAudioPropAnim
  | StartFogPropAnim
  | StartFlrHeightAnim

/** Narrows to the entity of a given type, so a consumer can filter without a cast. */
export type EntityOf<T extends EntityTypeName> = Extract<Entity, { type: T }>

/** Narrows to the event of a given action. */
export type EventOf<T extends EventTypeName> = Extract<Event, { action: T }>
