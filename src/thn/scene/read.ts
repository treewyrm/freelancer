import type { Document, TableValue, Value } from '../types.js'
import * as value from '../value.js'
import {
  ATTACH_FLAGS,
  AXES,
  ENTITY_TYPES,
  EVENT_TYPES,
  FOG_MODES,
  LIGHT_TYPES,
  PATH_FLAGS,
  PATH_TYPES,
  SOUND_FLAGS,
  TARGET_TYPES,
  TRUTH,
  entityFlagsOf,
  namesOf,
  type Enum,
} from './data.js'
import type {
  AudioProps,
  AxisName,
  CameraAnimProps,
  CameraProps,
  CompoundProps,
  Entity,
  EntityTypeName,
  Event,
  EventTypeName,
  FogModeName,
  FogProps,
  LightProps,
  LightTypeName,
  Matrix3,
  OrientedPoint,
  ParamCurve,
  PathFlagName,
  PathProps,
  PsysProps,
  Quaternion,
  Script,
  SpatialProps,
  TargetTypeName,
  TruthName,
  Unknown,
  UserProps,
  Vector3,
} from './types.js'

/** Drops the keys that were absent, so an optional property stays absent rather than becoming `undefined`. */
const compact = <T extends object>(source: T): T =>
  Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined)) as T

const at = (where: string, message: string) => new TypeError(`${where}: ${message}`)

const describe = (v: Value): string =>
  v.type === 'identifier' ? `the identifier ${v.names.join(' + ')}` : `a ${v.type}`

const asNumber = (where: string, v: Value): number => {
  if (!value.isNumber(v)) throw at(where, `expected a number, found ${describe(v)}`)
  return value.toNumber(v)
}

const asString = (where: string, v: Value): string => {
  if (!value.isString(v)) throw at(where, `expected a string, found ${describe(v)}`)
  return v.value
}

const asTable = (where: string, v: Value): TableValue => {
  if (!value.isTable(v)) throw at(where, `expected a table, found ${describe(v)}`)
  return v
}

/**
 * A table's positional values, from whichever part holds them.
 *
 * The 355 numeric-form scripts store arrays as a hash keyed `1..n` instead of as an array part —
 * `SETMAP` where the rest emit `SETLIST`. The interim layer keeps that distinction because it is a
 * different instruction; here the two are the same list, which is the fold this layer exists to do.
 */
const items = (where: string, v: Value): Value[] => {
  const table = asTable(where, v)
  if (table.array.length) return table.array
  if (table.entries.length && table.entries.every(({ key }) => value.isNumber(key)))
    return table.entries.map(({ value }) => value)
  if (table.entries.length) throw at(where, 'expected a list, found a table with named keys')
  return []
}

const tuple = (where: string, v: Value, length: number): number[] => {
  const list = items(where, v)
  if (list.length !== length) throw at(where, `expected ${length} numbers, found ${list.length}`)
  return list.map((x, index) => asNumber(`${where}[${index + 1}]`, x))
}

const asVector3 = (where: string, v: Value): Vector3 => {
  const [x, y, z] = tuple(where, v, 3) as [number, number, number]
  return [x, y, z]
}

const asQuaternion = (where: string, v: Value): Quaternion => {
  const [x, y, z, w] = tuple(where, v, 4) as [number, number, number, number]
  return [x, y, z, w]
}

const asMatrix3 = (where: string, v: Value): Matrix3 => {
  const rows = items(where, v)
  if (rows.length !== 3) throw at(where, `expected 3 rows, found ${rows.length}`)
  const [a, b, c] = rows.map((row, index) => asVector3(`${where}[${index + 1}]`, row)) as [
    Vector3,
    Vector3,
    Vector3,
  ]
  return [a, b, c]
}

const reversed = new WeakMap<Enum, ReadonlyMap<number, string>>()

const numberToName = (table: Enum): ReadonlyMap<number, string> => {
  let map = reversed.get(table)
  if (!map) reversed.set(table, (map = namesOf(table)))
  return map
}

/**
 * Reads one of THORN's enums in either export form.
 *
 * A symbolic script writes the global, a numeric one writes what the global holds, and both land on
 * the name. **An unrecognised value is an error rather than a pass-through**: every one of the 41,250
 * entities and 50,785 events in retail resolves, so a value that does not is either a mod using
 * something undocumented or this library being wrong, and both deserve to be heard about.
 */
const enumeration =
  <T extends string>(table: Enum, kind: string) =>
  (where: string, v: Value): T => {
    if (value.isIdentifier(v)) {
      const [name, ...rest] = v.names
      if (name === undefined || rest.length)
        throw at(where, `expected one ${kind}, found ${describe(v)}`)
      if (!(name in table)) throw at(where, `${name} is not a ${kind} this library knows`)
      return name as T
    }

    if (value.isNumber(v)) {
      const number = value.toNumber(v)
      const name = numberToName(table).get(number)
      if (name === undefined) throw at(where, `${number} is not a ${kind} this library knows`)
      return name as T
    }

    throw at(where, `expected a ${kind}, found ${describe(v)}`)
  }

const axis = enumeration<AxisName>(AXES, 'axis')
const targetType = enumeration<TargetTypeName>(TARGET_TYPES, 'target type')
const lightType = enumeration<LightTypeName>(LIGHT_TYPES, 'light type')
const fogMode = enumeration<FogModeName>(FOG_MODES, 'fog mode')
const truth = enumeration<TruthName>(TRUTH, 'Y or N')
const entityType = enumeration<EntityTypeName>(ENTITY_TYPES, 'entity type')
const eventType = enumeration<EventTypeName>(EVENT_TYPES, 'event action')

/**
 * Reads a flag set in either export form.
 *
 * **A symbolic name is taken as written and is not checked against the table**, deliberately:
 * `thorn.dll` names four flags — `STREAM`, `FOG_PROPS_REMOVED`, `PATH_POSITION`,
 * `USE_SCRIPT_DURATION` — that no retail script uses, so their bits are unmeasured and rejecting them
 * would refuse a name that is real. The numeric form has no such latitude: an undecodable bit throws,
 * because there is nothing to call it.
 */
const flagsIn =
  (table: Enum) =>
  (where: string, v: Value): string[] => {
    if (value.isIdentifier(v)) return [...v.names]

    if (value.isNumber(v)) {
      let bits = value.toNumber(v)
      if (!Number.isInteger(bits) || bits < 0) throw at(where, `${bits} is not a flag set`)

      const names: string[] = []

      for (const [name, bit] of Object.entries(table))
        if ((bits & bit) === bit) {
          names.push(name)
          bits &= ~bit
        }

      if (bits) throw at(where, `bit ${bits} is not a flag this library knows`)
      return names
    }

    throw at(where, `expected flags, found ${describe(v)}`)
  }

const attachFlags = flagsIn(ATTACH_FLAGS)
const soundFlags = flagsIn(SOUND_FLAGS)

/** A record's fields, taken out one at a time so whatever is left over is genuinely unrecognised. */
const reader = (where: string, table: TableValue) => {
  const rest = new Map<string, Value>()

  if (table.array.length) throw at(where, 'expected a record, found a list')

  for (const { key, value: v } of table.entries) {
    if (!value.isString(key)) throw at(where, `expected a record, found a ${key.type} key`)
    rest.set(key.value, v)
  }

  return {
    take: <T>(key: string, as: (where: string, v: Value) => T): T | undefined => {
      const v = rest.get(key)
      if (v === undefined) return undefined
      rest.delete(key)
      return as(`${where}.${key}`, v)
    },

    /** Whatever was never taken. Call last. */
    unknown: (): Unknown | undefined => (rest.size ? Object.fromEntries(rest) : undefined),
  }
}

const record = (where: string, v: Value) => reader(where, asTable(where, v))

const asUserProps = (where: string, v: Value): UserProps => {
  const out: UserProps = {}
  for (const { key, value: x } of asTable(where, v).entries) {
    if (!value.isString(key)) throw at(where, `expected a record, found a ${key.type} key`)
    out[key.value] = asString(`${where}.${key.value}`, x)
  }
  return out
}

const asSpatialProps = (where: string, v: Value): SpatialProps => {
  const f = record(where, v)

  return compact({
    pos: f.take('pos', asVector3),
    orient: f.take('orient', asMatrix3),
    q_orient: f.take('q_orient', asQuaternion),
    axisrot: f.take('axisrot', (w, x) => {
      const [degrees, about] = items(w, x)
      if (degrees === undefined || about === undefined) throw at(w, 'expected an angle and an axis')
      return [asNumber(`${w}[1]`, degrees), axis(`${w}[2]`, about)] as const
    }),
  })
}

const asCameraProps = (where: string, v: Value): CameraProps => {
  const f = record(where, v)

  return compact({
    fovh: f.take('fovh', asNumber),
    hvaspect: f.take('hvaspect', asNumber),
    nearplane: f.take('nearplane', asNumber),
    farplane: f.take('farplane', asNumber),
  })
}

const asCameraAnimProps = (where: string, v: Value): CameraAnimProps => {
  const f = record(where, v)

  return compact({
    fovh: f.take('fovh', asNumber),
    aspect: f.take('aspect', asNumber),
    near: f.take('near', asNumber),
    far: f.take('far', asNumber),
  })
}

const asLightProps = (where: string, v: Value): LightProps => {
  const f = record(where, v)

  return compact({
    on: f.take('on', truth),
    color: f.take('color', asVector3),
    diffuse: f.take('diffuse', asVector3),
    specular: f.take('specular', asVector3),
    ambient: f.take('ambient', asVector3),
    direction: f.take('direction', asVector3),
    range: f.take('range', asNumber),
    cutoff: f.take('cutoff', asNumber),
    type: f.take('type', lightType),
    theta: f.take('theta', asNumber),
    atten: f.take('atten', asVector3),
  })
}

const asAudioProps = (where: string, v: Value): AudioProps => {
  const f = record(where, v)

  return compact({
    attenuation: f.take('attenuation', asNumber),
    pan: f.take('pan', asNumber),
    dmin: f.take('dmin', asNumber),
    dmax: f.take('dmax', asNumber),
    ain: f.take('ain', asNumber),
    aout: f.take('aout', asNumber),
    atout: f.take('atout', asNumber),
    rmix: f.take('rmix', asNumber),
  })
}

const asPsysProps = (where: string, v: Value): PsysProps =>
  compact({ sparam: record(where, v).take('sparam', asNumber) })

const asCompoundProps = (where: string, v: Value): CompoundProps =>
  compact({ floor_height: record(where, v).take('floor_height', asNumber) })

const pathFlag = (where: string, name: string): PathFlagName => {
  if (!(PATH_FLAGS as readonly string[]).includes(name))
    throw at(where, `${name} is not a path flag this library knows`)
  return name as PathFlagName
}

/**
 * `path_data`, which is a string and not a table: a flag token, then braced tuples of numbers.
 *
 * The separators are read leniently and the arities are not. Every retail string ends with a
 * trailing `, ` because the exporter's per-point format is `{%f,%f,%f}, ` — the separator belongs to
 * the point rather than sitting between points — so a terminator that looks stray is the normal
 * case, while a tuple of the wrong width means the path is not the type it claims.
 */
const pathData = (where: string, source: string): [PathFlagName, number[][]] => {
  const head = /^\s*([A-Za-z_]+)\s*,?/.exec(source)
  if (!head) throw at(where, 'expected a path flag, found no token')

  const rest = source.slice(head[0].length)
  if (/[^\s,]/.test(rest.replace(/\{[^{}]*\}/g, '')))
    throw at(where, 'expected points in braces, separated by commas')

  const points = [...rest.matchAll(/\{([^{}]*)\}/g)].map(([, body], index) =>
    (body as string).split(',').map((text, component) => {
      const number = Number(text.trim())
      if (!text.trim() || !Number.isFinite(number))
        throw at(`${where}[${index + 1}][${component + 1}]`, `${text.trim()} is not a number`)
      return number
    }),
  )

  return [pathFlag(where, head[1] as string), points]
}

const toVector3 = (where: string, numbers: number[]): Vector3 => {
  if (numbers.length !== 3) throw at(where, `expected 3 numbers, found ${numbers.length}`)
  const [x, y, z] = numbers as [number, number, number]
  return [x, y, z]
}

const toQuaternion = (where: string, numbers: number[]): Quaternion => {
  if (numbers.length !== 4) throw at(where, `expected 4 numbers, found ${numbers.length}`)
  const [x, y, z, w] = numbers as [number, number, number, number]
  return [x, y, z, w]
}

/**
 * `pathprops` — **the one block whose keys are not independent**.
 *
 * `path_type` says how `path_data` reads, so a missing one is an error rather than an absent
 * property: there is no shape to fall back on. `NULL` is a fourth possibility the binary does not
 * name, written where the spline class would go on the 3 retail paths that have no path.
 */
const asPathProps = (where: string, v: Value): PathProps => {
  const f = record(where, v)
  const type = f.take('path_type', asString)
  const data = f.take('path_data', asString)

  if (type === undefined) throw at(where, 'expected a path_type')

  if (type === 'NULL') {
    if (data !== undefined) throw at(where, 'a NULL path carries no path_data')
    return { path_type: type }
  }

  if (!(PATH_TYPES as readonly string[]).includes(type))
    throw at(`${where}.path_type`, `${type} is not a path type this library knows`)

  if (data === undefined) throw at(where, `expected path_data on a ${type}`)

  const place = `${where}.path_data`
  const [flag, groups] = pathData(place, data)

  if (type === 'CV_CRSplinePath')
    return {
      path_type: type,
      flag,
      points: groups.map((numbers, index) => toVector3(`${place}[${index + 1}]`, numbers)),
    }

  const points: OrientedPoint[] = []

  for (let index = 0; index < groups.length; index += 2) {
    const [position, orientation] = [groups[index] as number[], groups[index + 1]]
    if (orientation === undefined)
      throw at(`${place}[${index + 2}]`, 'expected an orientation after the last position')

    points.push({
      position: toVector3(`${place}[${index + 1}]`, position),
      orientation: toQuaternion(`${place}[${index + 2}]`, orientation),
    })
  }

  return { path_type: 'CV_CROrientationSplinePath', flag, points }
}

const asFogProps = (where: string, v: Value): FogProps => fog(record(where, v))

/** The fog keys, taken from wherever they are — a `fogprops` block, or flat on a `SCENE`. */
const fog = (f: ReturnType<typeof reader>): FogProps =>
  compact({
    fogon: f.take('fogon', truth),
    fogmode: f.take('fogmode', fogMode),
    fogcolor: f.take('fogcolor', asVector3),
    fogstart: f.take('fogstart', asNumber),
    fogend: f.take('fogend', asNumber),
    fogdensity: f.take('fogdensity', asNumber),
    fogtable: f.take('fogtable', truth),
  })

const asParamCurve = (where: string, v: Value): ParamCurve => {
  const f = record(where, v)

  return compact({
    CLSID: f.take('CLSID', asString),
    points: f.take('points', (w, x) =>
      items(w, x).map((row, index) => {
        const [a, b, c, d] = tuple(`${w}[${index + 1}]`, row, 4) as [number, number, number, number]
        return [a, b, c, d] as const
      }),
    ),
  })
}

const readEntity = (where: string, v: Value): Entity => {
  const f = record(where, v)

  const type = f.take('type', entityType)
  if (type === undefined) throw at(where, 'an entity with no type')

  const entity_name = f.take('entity_name', asString)
  if (entity_name === undefined) throw at(where, 'an entity with no entity_name')

  const common = {
    entity_name,
    template_name: f.take('template_name', asString),
    lt_grp: f.take('lt_grp', asNumber),
    srt_grp: f.take('srt_grp', asNumber),
    usr_flg: f.take('usr_flg', asNumber),
    template_id: f.take('template_id', asNumber),
  }

  const flags = f.take('flags', flagsIn(entityFlagsOf(type)))
  const spatialprops = f.take('spatialprops', asSpatialProps)
  const placed = { ...common, flags, spatialprops }

  switch (type) {
    case 'SCENE': {
      const up = f.take('up', axis)
      const front = f.take('front', axis)
      const ambient = f.take('ambient', asVector3)
      const inline = fog(f)

      return compact({
        ...placed,
        type,
        up,
        front,
        ambient,
        fog: Object.keys(inline).length ? inline : undefined,
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })
    }

    case 'MONITOR':
      return compact({
        ...common,
        type,
        flags,
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'CAMERA':
      return compact({
        ...placed,
        type,
        cameraprops: f.take('cameraprops', asCameraProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'LIGHT':
      return compact({
        ...placed,
        type,
        lightprops: f.take('lightprops', asLightProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'DEFORMABLE':
      return compact({
        ...placed,
        type,
        compoundprops: f.take('compoundprops', asCompoundProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'PSYS':
      return compact({
        ...placed,
        type,
        psysprops: f.take('psysprops', asPsysProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'SOUND':
      return compact({
        ...placed,
        type,
        audioprops: f.take('audioprops', asAudioProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'MOTION_PATH':
      return compact({
        ...placed,
        type,
        pathprops: f.take('pathprops', asPathProps),
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })

    case 'COMPOUND':
    case 'MARKER':
      return compact({
        ...placed,
        type,
        userprops: f.take('userprops', asUserProps),
        unknown: f.unknown(),
      })
  }
}

/** A `SET_CAMERA` carries no property table at all, so the readers need one that is simply empty. */
const NOTHING: TableValue = { type: 'table', array: [], entries: [] }

const readEvent = (where: string, v: Value): Event => {
  const parts = items(where, v)

  const [time, action, targets, properties] = parts
  if (time === undefined || action === undefined)
    throw at(where, `an event with ${parts.length} fields; expected a time and an action`)

  const common = {
    time: asNumber(`${where}[1]`, time),
    targets:
      targets === undefined
        ? []
        : items(`${where}[3]`, targets).map((target, index) =>
            asString(`${where}[3][${index + 1}]`, target),
          ),
  }

  const kind = eventType(`${where}[2]`, action)
  const f = reader(
    `${where}[4]`,
    properties === undefined ? NOTHING : asTable(`${where}[4]`, properties),
  )

  const shared = {
    ...common,
    duration: f.take('duration', asNumber),
    param_curve: f.take('param_curve', asParamCurve),
    pcurve_period: f.take('pcurve_period', asNumber),
  }

  const targeted = {
    target_type: f.take('target_type', targetType),
    target_part: f.take('target_part', asString),
  }

  const oriented = {
    offset: f.take('offset', asVector3),
    up: f.take('up', axis),
    front: f.take('front', axis),
  }

  switch (kind) {
    case 'SET_CAMERA':
    case 'START_PSYS':
      return compact({ ...shared, action: kind, unknown: f.unknown() })

    case 'START_SOUND':
      return compact({
        ...shared,
        action: kind,
        flags: f.take('flags', soundFlags),
        start_time: f.take('start_time', asNumber),
        unknown: f.unknown(),
      })

    case 'START_LIGHT_PROP_ANIM':
      return compact({
        ...shared,
        action: kind,
        lightprops: f.take('lightprops', asLightProps),
        unknown: f.unknown(),
      })

    case 'START_CAMERA_PROP_ANIM':
      return compact({
        ...shared,
        action: kind,
        cameraprops: f.take('cameraprops', asCameraAnimProps),
        unknown: f.unknown(),
      })

    case 'START_PATH_ANIMATION':
      return compact({
        ...shared,
        ...oriented,
        action: kind,
        start_percent: f.take('start_percent', asNumber),
        stop_percent: f.take('stop_percent', asNumber),
        flags: f.take('flags', attachFlags),
        unknown: f.unknown(),
      })

    case 'START_SPATIAL_PROP_ANIM':
      return compact({
        ...shared,
        ...targeted,
        action: kind,
        spatialprops: f.take('spatialprops', asSpatialProps),
        unknown: f.unknown(),
      })

    case 'ATTACH_ENTITY':
      return compact({
        ...shared,
        ...targeted,
        ...oriented,
        action: kind,
        flags: f.take('flags', attachFlags),
        unknown: f.unknown(),
      })

    case 'CONNECT_HARDPOINTS':
      return compact({
        ...shared,
        action: kind,
        hardpoint: f.take('hardpoint', asString),
        parent_hardpoint: f.take('parent_hardpoint', asString),
        unknown: f.unknown(),
      })

    case 'START_MOTION':
      return compact({
        ...shared,
        action: kind,
        animation: f.take('animation', asString),
        time_scale: f.take('time_scale', asNumber),
        weight: f.take('weight', asNumber),
        heading: f.take('heading', asNumber),
        trans_time: f.take('trans_time', asNumber),
        trans_scale: f.take('trans_scale', asNumber),
        start_time: f.take('start_time', asNumber),
        locked_bone: f.take('locked_bone', asString),
        event_flags: f.take('event_flags', asNumber),
        unknown: f.unknown(),
      })

    case 'START_IK':
      return compact({
        ...shared,
        ...targeted,
        ...oriented,
        action: kind,
        end_effector: f.take('end_effector', asString),
        count_to_root: f.take('count_to_root', asNumber),
        damping: f.take('damping', asNumber),
        point_at: f.take('point_at', asNumber),
        move_to: f.take('move_to', asNumber),
        transition_duration: f.take('transition_duration', asNumber),
        event_flags: f.take('event_flags', asNumber),
        unknown: f.unknown(),
      })

    case 'START_PSYS_PROP_ANIM':
      return compact({
        ...shared,
        action: kind,
        psysprops: f.take('psysprops', asPsysProps),
        unknown: f.unknown(),
      })

    case 'START_AUDIO_PROP_ANIM':
      return compact({
        ...shared,
        action: kind,
        audioprops: f.take('audioprops', asAudioProps),
        unknown: f.unknown(),
      })

    case 'START_FOG_PROP_ANIM':
      return compact({
        ...shared,
        action: kind,
        fogprops: f.take('fogprops', asFogProps),
        unknown: f.unknown(),
      })

    case 'START_FLR_HEIGHT_ANIM':
      return compact({
        ...shared,
        ...targeted,
        action: kind,
        floor_height: f.take('floor_height', asNumber),
        unknown: f.unknown(),
      })
  }
}

/**
 * Turns an interim document into a scene.
 *
 * **Both export forms read the same.** `type = SCENE` and `type = 9` are different bytecode and the
 * interim layer keeps them apart; here they are both `'SCENE'`, and likewise for every axis, flag,
 * light type, fog mode and `Y`/`N` in the script. That fold is what this layer is for, and it is only
 * possible because the values are measured — see [THORN.md](../../../docs/THORN.md).
 *
 * Throws a `TypeError` naming the path when a value is not what the vocabulary says it should be, or
 * when an entity type, event action, enum value or flag bit is one this library has not measured.
 * Every one of the 1,506 retail scripts reads without either.
 *
 * @param document Assignments, from any of the readers under `./thn`.
 */
export const read = (document: Document): Script => {
  const duration = value.getGlobal(document, 'duration')
  if (duration === undefined) throw at('duration', 'the script does not set it')

  const entities = value.getGlobal(document, 'entities')
  const events = value.getGlobal(document, 'events')

  return {
    duration: asNumber('duration', duration),
    entities:
      entities === undefined
        ? []
        : items('entities', entities).map((entity, index) =>
            readEntity(`entities[${index + 1}]`, entity),
          ),
    events:
      events === undefined
        ? []
        : items('events', events).map((event, index) => readEvent(`events[${index + 1}]`, event)),
  }
}
