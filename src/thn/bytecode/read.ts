import type { Document, Entry, Value } from '../types.js'
import { identifier, number, string } from '../value.js'
import BufferView from '../../utility/bufferview.js'
import { decode } from '../../utility/encoding.js'
import {
  ConstantTag,
  GAP_BYTE_LENGTH,
  HEADER_BYTE_LENGTH,
  OPCODES,
  SIGNATURE,
  VERSION,
} from './data.js'

/**
 * Whether a buffer is a compiled chunk rather than script text.
 *
 * The signature decides, never the extension: the engine loads scripts with `dofile`, and Lua's
 * loader sniffs the same five bytes and falls back to compiling source text when they are absent.
 * A plain-text `.thn` is therefore as valid as a compiled one — see [THN.md](../../../docs/THN.md).
 *
 * @param data File bytes.
 */
export const isBytecode = (data: ArrayBufferView | ArrayBufferLike): boolean => {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)

  return bytes.length >= SIGNATURE.length && SIGNATURE.every((byte, i) => bytes[i] === byte)
}

/** One decoded instruction. `a` is the first operand, `c` the count operand where one is carried. */
interface Instruction {
  readonly name: string
  readonly a: number
  readonly c: number
}

/**
 * Reads a compiled Lua 3.2 chunk into a script.
 *
 * This is an **evaluator, not a decompiler**, and it can be because a THN has no control flow: the
 * fifteen opcodes retail uses all either push a value or fill a table, so running them on a value
 * stack yields the literal the source was. Anything outside those fifteen throws rather than being
 * approximated — a script carrying a branch or a call is not this format, and silently dropping the
 * instruction would produce a plausible wrong answer.
 *
 * @param data File bytes.
 * @throws RangeError when the signature, structure or an opcode is not what this format allows.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike): Document => {
  if (!isBytecode(data)) throw new RangeError('Not a compiled Lua chunk')

  const view = ArrayBuffer.isView(data)
    ? new BufferView(data.buffer, data.byteOffset, data.byteLength, 0, false)
    : new BufferView(data, undefined, undefined, 0, false)

  const version = view.getUint8(SIGNATURE.length - 1)
  if (version !== VERSION)
    throw new RangeError(`Lua version 0x${version.toString(16)} is not 0x${VERSION.toString(16)}`)

  // Walk the code first rather than trusting the header's length field: that derives where the
  // constant pool starts instead of assuming it, and the walk has to happen anyway.
  view.offset = HEADER_BYTE_LENGTH

  const code: Instruction[] = []

  for (;;) {
    const byte = view.readUint8()
    const opcode = OPCODES[byte]

    if (!opcode)
      throw new RangeError(`Opcode ${byte} at ${view.offset - 1} is not a Lua 3.2 opcode`)

    const { name, width, count } = opcode
    const a = width === 2 ? view.readUint16() : width === 1 ? view.readUint8() : 0

    code.push({ name, a, c: count ? view.readUint8() : 0 })

    if (name === 'ENDCODE') break
  }

  view.offset += GAP_BYTE_LENGTH

  const constants: Value[] = []
  const total = view.readUint32()

  for (let index = 0; index < total; index++) {
    const tag = view.readUint8()

    switch (tag) {
      // A number, as decimal ASCII with a byte length and no terminator. Kept as its literal.
      case ConstantTag.Number: {
        const length = view.readUint8()
        constants.push(number(decode(view.bytes.subarray(view.offset, view.offset + length))))
        view.offset += length
        break
      }

      // A string, with a big-endian length that counts the NUL that follows it.
      case ConstantTag.String: {
        const length = view.readUint32()
        constants.push(string(decode(view.bytes.subarray(view.offset, view.offset + length - 1))))
        view.offset += length
        break
      }

      default:
        throw new RangeError(
          `Constant tag ${tag} at ${view.offset - 1} is not a number or a string`,
        )
    }
  }

  // A pool that does not end at EOF means the walk desynchronised somewhere upstream and happened
  // to land on a plausible tag, so this is the check that the whole read was in step.
  if (view.offset !== view.byteLength)
    throw new RangeError(`Constant pool ends at ${view.offset}, file is ${view.byteLength} bytes`)

  return evaluate(code, constants)
}

/** Runs the instruction stream on a value stack. */
const evaluate = (code: readonly Instruction[], constants: readonly Value[]): Document => {
  const constant = (index: number): Value => {
    const value = constants[index]
    if (!value) throw new RangeError(`Constant ${index} is out of range`)
    return value
  }

  const name = (index: number): string => {
    const value = constant(index)
    if (value.type !== 'string') throw new RangeError(`Constant ${index} is not a name`)
    return value.value
  }

  const stack: Value[] = []

  const table = (): { array: Value[]; entries: Entry[] } => {
    const value = stack.at(-1)
    if (value?.type !== 'table') throw new RangeError('Expected a table on the stack')
    return value
  }

  const document: Document = []

  for (const { name: op, a, c } of code) {
    switch (op) {
      case 'PUSHNUMBER':
      case 'PUSHNUMBERW':
        stack.push(number(a))
        break

      case 'PUSHNUMBERNEG':
      case 'PUSHNUMBERNEGW':
        stack.push(number(-a))
        break

      case 'PUSHCONSTANT':
      case 'PUSHCONSTANTW':
        stack.push(constant(a))
        break

      // A global *read* — `type = SCENE` is this, and not the string `"SCENE"`.
      case 'GETGLOBAL':
      case 'GETGLOBALW':
        stack.push(identifier(name(a)))
        break

      case 'CREATEARRAY':
      case 'CREATEARRAYW':
        stack.push({ type: 'table', array: [], entries: [] })
        break

      // The `a` operand is a flush offset, and is ignorable: a constructor fills in order, so
      // appending the `c` values below the offset is the same table.
      case 'SETLIST':
      case 'SETLISTW': {
        // Take the values off first: the table is below them, and is only on top once they are gone.
        const values = stack.splice(stack.length - c, c)
        table().array.push(...values)
        break
      }

      // The operand is **pairs minus one** — `SETMAP 2` follows three key/value pairs. The header
      // does not say so; it was measured against retail.
      case 'SETMAP': {
        const values = stack.splice(stack.length - (a + 1) * 2)
        const { entries } = table()

        for (let i = 0; i < values.length; i += 2)
          entries.push({ key: values[i]!, value: values[i + 1]! })

        break
      }

      case 'SETGLOBAL':
      case 'SETGLOBALW': {
        const value = stack.pop()
        if (!value) throw new RangeError('Assignment with an empty stack')
        document.push({ name: name(a), value })
        break
      }

      // `+`, which is only ever set union over flags.
      case 'ADDOP': {
        const right = stack.pop()
        const left = stack.pop()

        if (left?.type !== 'identifier' || right?.type !== 'identifier')
          throw new RangeError('`+` over something that is not an identifier')

        stack.push(identifier(...left.names, ...right.names))
        break
      }

      // Debug line markers. Retail carries none, and they carry no value either way.
      case 'SETLINE':
      case 'SETLINEW':
      case 'ENDCODE':
        break

      default:
        throw new RangeError(`Opcode ${op} is not one a scene script is made of`)
    }
  }

  if (stack.length) throw new RangeError(`${stack.length} values left on the stack`)

  return document
}
