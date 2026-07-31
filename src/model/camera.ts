import Directory from '#/directory.js'

export interface Camera {
  type: 'camera'
  fovX: number
  fovY: number
  zNear: number
  zFar: number
}

export const isCamera = (directory: Directory) => !!directory.getFile('Fovx')

export function readCamera(directory: Directory): Camera {
  // TODO: Make readCamera function.

  return {
    type: 'camera',
    fovX: 90,
    fovY: 90,
    zNear: 1,
    zFar: 1000,
  }
}

export function writeCamera(camera: Camera): Directory {
  // TODO: Make writeCamera function.

  return new Directory()
}
