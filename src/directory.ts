import BufferView from './utility/bufferview.js'
import Dictionary from './utility/dictionary.js'
import File from './file.js'
import { getResource, type Hashable, setResource } from './hash.js'
import { fromDOSTimestamp, fromFileTime, toDOSTimestamp, toFileTime } from './utility/timestamp.js'
import { toHex } from './utility/string.js'
import { type Entry } from './types.js'

interface ReadQueueItem {
  /** Entry offset. */
  offset: number

  /** Parent directory. */
  parent?: Directory
}

interface WriteQueueItem {
  /** Queue iteration value. */
  target: Directory | File

  /** Entry to fill. */
  entry: Partial<Entry>

  /** Parent entry (only for first child). */
  parent?: Partial<Entry>

  /** Previous entry (in subsequent children). */
  previous?: Partial<Entry>
}

/** UTF structure directory.  */
export default class Directory {
  /** Header signature bytes. */
  static readonly SIGNATURE = 0x20465455

  /** Header version. It's the only known version. */
  static readonly VERSION = 0x101

  /** File attribute. */
  static readonly FILE = 0x80

  /** Directory attribute. */
  static readonly DIRECTORY = 0x10

  /** Entry byte length. */
  static readonly ENTRY_BYTE_LENGTH = 0x2c

  /** Version byte length. */
  static readonly VERSION_BYTE_LENGTH = 0x8

  /** Header byte length. */
  static readonly HEADER_BYTE_LENGTH = 0x30

  constructor(
    /** Directory name. */
    public name = '\\',

    /** Directory children. */
    public children: (Directory | File)[] = [],
  ) {}

  /** Subdirectories. */
  get directories(): Directory[] {
    return this.children.filter((value) => value instanceof Directory)
  }

  /** Files. */
  get files(): File[] {
    return this.children.filter((value) => value instanceof File)
  }

  /**
   * Gets existing directory at path.
   * @param path Path to directory relative to this directory
   * @returns
   */
  getDirectory(...path: Hashable[]): Directory | undefined {
    let parent: Directory = this
    let child: Directory | undefined
    let name: Hashable | undefined

    while (parent && (name = path.shift()))
      if ((child = getResource(parent.directories, ({ name }) => name, name))) parent = child
      else return

    return parent
  }

  /**
   * Gets existing directory or inserts a new directory at path.
   * @param path Path to directory relative to this directory
   * @returns
   */
  setDirectory(...path: string[]): Directory {
    let parent: Directory = this
    let name: string | undefined

    while ((name = path.shift())) {
      let child = getResource(parent.directories, ({ name }) => name, name)
      if (!child) parent.children.push((child = new Directory(name)))

      parent = child
    }

    return parent
  }

  /**
   * Gets existing file at path.
   * @param path Path to file relative to this directory
   * @returns
   */
  getFile(...path: Hashable[]): File | undefined {
    const name = path.at(-1)
    if (!name) return

    const parent = this.getDirectory(...path.slice(0, -1))
    if (!parent) return

    return getResource(parent.files, ({ name }) => name, name)
  }

  /**
   * Gets existing file or inserts a new empty file at path.
   * @param path Path to file relative to this directory
   * @returns
   */
  setFile(...path: string[]): File {
    const name = path.at(-1)
    if (!name) throw new RangeError('Missing file name')

    const parent = this.setDirectory(...path.slice(0, -1))

    let file = getResource(parent.files, ({ name }) => name, name)
    if (!file) parent.children.push((file = new File(name)))

    return file
  }

  /**
   * Deletes entry at path.
   * @param path Path to entry relative to this directory
   * @returns
   */
  delete(...path: string[]): this {
    const name = path.at(-1)?.toLowerCase()
    if (!name) return this

    const parent = this.getDirectory(...path.slice(0, -1))
    if (!parent) return this

    let index: number

    while ((index = parent.children.findIndex((child) => child.name.toLowerCase() === name)) >= 0)
      parent.children.splice(index, 1)

    return this
  }

  /**
   * Appends directories and files replacing existing entries.
   * @param values
   */
  append(...values: (Directory | File)[]): this {
    for (const value of values) setResource(this.children, ({ name }) => name, value)
    return this
  }

  /**
   * Reads directory hierarchy from ArrayBuffer.
   * @param buffer Input buffer
   * @returns Root directory
   */
  static read(view: BufferView): Directory {
    const signature = view.readUint32()
    const version = view.readUint32()

    if (signature !== this.SIGNATURE) throw new Error(`Invalid header: ${toHex(signature)}`)
    if (version !== this.VERSION) throw new RangeError(`Invalid version: ${version}`)

    const treeOffset = view.readUint32()
    const treeSize = view.readUint32()
    const entryOffset = view.readUint32()
    const entrySize = view.readUint32()
    const namesOffset = view.readUint32()
    const namesSizeAllocated = view.readUint32()
    const namesSizeUsed = view.readUint32()
    const dataOffset = view.readUint32()
    const unusedOffset = view.readUint32()
    const unusedSize = view.readUint32()
    const filetime = fromFileTime(view.readBigUint64())

    if (entrySize !== this.ENTRY_BYTE_LENGTH)
      throw new RangeError(`Invalid entry byte length: ${entrySize}`)
    if (treeOffset > view.byteLength)
      throw new RangeError(`Tree offset is out of bounds: ${treeOffset}`)
    if (namesOffset > view.byteLength)
      throw new RangeError(`Dictionary offset is out of bounds: ${namesOffset}`)
    if (dataOffset > view.byteLength)
      throw new RangeError(`Data offset is out of bounds: ${dataOffset}`)

    const names = view.slice(namesOffset, namesOffset + namesSizeUsed)

    /** Entry queue. */
    const queue: ReadQueueItem[] = [{ offset: entryOffset }]

    /** Root directory. */
    let root: Directory | undefined

    const offsets = new Set<number>()

    while (queue.length > 0) {
      const { offset, parent } = queue.shift()!

      // Read entry from tree.
      if (offset > treeSize) throw new RangeError(`Entry offset is out of bounds: ${offset}`)

      view.offset = treeOffset + offset

      const nextOffset = view.readUint32()
      const nameOffset = view.readUint32()
      const fileAttributes = view.readUint32()
      const sharingAttributes = view.readUint32()
      const childOffset = view.readUint32()
      const dataSizeAllocated = view.readUint32()
      const dataSizeUsed = view.readUint32()
      const dataSizeUncompressed = view.readUint32()
      const createTime = fromDOSTimestamp(view.readUint32())
      const accessTime = fromDOSTimestamp(view.readUint32())
      const modifyTime = fromDOSTimestamp(view.readUint32())

      if (dataSizeUsed > dataSizeAllocated) throw new RangeError('')
      if (dataSizeUncompressed > dataSizeUsed) throw new Error('Compression unsupported')

      names.offset = nameOffset
      const name = names.readStringZ()

      if (offsets.has(offset)) throw new RangeError(`Tree recursion detected at entry: ${name}`)
      offsets.add(offset)

      // Add next sibling to queue (excluding root).
      if (parent && nextOffset > 0) queue.push({ offset: nextOffset, parent })

      if (fileAttributes & this.FILE && parent) {
        const start = dataOffset + childOffset
        const end = start + dataSizeUsed
        const buffer = view.buffer.slice(view.byteOffset + start, view.byteOffset + end)

        parent.children.push(new File(name, new Uint8Array(buffer)))
      } else if (fileAttributes & this.DIRECTORY) {
        const directory = new this(name)

        // Attach to parent or set root.
        parent ? parent.children.push(directory) : (root ??= directory)

        // Directory has a child.
        if (childOffset > 0) queue.push({ offset: childOffset, parent: directory })
      }
    }

    if (!root) throw new Error('Root directory not found')
    return root
  }

  /**
   * Outputs directory as array buffer.
   * @returns
   */
  write(): BufferView {
    const entrySize = Directory.ENTRY_BYTE_LENGTH

    const now = new Date()

    /** Accmulated tree size. */
    let treeSize = 0

    /** Accumulated file data size. */
    let dataSize = 0

    /** Array of arranged tree entries. */
    const entries: Partial<Entry>[] = []

    /** Entry names dictionary. */
    const names = new Dictionary()

    /** Array of arranged files for data block. */
    const files: File[] = []

    /** Queue of entries of process. */
    const queue: WriteQueueItem[] = [{ target: this, entry: {} }]

    /** Recursion check set. */
    const targets = new Set<Directory | File>()

    while (queue.length > 0) {
      const { entry, target, parent, previous } = queue.shift()!

      if (targets.has(target)) throw new Error(`Tree recursion detected on entry: ${target.name}`)
      targets.add(target)

      if (!target.name.length) continue
      entry.nameOffset = names.push(target.name)

      if (target instanceof File) {
        if (!(target.buffer instanceof ArrayBuffer))
          throw new TypeError(`Invalid buffer type in file ${target.name}`)

        entry.fileAttributes = Directory.FILE
        entry.childOffset = dataSize
        entry.dataSizeAllocated =
          entry.dataSizeUsed =
          entry.dataSizeUncompressed =
            target.byteLength

        files.push(target)
        dataSize += target.byteLength
      } else {
        entry.fileAttributes = Directory.DIRECTORY

        let last: Partial<Entry> | undefined

        // First child is childOffset and subsequent children are siblings.
        for (const child of target.children)
          last
            ? queue.push({ target: child, previous: last, entry: (last = {}) })
            : queue.unshift({ target: child, entry: (last = {}), parent: entry })
      }

      // First child updates parent.
      if (parent) parent.childOffset = treeSize

      // Subsequent child updates previous.
      if (previous) previous.nextOffset = treeSize

      treeSize += entrySize
      entries.push(entry)
    }

    const namesSize = names.byteLength

    // Some older files have dictionary preceeding entries tree.

    /** Tree follows version and header. */
    const treeOffset = Directory.VERSION_BYTE_LENGTH + Directory.HEADER_BYTE_LENGTH

    /** Dictionary follows entry list. */
    const namesOffset = treeOffset + treeSize

    /** Data follows dictionary. */
    const dataOffset = namesOffset + namesSize

    const version = BufferView.allocate(Directory.VERSION_BYTE_LENGTH)
      .writeUint32(Directory.SIGNATURE)
      .writeUint32(Directory.VERSION)

    const header = BufferView.allocate(Directory.HEADER_BYTE_LENGTH)
      .writeUint32(treeOffset)
      .writeUint32(treeSize)
      .writeUint32(0)
      .writeUint32(Directory.ENTRY_BYTE_LENGTH)
      .writeUint32(namesOffset ?? 0)
      .writeUint32(namesSize ?? 0)
      .writeUint32(namesSize ?? 0)
      .writeUint32(dataOffset ?? 0)
      .writeUint32(0)
      .writeUint32(0)
      .writeBigUint64(toFileTime(now))

    const tree = entries.map(
      ({
        nextOffset = 0,
        nameOffset = 0,
        fileAttributes = 0,
        sharingAttributes = 0,
        childOffset = 0,
        dataSizeAllocated = 0,
        dataSizeUsed = 0,
        dataSizeUncompressed = 0,
        createTime = now,
        accessTime = now,
        modifyTime = now,
      }) =>
        BufferView.allocate(entrySize)
          .writeUint32(nextOffset)
          .writeUint32(nameOffset)
          .writeUint32(fileAttributes)
          .writeUint32(sharingAttributes)
          .writeUint32(childOffset)
          .writeUint32(dataSizeAllocated)
          .writeUint32(dataSizeUsed)
          .writeUint32(dataSizeUncompressed)
          .writeUint32(toDOSTimestamp(createTime))
          .writeUint32(toDOSTimestamp(accessTime))
          .writeUint32(toDOSTimestamp(modifyTime)),
    )

    return BufferView.join(version, header, ...tree, names, ...files)
  }
}
