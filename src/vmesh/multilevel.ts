import Directory from '#/directory.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from './part.js'

export interface MultiLevel {
  type: 'multilevel'
  ranges: number[]
  levels: VMeshPart[]
}

export function atRange({ ranges, levels }: MultiLevel, value: number): VMeshPart | undefined {
  for (let i = 0, l = ranges.length - 1, min: number, max: number; i < l; i++) {
    min = ranges[i] ?? 0
    max = ranges[i + 1] ?? Infinity

    if (value >= min && value < max) return levels[i]
  }

  return
}

export function readMultiLevel(parent: Directory): MultiLevel | undefined {
  const directory = parent.getDirectory('MultiLevel')
  if (!directory) return

  const levels: VMeshPart[] = []
  const ranges: number[] = [...(directory.getFile('Switch2')?.readFloats() ?? [0, 1000])]

  for (let i = 0; ; i++) {
    const level = directory.getDirectory(`Level${i}`)
    if (!level) break

    const part = readVMeshPart(level)
    if (!part) break

    levels[i] = part
  }

  return { type: 'multilevel', ranges, levels }
}

export function writeMultiLevel({ ranges, levels }: MultiLevel): Directory {
  const directory = new Directory('MultiLevel')

  directory.setFile('Switch2').writeFloats(...ranges)

  for (let i = 0; i < levels.length; i++)
    directory.setDirectory(`Level${i}`).children.push(writeVMeshPart(levels[i]!))

  return directory
}
