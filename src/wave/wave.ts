import BufferView from '#/utility/bufferview.js'
import type { Wave } from './types.js'

/** `RIFF` size field plus the `WAVE` form type. */
const HEADER_BYTE_LENGTH = 12

/** A chunk's id and size. */
const CHUNK_HEADER_BYTE_LENGTH = 8

/** Through `BufferView.from`, which also takes a UTF `File` — an `ArrayBufferView` only structurally. */
const bytesOf = (source: ArrayBufferView | ArrayBufferLike): Uint8Array =>
  BufferView.from(source as ArrayBufferLike).bytes

const fourCC = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)

interface Layout {
  /** Each chunk's id, payload offset and payload length. */
  chunks: [id: string, offset: number, length: number][]

  /** Where the last chunk's payload ends. */
  last: number

  /** Where the RIFF size says the file ends. */
  end: number
}

/**
 * Walks the chunk list without copying anything, so {@link isWave} and {@link readWave} agree by
 * construction.
 *
 * An odd chunk's pad byte is skipped only when another chunk follows it. The last one is left to
 * {@link Wave.padding}, which is how the 13,086 retail files whose odd `data` chunk ends the file
 * with no pad at all come back unchanged.
 */
function layout(bytes: Uint8Array): Layout {
  if (
    bytes.byteLength < HEADER_BYTE_LENGTH ||
    fourCC(bytes, 0) !== 'RIFF' ||
    fourCC(bytes, 8) !== 'WAVE'
  )
    throw new TypeError('Not a RIFF/WAVE file')

  const view = BufferView.from(bytes)
  const end = CHUNK_HEADER_BYTE_LENGTH + view.getUint32(4, true)
  if (end > bytes.byteLength || end < HEADER_BYTE_LENGTH)
    throw new RangeError(`RIFF size runs to ${end}, file is ${bytes.byteLength} bytes`)

  const chunks: Layout['chunks'] = []
  let offset = HEADER_BYTE_LENGTH

  while (end - offset >= CHUNK_HEADER_BYTE_LENGTH) {
    const id = fourCC(bytes, offset)
    const length = view.getUint32(offset + 4, true)
    const start = offset + CHUNK_HEADER_BYTE_LENGTH

    if (start + length > end)
      throw new RangeError(`Chunk '${id}' at ${offset} runs past the RIFF end at ${end}`)

    chunks.push([id, start, length])
    offset = start + length

    if (length & 1 && end - offset > CHUNK_HEADER_BYTE_LENGTH) offset++
  }

  return { chunks, last: offset, end }
}

/** Whether {@link readWave} accepts the bytes. */
export function isWave(source: ArrayBufferView | ArrayBufferLike): boolean {
  try {
    layout(bytesOf(source))
    return true
  } catch {
    return false
  }
}

/**
 * Reads a RIFF/WAVE file into its chunks, copying each payload.
 *
 * Nothing is interpreted: a chunk is an id and bytes, whatever the id. {@link readWaveform} is
 * what reads the ones the game does.
 *
 * @throws TypeError on anything that is not `RIFF` … `WAVE`.
 * @throws RangeError when the RIFF size or a chunk size runs past what is there.
 */
export function readWave(source: ArrayBufferView | ArrayBufferLike): Wave {
  const bytes = bytesOf(source)
  const { chunks, last, end } = layout(bytes)

  const wave: Wave = {
    chunks: chunks.map(([id, offset, length]) => ({
      id,
      data: bytes.slice(offset, offset + length),
    })),
  }

  if (last < end) wave.padding = bytes.slice(last, end)
  if (end < bytes.byteLength) wave.trailing = bytes.slice(end)

  return wave
}

/**
 * Writes a RIFF/WAVE file.
 *
 * Every odd chunk but the last is padded, and the RIFF size counts the chunks and
 * {@link Wave.padding} but not {@link Wave.trailing} — the inverse of {@link readWave}, so a file
 * read from retail writes back byte for byte.
 *
 * @throws RangeError on a chunk id that is not four Latin-1 characters.
 */
export function writeWave({ chunks: list, padding, trailing }: Wave): BufferView<ArrayBuffer> {
  const size = list.reduce(
    (sum, { data }, index) =>
      sum +
      CHUNK_HEADER_BYTE_LENGTH +
      data.byteLength +
      (index < list.length - 1 ? data.byteLength & 1 : 0),
    4 + (padding?.byteLength ?? 0),
  )

  const view = BufferView.allocate(CHUNK_HEADER_BYTE_LENGTH + size + (trailing?.byteLength ?? 0))
  const bytes = view.bytes

  const setFourCC = (offset: number, id: string) => {
    if (id.length !== 4 || /[^\x00-\xff]/.test(id))
      throw new RangeError(`Chunk id '${id}' is not four Latin-1 characters`)

    for (let i = 0; i < 4; i++) bytes[offset + i] = id.charCodeAt(i)
  }

  setFourCC(0, 'RIFF')
  view.setUint32(4, size, true)
  setFourCC(8, 'WAVE')

  let offset = HEADER_BYTE_LENGTH

  list.forEach(({ id, data }, index) => {
    setFourCC(offset, id)
    view.setUint32(offset + 4, data.byteLength, true)
    bytes.set(data, offset + CHUNK_HEADER_BYTE_LENGTH)
    offset += CHUNK_HEADER_BYTE_LENGTH + data.byteLength
    if (index < list.length - 1) offset += data.byteLength & 1
  })

  if (padding) {
    bytes.set(padding, offset)
    offset += padding.byteLength
  }

  if (trailing) bytes.set(trailing, offset)

  return view
}
