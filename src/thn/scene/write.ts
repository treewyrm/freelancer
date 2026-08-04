import type { Document, TableValue, Value } from '../types.js'
import * as value from '../value.js'
import type {
  AudioProps,
  CameraAnimProps,
  CameraProps,
  CompoundProps,
  Entity,
  Event,
  FogProps,
  LightProps,
  Matrix3,
  OrientationSplinePath,
  ParamCurve,
  PathProps,
  SplinePath,
  PsysProps,
  Quaternion,
  Script,
  SpatialProps,
  Unknown,
  UserProps,
  Vector3,
} from './types.js'

/** A field that is absent stays absent — {@link value.table} drops it. */
type Fields = Record<string, Value | number | string | undefined>

const vector = (v: Vector3 | Quaternion): TableValue => value.list(...v)

const matrix = (m: Matrix3): TableValue => value.list(...m.map(vector))

/**
 * A flag set, written the symbolic way.
 *
 * **Always symbolic, even for a script that was read from the numeric form** — that is the
 * normalisation this layer performs, and the reason `interim → typed → interim` is a fixed point
 * rather than an identity. An empty set is dropped, because bare `flags =` is not Lua and no retail
 * script has one.
 */
const flags = (names: string[] | undefined): Value | undefined =>
  names?.length ? value.identifier(...names) : undefined

const enumeration = (name: string | undefined): Value | undefined =>
  name === undefined ? undefined : value.identifier(name)

/** A block, or nothing if the script did not carry it. An *empty* block is still a block. */
const block = <T>(source: T | undefined, as: (source: T) => Fields): Value | undefined =>
  source === undefined ? undefined : value.table(as(source))

const userProps = (source: UserProps | undefined): Value | undefined =>
  source === undefined ? undefined : value.table(source)

const unknown = (source: Unknown | undefined): Fields => source ?? {}

const spatialProps = (source: SpatialProps): Fields => ({
  pos: source.pos && vector(source.pos),
  orient: source.orient && matrix(source.orient),
  q_orient: source.q_orient && vector(source.q_orient),
  axisrot:
    source.axisrot &&
    value.list(value.number(source.axisrot[0]), value.identifier(source.axisrot[1])),
})

const cameraProps = (source: CameraProps): Fields => ({
  fovh: source.fovh,
  hvaspect: source.hvaspect,
  nearplane: source.nearplane,
  farplane: source.farplane,
})

const cameraAnimProps = (source: CameraAnimProps): Fields => ({
  fovh: source.fovh,
  aspect: source.aspect,
  near: source.near,
  far: source.far,
})

const lightProps = (source: LightProps): Fields => ({
  on: enumeration(source.on),
  color: source.color && vector(source.color),
  diffuse: source.diffuse && vector(source.diffuse),
  specular: source.specular && vector(source.specular),
  ambient: source.ambient && vector(source.ambient),
  direction: source.direction && vector(source.direction),
  range: source.range,
  cutoff: source.cutoff,
  type: enumeration(source.type),
  theta: source.theta,
  atten: source.atten && vector(source.atten),
})

const audioProps = (source: AudioProps): Fields => ({
  attenuation: source.attenuation,
  pan: source.pan,
  dmin: source.dmin,
  dmax: source.dmax,
  ain: source.ain,
  aout: source.aout,
  atout: source.atout,
  rmix: source.rmix,
})

const psysProps = (source: PsysProps): Fields => ({ sparam: source.sparam })

const compoundProps = (source: CompoundProps): Fields => ({ floor_height: source.floor_height })

/**
 * A number the way C's `%f` writes one, which is what wrote every `path_data` in the game: six
 * decimals and no exponent, and **a negative zero that keeps its sign** — five retail paths have one,
 * and `toFixed` drops it, which would make the string differ from the file it was read from.
 */
const decimal = (n: number): string => `${Object.is(n, -0) ? '-' : ''}${n.toFixed(6)}`

/** The trailing `, ` is the exporter's: its per-point format is `{%f,%f,%f}, `, separator included. */
const point = (numbers: readonly number[]): string => `{${numbers.map(decimal).join(',')}}, `

const pathData = (source: OrientationSplinePath | SplinePath): string =>
  source.path_type === 'CV_CRSplinePath'
    ? `${source.flag}, ${source.points.map(point).join('')}`
    : `${source.flag}, ${source.points
        .map(({ position, orientation }) => point(position) + point(orientation))
        .join('')}`

const pathProps = (source: PathProps): Fields =>
  source.path_type === 'NULL'
    ? { path_type: source.path_type }
    : { path_type: source.path_type, path_data: pathData(source) }

const fogProps = (source: FogProps): Fields => ({
  fogon: enumeration(source.fogon),
  fogmode: enumeration(source.fogmode),
  fogcolor: source.fogcolor && vector(source.fogcolor),
  fogstart: source.fogstart,
  fogend: source.fogend,
  fogdensity: source.fogdensity,
  fogtable: enumeration(source.fogtable),
})

const paramCurve = (source: ParamCurve): Fields => ({
  CLSID: source.CLSID,
  points: source.points && value.list(...source.points.map(vector)),
})

const writeEntity = (entity: Entity): TableValue => {
  const common: Fields = {
    entity_name: entity.entity_name,
    type: value.identifier(entity.type),
    template_name: entity.template_name,
    lt_grp: entity.lt_grp,
    srt_grp: entity.srt_grp,
    usr_flg: entity.usr_flg,
    template_id: entity.template_id,
  }

  // `MONITOR` is the one entity with no place in the scene, so it has no `spatialprops`.
  const placed: Fields =
    entity.type === 'MONITOR'
      ? { ...common, flags: flags(entity.flags) }
      : {
          ...common,
          flags: flags(entity.flags),
          spatialprops: block(entity.spatialprops, spatialProps),
        }

  switch (entity.type) {
    case 'SCENE':
      return value.table({
        ...placed,
        up: enumeration(entity.up),
        front: enumeration(entity.front),
        ambient: entity.ambient && vector(entity.ambient),
        // Flat on the entity, not as a block — which is how retail writes fog on a scene.
        ...(entity.fog ? fogProps(entity.fog) : {}),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'CAMERA':
      return value.table({
        ...placed,
        cameraprops: block(entity.cameraprops, cameraProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'LIGHT':
      return value.table({
        ...placed,
        lightprops: block(entity.lightprops, lightProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'DEFORMABLE':
      return value.table({
        ...placed,
        compoundprops: block(entity.compoundprops, compoundProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'PSYS':
      return value.table({
        ...placed,
        psysprops: block(entity.psysprops, psysProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'SOUND':
      return value.table({
        ...placed,
        audioprops: block(entity.audioprops, audioProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'MOTION_PATH':
      return value.table({
        ...placed,
        pathprops: block(entity.pathprops, pathProps),
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })

    case 'MONITOR':
    case 'COMPOUND':
    case 'MARKER':
      return value.table({
        ...placed,
        userprops: userProps(entity.userprops),
        ...unknown(entity.unknown),
      })
  }
}

const properties = (event: Event): Fields => {
  const shared: Fields = {
    duration: event.duration,
    param_curve: block(event.param_curve, paramCurve),
    pcurve_period: event.pcurve_period,
  }

  switch (event.action) {
    case 'SET_CAMERA':
    case 'START_PSYS':
      return { ...shared, ...unknown(event.unknown) }

    case 'START_SOUND':
      return {
        ...shared,
        flags: flags(event.flags),
        start_time: event.start_time,
        ...unknown(event.unknown),
      }

    case 'START_LIGHT_PROP_ANIM':
      return {
        ...shared,
        lightprops: block(event.lightprops, lightProps),
        ...unknown(event.unknown),
      }

    case 'START_CAMERA_PROP_ANIM':
      return {
        ...shared,
        cameraprops: block(event.cameraprops, cameraAnimProps),
        ...unknown(event.unknown),
      }

    case 'START_PATH_ANIMATION':
      return {
        ...shared,
        start_percent: event.start_percent,
        stop_percent: event.stop_percent,
        offset: event.offset && vector(event.offset),
        up: enumeration(event.up),
        front: enumeration(event.front),
        flags: flags(event.flags),
        ...unknown(event.unknown),
      }

    case 'START_SPATIAL_PROP_ANIM':
      return {
        ...shared,
        target_type: enumeration(event.target_type),
        target_part: event.target_part,
        spatialprops: block(event.spatialprops, spatialProps),
        ...unknown(event.unknown),
      }

    case 'ATTACH_ENTITY':
      return {
        ...shared,
        target_type: enumeration(event.target_type),
        target_part: event.target_part,
        offset: event.offset && vector(event.offset),
        up: enumeration(event.up),
        front: enumeration(event.front),
        flags: flags(event.flags),
        ...unknown(event.unknown),
      }

    case 'CONNECT_HARDPOINTS':
      return {
        ...shared,
        hardpoint: event.hardpoint,
        parent_hardpoint: event.parent_hardpoint,
        ...unknown(event.unknown),
      }

    case 'START_MOTION':
      return {
        ...shared,
        animation: event.animation,
        time_scale: event.time_scale,
        weight: event.weight,
        heading: event.heading,
        trans_time: event.trans_time,
        trans_scale: event.trans_scale,
        start_time: event.start_time,
        locked_bone: event.locked_bone,
        event_flags: event.event_flags,
        ...unknown(event.unknown),
      }

    case 'START_IK':
      return {
        ...shared,
        target_type: enumeration(event.target_type),
        target_part: event.target_part,
        offset: event.offset && vector(event.offset),
        up: enumeration(event.up),
        front: enumeration(event.front),
        end_effector: event.end_effector,
        count_to_root: event.count_to_root,
        damping: event.damping,
        point_at: event.point_at,
        move_to: event.move_to,
        transition_duration: event.transition_duration,
        event_flags: event.event_flags,
        ...unknown(event.unknown),
      }

    case 'START_PSYS_PROP_ANIM':
      return { ...shared, psysprops: block(event.psysprops, psysProps), ...unknown(event.unknown) }

    case 'START_AUDIO_PROP_ANIM':
      return {
        ...shared,
        audioprops: block(event.audioprops, audioProps),
        ...unknown(event.unknown),
      }

    case 'START_FOG_PROP_ANIM':
      return { ...shared, fogprops: block(event.fogprops, fogProps), ...unknown(event.unknown) }

    case 'START_FLR_HEIGHT_ANIM':
      return {
        ...shared,
        target_type: enumeration(event.target_type),
        target_part: event.target_part,
        floor_height: event.floor_height,
        ...unknown(event.unknown),
      }
  }
}

const writeEvent = (event: Event): TableValue => {
  const table = value.table(properties(event))

  const parts: Value[] = [
    value.number(event.time),
    value.identifier(event.action),
    value.list(...event.targets),
  ]

  // A `SET_CAMERA` has no properties at all in retail, and an empty table would be a fourth field
  // that the scripts do not carry. Anything with a property gets one.
  if (table.entries.length) parts.push(table)

  return value.list(...parts)
}

/**
 * Turns a scene back into an interim document.
 *
 * **The output is always the symbolic form.** A script read from one of the 355 numeric-form files
 * comes back with `type = SCENE` where it had `type = 9`, and with array literals where it had a hash
 * keyed `1..n`, because the typed layer holds meaning rather than an encoding. So
 * `typed → interim → typed` is an identity and `interim → typed → interim` is a fixed point — the
 * same caveat [SCHEMA.md](../../../docs/SCHEMA.md#round-trip) records for INI, arriving here for a
 * different reason. A tool that must not perturb the file edits the interim document instead.
 *
 * Numbers are written with `String`, the shortest form that reads back as the same double, so a
 * literal that was authored as `9e-006` comes back as `0.000009`. Same quantity, different text.
 *
 * @param script Entities and events to write.
 */
export const write = (script: Script): Document => [
  { name: 'duration', value: value.number(script.duration) },
  { name: 'entities', value: value.list(...script.entities.map(writeEntity)) },
  { name: 'events', value: value.list(...script.events.map(writeEvent)) },
]
