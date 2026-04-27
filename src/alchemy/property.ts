import { getResourceId } from '#/hash.js'
import {
  type Read,
  type Write,
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
  type Transform,
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

/** Alchemy node property type. */
export enum PropertyType {
  None = 0,
  Boolean = 0x1,
  Integer = 0x2,
  Float = 0x3,
  String = 0x103,
  Blending = 0x104,
  Transform = 0x105,
  AnimatedFloat = 0x200,
  AnimatedColor = 0x201,
  AnimatedCurve = 0x202,
}

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

/** Alchemy node property */
export type Property = (
  | { type: PropertyType.Boolean; value: boolean }
  | { type: PropertyType.Integer; value: number }
  | { type: PropertyType.Float; value: number }
  | { type: PropertyType.String; value: string }
  | ({ type: PropertyType.Blending } & Blending)
  | ({ type: PropertyType.Transform } & Transform)
  | ({ type: PropertyType.AnimatedFloat } & AnimatedFloat)
  | ({ type: PropertyType.AnimatedColor } & AnimatedColor)
  | ({ type: PropertyType.AnimatedCurve } & AnimatedCurve)
) & {
  name: PropertyName
}

/** Reads alchem node property. */
export const readProperty: Read<Property | null> = (view) => {
  const type: PropertyType = view.readUint16()
  if (!(type & 0x7ffff)) return null

  const crc = view.readInt32()
  const name = knownProperties.get(crc) ?? toHex(crc)

  switch (type & 0x7fff) {
    case PropertyType.Boolean:
      return {
        name,
        type: PropertyType.Boolean,
        value: (type & 0x8000) > 0,
      }

    case PropertyType.Integer:
      return {
        name,
        type: PropertyType.Integer,
        value: readInteger(view),
      }

    case PropertyType.Float:
      return {
        name,
        type: PropertyType.Float,
        value: readFloat(view),
      }

    case PropertyType.String:
      return {
        name,
        type: PropertyType.String,
        value: readString(view),
      }

    case PropertyType.Blending:
      return {
        name,
        type: PropertyType.Blending,
        ...readBlending(view),
      }

    case PropertyType.Transform:
      return {
        name,
        type: PropertyType.Transform,
        ...readTransform(view),
      }

    case PropertyType.AnimatedFloat:
      return {
        name,
        type: PropertyType.AnimatedFloat,
        ...readAnimatedFloat(view),
      }

    case PropertyType.AnimatedColor:
      return {
        name,
        type: PropertyType.AnimatedColor,
        ...readAnimatedColor(view),
      }

    case PropertyType.AnimatedCurve:
      return {
        name,
        type: PropertyType.AnimatedCurve,
        ...readAnimatedCurve(view),
      }

    default:
      throw new RangeError(`Unknown property type: ${type}`)
  }
}

/** Writes alchemy node property. */
export const writeProperty: Write<Property> = (property) => {
  let type = property.type
  const crc = isHex(property.name) ? parseHex(property.name) : getResourceId(property.name, true)
  const value: BufferView[] = []

  switch (property.type) {
    case PropertyType.Boolean:
      if (property.value) type |= 0x8000
      break
    case PropertyType.Integer:
      value.push(writeInteger(property.value))
      break
    case PropertyType.Float:
      value.push(writeFloat(property.value))
      break
    case PropertyType.String:
      value.push(writeString(property.value))
      break
    case PropertyType.Blending:
      value.push(writeBlending(property))
      break
    case PropertyType.Transform:
      value.push(writeTransform(property))
      break
    case PropertyType.AnimatedFloat:
      value.push(writeAnimatedFloat(property))
      break
    case PropertyType.AnimatedColor:
      value.push(writeAnimatedColor(property))
      break
    case PropertyType.AnimatedCurve:
      value.push(writeAnimatedCurve(property))
      break
  }

  return BufferView.join(
    BufferView.allocate(Uint16Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT)
      .writeUint16(type)
      .writeInt32(crc),
    ...value,
  )
}
