import { getResourceId } from '#/hash.js'
import {
  readInteger,
  writeInteger,
  readFloat,
  writeFloat,
  readString,
  writeString,
  type Blending,
  readBlending,
  writeBlending,
} from './misc.js'
import {
  type AnimatedTransform,
  type AnimatedFloat,
  type AnimatedColor,
  type AnimatedCurve,
  readAnimatedFloat,
  writeAnimatedFloat,
  readAnimatedColor,
  writeAnimatedColor,
  readAnimatedCurve,
  writeAnimatedCurve,
  readTransform,
  writeTransform,
} from './animation.js'
import BufferView from '#/utility/bufferview.js'
import { isHex, parseHex, toHex } from '#/utility/string.js'

/**
 * The wire code of each property type: the 16-bit word a property opens with, less the boolean's
 * value bit (`0x8000`). Codec-private — a {@link Property} is told apart by its string `type`, the
 * same way an INI `Value` is.
 */
const CODES = {
  boolean: 0x1,
  integer: 0x2,
  float: 0x3,
  string: 0x103,
  blending: 0x104,
  transform: 0x105,
  animatedFloat: 0x200,
  animatedColor: 0x201,
  animatedCurve: 0x202,
} as const satisfies Record<PropertyType, number>

/** The boolean's value, carried in the type word rather than in a payload. */
const TRUE = 0x8000

const TYPES = new Map<number, PropertyType>(
  Object.entries(CODES).map(([type, code]) => [code, type as PropertyType]),
)

const knownPropertyNames = [
  'Node_Name',
  'Node_LifeSpan',
  'Node_Transform',
  'Emitter_EmitCount',
  'Emitter_Frequency',
  'Emitter_InitialParticles',
  'Emitter_InitLifeSpan',
  'Emitter_LODCurve',
  'Emitter_MaxParticles',
  'Emitter_Pressure',
  'Emitter_VelocityApproach',
  'CubeEmitter_Width',
  'CubeEmitter_Depth',
  'CubeEmitter_Height',
  'CubeEmitter_MinSpread',
  'CubeEmitter_MaxSpread',
  'SphereEmitter_MinRadius',
  'SphereEmitter_MaxRadius',
  'ConeEmitter_MinRadius',
  'ConeEmitter_MaxRadius',
  'ConeEmitter_MinSpread',
  'ConeEmitter_MaxSpread',
  'Appearance_LODCurve',
  'BasicApp_TriTexture',
  'BasicApp_QuadTexture',
  'BasicApp_MotionBlur',
  'BasicApp_Color',
  'BasicApp_Alpha',
  'BasicApp_Size',
  'BasicApp_HToVAspect',
  'BasicApp_Rotate',
  'BasicApp_TexName',
  'BasicApp_BlendInfo',
  'BasicApp_UseCommonTexFrame',
  'BasicApp_TexFrame',
  'BasicApp_CommonTexFrame',
  'BasicApp_FlipTexU',
  'BasicApp_FlipTexV',
  'OrientedApp_Width',
  'OrientedApp_Height',
  'ParticleApp_LifeName',
  'ParticleApp_DeathName',
  'ParticleApp_UseDynamicRotation',
  'ParticleApp_SmoothRotation',
  'MeshApp_MeshId',
  'MeshApp_MeshName',
  'MeshApp_UseParticleTransform',
  'MeshApp_ParticleTransform',
  'RectApp_CenterOnPos',
  'RectApp_ViewingAngleFade',
  'RectApp_Scale',
  'RectApp_Length',
  'RectApp_Width',
  'BeamApp_DisablePlaceHolder',
  'BeamApp_DupeFirstParticle',
  'BeamApp_LineAppearance',
  'RadialField_Radius',
  'RadialField_Attenuation',
  'RadialField_Magnitude',
  'RadialField_Approach',
  'GravityField_Gravity',
  'CollideField_Reflectivity',
  'CollideField_Width',
  'CollideField_Height',
  'TurbulenceField_Magnitude',
  'TurbulenceField_Approach',
  'AirField_Magnitude',
  'AirField_Approach',
] as const

const knownProperties = new Map<number, string>(
  knownPropertyNames.map((value) => [getResourceId(value, true), value]),
)

/** Known alchemy node property names. */
export type PropertyName = (typeof knownPropertyNames)[number] | (string & {})

/**
 * Alchemy node property. The payload sits under `value` whatever the type, so a property can be
 * retyped by replacing it and never carries a previous type's fields along.
 */
export type Property = { name: PropertyName } & (
  | { type: 'boolean'; value: boolean }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'blending'; value: Blending }
  | { type: 'transform'; value: AnimatedTransform }
  | { type: 'animatedFloat'; value: AnimatedFloat }
  | { type: 'animatedColor'; value: AnimatedColor }
  | { type: 'animatedCurve'; value: AnimatedCurve }
)

/** Which of the nine kinds a property is. */
export type PropertyType = Property['type']

/** Narrows to the property of a given type, so a consumer can filter without a cast. */
export type PropertyOf<T extends PropertyType> = Extract<Property, { type: T }>

/**
 * Reads alchemy node property, or `undefined` at the zero word that ends a node's list.
 * @throws RangeError on a type code this reader does not know, whose payload length is unknown.
 */
export function readProperty(view: BufferView): Property | undefined {
  const word = view.readUint16()
  const code = word & ~TRUE
  if (!code) return undefined

  const crc = view.readInt32()
  const name = knownProperties.get(crc) ?? toHex(crc)

  switch (TYPES.get(code)) {
    case 'boolean':
      return { name, type: 'boolean', value: (word & TRUE) > 0 }
    case 'integer':
      return { name, type: 'integer', value: readInteger(view) }
    case 'float':
      return { name, type: 'float', value: readFloat(view) }
    case 'string':
      return { name, type: 'string', value: readString(view) }
    case 'blending':
      return { name, type: 'blending', value: readBlending(view) }
    case 'transform':
      return { name, type: 'transform', value: readTransform(view) }
    case 'animatedFloat':
      return { name, type: 'animatedFloat', value: readAnimatedFloat(view) }
    case 'animatedColor':
      return { name, type: 'animatedColor', value: readAnimatedColor(view) }
    case 'animatedCurve':
      return { name, type: 'animatedCurve', value: readAnimatedCurve(view) }
    default:
      throw new RangeError(`Unknown property type: ${word}`)
  }
}

/** Writes alchemy node property. */
export function writeProperty(property: Property): BufferView {
  let word: number = CODES[property.type]
  const crc = isHex(property.name) ? parseHex(property.name) : getResourceId(property.name, true)
  const value: BufferView[] = []

  switch (property.type) {
    case 'boolean':
      if (property.value) word |= TRUE
      break
    case 'integer':
      value.push(writeInteger(property.value))
      break
    case 'float':
      value.push(writeFloat(property.value))
      break
    case 'string':
      value.push(writeString(property.value))
      break
    case 'blending':
      value.push(writeBlending(property.value))
      break
    case 'transform':
      value.push(writeTransform(property.value))
      break
    case 'animatedFloat':
      value.push(writeAnimatedFloat(property.value))
      break
    case 'animatedColor':
      value.push(writeAnimatedColor(property.value))
      break
    case 'animatedCurve':
      value.push(writeAnimatedCurve(property.value))
      break
  }

  return BufferView.join(
    BufferView.allocate(Uint16Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT)
      .writeUint16(word)
      .writeInt32(crc),
    ...value,
  )
}
