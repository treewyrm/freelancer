import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import Matrix3 from '#/math/matrix3.js'

/** Fixed joint. Cannot be animated. */
interface Fixed {
  type: 'fixed'
  position: Vector3
  rotation: Matrix3
}

/** Revolute joint. Fixed axis rotation constraint. Animation controls angle between min/max. */
interface Revolute {
  type: 'revolute'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  rotation: Matrix3
  axis: Vector3
  min: number
  max: number
}

/** Prismatic joint. Fixed axis movement constraint. Animation controls offset between min/max. */
interface Prismatic {
  type: 'prismatic'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  rotation: Matrix3
  axis: Vector3
  min: number
  max: number
}

/**
 * Cylinder joint. Fixed axis rotation and movement constraint — a revolute and a prismatic joint
 * sharing one axis, hence the two limit pairs.
 *
 * The layout is `struct Cyl` from Conquest: Frontier Wars, Digital Anvil's earlier game, which
 * uses the same UTF container and whose compound and animation layer Freelancer inherited nearly
 * unchanged (`Libs/Include/PERSISTCOMPOUND.H`). Its record is 216 bytes: the two 64-byte names,
 * then `parent_point`, `child_point`, `rel_orientation`, `axis`, and the limits in the order
 * below — translation before rotation.
 *
 * > The comment on `JointInfo::min0` in CFW's `JointInfo.h` has the two limit pairs the other way
 * > round. The struct field names and `Compound.cpp`, which assigns `min0 = min_trans`, agree with
 * > each other against it, so the comment is the odd one out.
 *
 * The record reads and writes, but no retail model ships one, so it has never been exercised
 * against real data. **Animating** a cylinder remains impossible: its two driven floats have no
 * representation in the channel type bitfield — see `ChannelType` in `animation/channel.ts`. CFW
 * never animated one either, its exporter having no cylinder branch at all.
 */
interface Cylinder {
  type: 'cylinder'

  /** `parent_point` — point of contact on the parent, in parent frame. */
  position: Vector3

  /** `child_point` — point of contact on the child, in child frame. */
  offset: Vector3

  /** `rel_orientation`. */
  rotation: Matrix3

  /** Unit axis shared by both degrees of freedom, in parent frame. */
  axis: Vector3

  /** `min_trans`/`max_trans` — travel limits along {@link axis}, in metres. */
  minPris: number
  maxPris: number

  /** `min_rot`/`max_rot` — rotation limits about {@link axis}, in radians. */
  minRev: number
  maxRev: number
}

/** Sphere/ball joint. Rotation constraint. Animation controls rotation by quat. */
interface Sphere {
  type: 'sphere'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  rotation: Matrix3
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/** Loose joint. Unconstrainted. Animation controls free motion by vector3 + quat/matrix3. */
interface Loose {
  type: 'loose'
  position: Vector3
  rotation: Matrix3
}

/** Compound object child to parent connection joint. */
export type Joint = Fixed | Revolute | Prismatic | Cylinder | Sphere | Loose

/** Reads a `Fix` payload from a cursor already past the record's two name fields. */
export function readFixed(view: BufferView): Fixed {
  return {
    type: 'fixed',
    position: Vector3.read(view),
    rotation: Matrix3.read(view),
  }
}

/** Writes a `Fix` payload, for a caller to prepend the two name fields to. */
export function writeFixed(fixed: Fixed): BufferView {
  const { position, rotation } = fixed

  return BufferView.join(Vector3.write(position), Matrix3.write(rotation))
}

/** Reads a `Rev` payload from a cursor already past the record's two name fields. */
export function readRevolute(view: BufferView): Revolute {
  return {
    type: 'revolute',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    rotation: Matrix3.read(view),
    axis: Vector3.read(view),
    min: view.readFloat32(),
    max: view.readFloat32(),
  }
}

/** Writes a `Rev` payload, for a caller to prepend the two name fields to. */
export function writeRevolute(revolute: Revolute): BufferView {
  const { position, offset, rotation, axis, min, max } = revolute

  const limits = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(min)
    .writeFloat32(max)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(rotation),
    Vector3.write(axis),
    limits,
  )
}

/** Reads a `Pris` payload from a cursor already past the record's two name fields. */
export function readPrismatic(view: BufferView): Prismatic {
  return {
    type: 'prismatic',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    rotation: Matrix3.read(view),
    axis: Vector3.read(view),
    min: view.readFloat32(),
    max: view.readFloat32(),
  }
}

/** Writes a `Pris` payload, for a caller to prepend the two name fields to. */
export function writePrismatic(prismatic: Prismatic): BufferView {
  const { position, offset, rotation, axis, min, max } = prismatic

  const limit = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(min)
    .writeFloat32(max)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(rotation),
    Vector3.write(axis),
    limit,
  )
}

/** Reads a `Cyl` record, whose 176-byte payload is a `Rev` with a second limit pair appended. */
export function readCylinder(view: BufferView): Cylinder {
  return {
    type: 'cylinder',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    rotation: Matrix3.read(view),
    axis: Vector3.read(view),
    minPris: view.readFloat32(),
    maxPris: view.readFloat32(),
    minRev: view.readFloat32(),
    maxRev: view.readFloat32(),
  }
}

/**
 * Writes a `Cyl` payload, for a caller to prepend the two name fields to. Translation limits
 * precede rotation limits, following CFW's `struct Cyl` rather than the comment in its header.
 */
export function writeCylinder(cylinder: Cylinder): BufferView {
  const { position, offset, rotation, axis, minPris, maxPris, minRev, maxRev } = cylinder

  const limits = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
    .writeFloat32(minPris)
    .writeFloat32(maxPris)
    .writeFloat32(minRev)
    .writeFloat32(maxRev)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(rotation),
    Vector3.write(axis),
    limits,
  )
}

/**
 * Reads a `Sphere` payload from a cursor already past the record's two name fields. The six limits
 * are per axis and interleaved min-then-max, not two vectors.
 */
export function readSphere(view: BufferView): Sphere {
  return {
    type: 'sphere',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    rotation: Matrix3.read(view),
    minX: view.readFloat32(),
    maxX: view.readFloat32(),
    minY: view.readFloat32(),
    maxY: view.readFloat32(),
    minZ: view.readFloat32(),
    maxZ: view.readFloat32(),
  }
}

/** Writes a `Sphere` payload, for a caller to prepend the two name fields to. */
export function writeSphere(sphere: Sphere): BufferView {
  const { position, offset, rotation, minX, maxX, minY, maxY, minZ, maxZ } = sphere

  const limits = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 6)
    .writeFloat32(minX)
    .writeFloat32(maxX)
    .writeFloat32(minY)
    .writeFloat32(maxY)
    .writeFloat32(minZ)
    .writeFloat32(maxZ)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(rotation),
    limits,
  )
}

/** Reads a `Loose` payload from a cursor already past the record's two name fields. */
export function readLoose(view: BufferView): Loose {
  return {
    type: 'loose',
    position: Vector3.read(view),
    rotation: Matrix3.read(view),
  }
}

/** Writes a `Loose` payload, for a caller to prepend the two name fields to. */
export function writeLoose(loose: Loose): BufferView {
  const { position, rotation } = loose

  return BufferView.join(Vector3.write(position), Matrix3.write(rotation))
}
