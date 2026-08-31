import Directory from '#/utf/directory.js'

/**
 * Camera part of a compound model, used by cockpit models for the view the pilot looks through.
 *
 * The fragment holds nothing but the `Camera` directory — no geometry, no hardpoints. Its place in
 * the model comes from the constraint attaching it to the part it is mounted on.
 */
export interface Camera {
  type: 'camera'

  /** Horizontal half-angle, in radians. */
  fovX: number

  /** Vertical half-angle, in radians. `tan(fovX) / tan(fovY)` is the aspect ratio. */
  fovY: number

  /** Near clipping plane distance. */
  zNear: number

  /** Far clipping plane distance. */
  zFar: number
}

/** Whether a part fragment is a camera rather than geometry. */
export const isCamera = (directory: Directory) => !!directory.getDirectory('Camera')

function readValue(directory: Directory, name: string): number {
  const [value] = directory.getFile(name)?.readFloats() ?? []
  if (value === undefined) throw new Error(`Missing ${name} in Camera`)

  return value
}

/**
 * Reads a `Camera` fragment. Every field is required — the game has no default for a frustum, and a
 * missing one would silently become zero.
 * @throws Error when the directory or any of the four fields is absent.
 */
export function readCamera(parent: Directory): Camera {
  const directory = parent.getDirectory('Camera')
  if (!directory) throw new Error('Missing Camera')

  return {
    type: 'camera',
    fovX: readValue(directory, 'Fovx'),
    fovY: readValue(directory, 'Fovy'),
    zNear: readValue(directory, 'Znear'),
    zFar: readValue(directory, 'Zfar'),
  }
}

/** Writes a `Camera` directory, in the capitalization retail uses (`Fovx`, not `FovX`). */
export function writeCamera({ fovX, fovY, zNear, zFar }: Camera): Directory {
  const directory = new Directory('Camera')

  directory.setFile('Fovx').writeFloats(fovX)
  directory.setFile('Fovy').writeFloats(fovY)
  directory.setFile('Znear').writeFloats(zNear)
  directory.setFile('Zfar').writeFloats(zFar)

  return directory
}
