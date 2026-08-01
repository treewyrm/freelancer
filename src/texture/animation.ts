import Directory from '#/directory.js'
import File from '#/file.js'
import BufferView from '#/utility/bufferview.js'

export interface AnimatedTextureFrame {
  /** Texture image index. */
  index: number

  /** Start point U coordinate. */
  u1: number

  /** Start point V coordinate. */
  v1: number

  /** End point U coordinate. */
  u2: number

  /** End point V coordinate. */
  v2: number
}

export interface AnimatedTexture {
  /** Actual texture atlases will match name with _N suffix where N is atlas index referenced in frame. */
  name: string

  type: 'animated'

  /** Animation frames (read 'Frame count' to know how many). */
  frames: AnimatedTextureFrame[]

  /** Frame rate per second. */
  rate: number
}

const frameByteLength = Int32Array.BYTES_PER_ELEMENT + Float32Array.BYTES_PER_ELEMENT * 4

export const readAnimatedTexture = (parent: Directory): AnimatedTexture | undefined => {
  const fps = parent.getFile('FPS')
  const rate = fps ? BufferView.from(fps.data).readFloat32() : 15
  if (!rate) return

  const count = parent.getFile('Frame count')
  const frameCount = count ? BufferView.from(count.data).readInt32() : 0
  if (!frameCount) return

  const file = parent.getFile('Frame rects')
  if (!file) return

  const frames: AnimatedTextureFrame[] = []

  if (file) {
    const view = BufferView.from(file.data)

    for (let i = 0; i < frameCount; i++) {
      frames[i] = {
        index: view.readInt32(),
        u1: view.readFloat32(),
        v1: view.readFloat32(),
        u2: view.readFloat32(),
        v2: view.readFloat32(),
      }
    }
  }

  return { name: parent.name, type: 'animated', rate, frames }
}

/**
 * Number of sibling atlases the frames index into, written back as `Texture count`.
 *
 * Derived rather than modelled: across all twelve retail animations it is exactly one more than
 * the highest frame index, and the atlases it counts are the sibling entries named
 * `<name>_<index>`, so carrying it on {@link AnimatedTexture} would only offer a way to disagree
 * with the frames.
 */
export const getTextureCount = ({ frames }: AnimatedTexture): number =>
  frames.reduce((highest, { index }) => Math.max(highest, index + 1), 0)

export function writeAnimatedTexture(texture: AnimatedTexture): Directory {
  const textures = new File('Texture count').writeIntegers(getTextureCount(texture))
  const count = new File('Frame count').writeIntegers(texture.frames.length)
  const fps = new File('FPS').writeFloats(texture.rate)
  const view = BufferView.allocate(frameByteLength * texture.frames.length)

  for (const { index, u1, v1, u2, v2 } of texture.frames)
    view.writeInt32(index).writeFloat32(u1).writeFloat32(v1).writeFloat32(u2).writeFloat32(v2)

  // Rewound because BufferView.from copies the offset: a view left at its end reads back empty.
  const rects = new File('Frame rects', view.rewind())

  return new Directory(texture.name, [textures, count, fps, rects])
}
