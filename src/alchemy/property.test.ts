import { deepStrictEqual, notStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getResourceId } from '#/hash.js'
import BufferView from '#/utility/bufferview.js'
import { EaseType, TransformFlags, WrapFlags } from './animation.js'
import { BlendingMode } from './misc.js'
import { PropertyType, readProperty, writeProperty, type Property } from './property.js'

const roundtrip = (property: Property) => readProperty(writeProperty(property).rewind())

/** Type field and name CRC as the writer emitted them. */
const head = (property: Property) => {
  const view = writeProperty(property).rewind()
  return { type: view.readUint16(), crc: view.readInt32() }
}

describe('property header', () => {
  it('terminates a list on a zero type', () => {
    strictEqual(readProperty(BufferView.allocate(2)), null)
  })

  it('names the property by the case-sensitive CRC of a known name', () => {
    // The whole module hangs on this: fold the case, as every other CRC lookup in the library
    // does, and the name no longer matches what retail wrote.
    strictEqual(
      head({ name: 'Node_LifeSpan', type: PropertyType.Float, value: 1 }).crc,
      getResourceId('Node_LifeSpan', true),
    )

    notStrictEqual(getResourceId('Node_LifeSpan', true), getResourceId('Node_LifeSpan', false))
  })

  it('falls back to a hex name for a CRC it cannot resolve', () => {
    const crc = 0x1c65b7b9
    const view = BufferView.allocate(6)
      .writeUint16(PropertyType.Boolean | 0x8000)
      .writeInt32(crc)

    const property = readProperty(view.rewind())

    strictEqual(property?.name, '0x1C65B7B9')

    // And the hex name writes the same CRC back, so an unknown property still round-trips.
    strictEqual(head(property).crc, crc)
  })

  it('carries a negative CRC through its hex name unchanged', () => {
    const crc = 0xe63aa248 | 0
    const view = BufferView.allocate(10).writeUint16(PropertyType.Float).writeInt32(crc)
    const property = readProperty(view.rewind())

    strictEqual(property?.name, '0xE63AA248')
    strictEqual(head(property).crc, crc)
  })
})

describe('property values', () => {
  // Booleans have no payload at all — the value rides in bit 15 of the type field.
  it('packs a boolean into the type field', () => {
    const property: Property = {
      name: 'BasicApp_FlipTexU',
      type: PropertyType.Boolean,
      value: true,
    }

    strictEqual(writeProperty(property).byteLength, 6)
    strictEqual(head(property).type, 0x8001)
    strictEqual(head({ ...property, value: false }).type, 0x0001)

    deepStrictEqual(roundtrip(property), property)
    deepStrictEqual(roundtrip({ ...property, value: false }), { ...property, value: false })
  })

  it('never sets bit 15 for a non-boolean type', () => {
    strictEqual(head({ name: 'Node_LifeSpan', type: PropertyType.Float, value: -1 }).type, 0x0003)
  })

  it('round-trips integers, floats and strings', () => {
    const properties: Property[] = [
      { name: 'Emitter_MaxParticles', type: PropertyType.Integer, value: -7 },
      { name: 'Node_LifeSpan', type: PropertyType.Float, value: Math.fround(0.75) },
      { name: 'Node_Name', type: PropertyType.String, value: 'my_node' },
    ]

    for (const property of properties) deepStrictEqual(roundtrip(property), property)
  })

  it('round-trips blending, transforms and animated values', () => {
    const properties: Property[] = [
      {
        name: 'BasicApp_BlendInfo',
        type: PropertyType.Blending,
        source: BlendingMode.SourceAlpha,
        target: BlendingMode.One,
      },
      {
        name: 'Node_Transform',
        type: PropertyType.Transform,
        flags: TransformFlags.Default,
        position: undefined,
        rotation: undefined,
        scale: undefined,
      },
      {
        name: 'BasicApp_Size',
        type: PropertyType.AnimatedFloat,
        easing: EaseType.Linear,
        keyframes: [{ key: 0, easing: EaseType.Step, keyframes: [{ key: 0, value: 1 }] }],
      },
      {
        name: 'BasicApp_Color',
        type: PropertyType.AnimatedColor,
        easing: EaseType.Linear,
        keyframes: [
          { key: 0, easing: EaseType.Step, keyframes: [{ key: 0, value: { x: 1, y: 1, z: 1 } }] },
        ],
      },
      {
        name: 'Emitter_Frequency',
        type: PropertyType.AnimatedCurve,
        easing: EaseType.Linear,
        keyframes: [
          {
            key: 0,
            default: 0,
            flags: WrapFlags.AfterRepeat,
            keyframes: [{ key: 0, value: { x: 1, y: 0, z: 0 } }],
          },
        ],
      },
    ]

    for (const property of properties) deepStrictEqual(roundtrip(property), property)
  })

  it('rejects a type the format does not define', () => {
    throws(() => readProperty(BufferView.allocate(6).writeUint16(0x300).rewind()), RangeError)
  })

  it('leaves the view on the next property', () => {
    const first: Property = { name: 'Node_Name', type: PropertyType.String, value: 'a' }
    const second: Property = { name: 'Node_LifeSpan', type: PropertyType.Float, value: 2 }

    const view = BufferView.join(
      writeProperty(first),
      writeProperty(second),
      BufferView.allocate(2),
    )

    deepStrictEqual(readProperty(view), first)
    deepStrictEqual(readProperty(view), second)
    strictEqual(readProperty(view), null)
  })
})
