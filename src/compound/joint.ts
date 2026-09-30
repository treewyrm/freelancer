import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import Matrix3 from '#/math/matrix3.js'
import Matrix4 from '#/math/matrix4.js'
import Quat from '#/math/quat.js'

/** Fixed joint. Cannot be animated. */
export interface FixedJoint {
  type: 'fixed'
  position: Vector3
  orientation: Matrix3
}

/**
 * Revolute joint. Fixed axis rotation constraint. Animation controls angle, which the engine clamps
 * to min/max.
 */
export interface RevoluteJoint {
  type: 'revolute'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  orientation: Matrix3
  axis: Vector3
  min: number
  max: number
}

/**
 * Prismatic joint. Fixed axis movement constraint. Animation controls offset, which the engine
 * clamps to min/max.
 */
export interface PrismaticJoint {
  type: 'prismatic'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  orientation: Matrix3
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
 * against real data. The engine loads it and keeps a two-float state for it — travel, then angle —
 * but **animating** a cylinder remains impossible: no channel type expands to two floats, and no
 * player or blend case exists for them — see `ChannelType` in `animation/channel.ts`. CFW never
 * animated one either, its exporter having no cylinder branch at all.
 */
export interface CylinderJoint {
  type: 'cylinder'

  /** `parent_point` — point of contact on the parent, in parent frame. */
  position: Vector3

  /** `child_point` — point of contact on the child, in child frame. */
  offset: Vector3

  /** `rel_orientation`. */
  orientation: Matrix3

  /** Unit axis shared by both degrees of freedom, in parent frame. */
  axis: Vector3

  /** `min_trans`/`max_trans` — travel limits along {@link axis}, in metres. */
  minPris: number
  maxPris: number

  /** `min_rot`/`max_rot` — rotation limits about {@link axis}, in radians. */
  minRev: number
  maxRev: number
}

/**
 * Sphere/ball joint. Rotation constraint. Animation controls rotation by quat. The engine stores the
 * six limits and applies none of them.
 */
export interface SphereJoint {
  type: 'sphere'
  position: Vector3

  /** `child_point` — the child-frame point that lands on {@link position}. See RENDERER.md §5.2. */
  offset: Vector3

  orientation: Matrix3
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/** Loose joint. Unconstrainted. Animation controls free motion by vector3 + quat/matrix3. */
export interface LooseJoint {
  type: 'loose'
  position: Vector3
  orientation: Matrix3
}

/**
 * Translational joint. Unconstrained travel in three axes, orientation held at rest. Animation
 * controls the displacement by vector3, added to {@link position} in the parent frame.
 *
 * A `Trans` record, laid out as a `Fix` — CFW's typedef. `engbase.dll` loads it as joint type 5
 * (`0x6620a0e`) and binds position-only channels to it, but neither retail nor Discovery ships one.
 */
export interface TranslationalJoint {
  type: 'translational'
  position: Vector3
  orientation: Matrix3
}

/** Compound object child to parent connection joint. */
export type Joint =
  | FixedJoint
  | RevoluteJoint
  | PrismaticJoint
  | CylinderJoint
  | SphereJoint
  | TranslationalJoint
  | LooseJoint

/** Narrows to the joint of a given type, so a consumer can filter without a cast. */
export type JointOf<T extends Joint['type']> = Extract<Joint, { type: T }>

/** Reads a `Fix` payload from a cursor already past the record's two name fields. */
export function readFixed(view: BufferView): FixedJoint {
  return {
    type: 'fixed',
    position: Vector3.read(view),
    orientation: Matrix3.read(view),
  }
}

/** Writes a `Fix` payload, for a caller to prepend the two name fields to. */
export function writeFixed(fixed: FixedJoint): BufferView {
  const { position, orientation } = fixed

  return BufferView.join(Vector3.write(position), Matrix3.write(orientation))
}

/** Reads a `Rev` payload from a cursor already past the record's two name fields. */
export function readRevolute(view: BufferView): RevoluteJoint {
  return {
    type: 'revolute',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    orientation: Matrix3.read(view),
    axis: Vector3.read(view),
    min: view.readFloat32(),
    max: view.readFloat32(),
  }
}

/** Writes a `Rev` payload, for a caller to prepend the two name fields to. */
export function writeRevolute(revolute: RevoluteJoint): BufferView {
  const { position, offset, orientation, axis, min, max } = revolute

  const limits = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(min)
    .writeFloat32(max)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(orientation),
    Vector3.write(axis),
    limits,
  )
}

/** Reads a `Pris` payload from a cursor already past the record's two name fields. */
export function readPrismatic(view: BufferView): PrismaticJoint {
  return {
    type: 'prismatic',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    orientation: Matrix3.read(view),
    axis: Vector3.read(view),
    min: view.readFloat32(),
    max: view.readFloat32(),
  }
}

/** Writes a `Pris` payload, for a caller to prepend the two name fields to. */
export function writePrismatic(prismatic: PrismaticJoint): BufferView {
  const { position, offset, orientation, axis, min, max } = prismatic

  const limit = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(min)
    .writeFloat32(max)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(orientation),
    Vector3.write(axis),
    limit,
  )
}

/** Reads a `Cyl` record, whose 176-byte payload is a `Rev` with a second limit pair appended. */
export function readCylinder(view: BufferView): CylinderJoint {
  return {
    type: 'cylinder',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    orientation: Matrix3.read(view),
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
export function writeCylinder(cylinder: CylinderJoint): BufferView {
  const { position, offset, orientation, axis, minPris, maxPris, minRev, maxRev } = cylinder

  const limits = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
    .writeFloat32(minPris)
    .writeFloat32(maxPris)
    .writeFloat32(minRev)
    .writeFloat32(maxRev)

  return BufferView.join(
    Vector3.write(position),
    Vector3.write(offset),
    Matrix3.write(orientation),
    Vector3.write(axis),
    limits,
  )
}

/**
 * Reads a `Sphere` payload from a cursor already past the record's two name fields. The six limits
 * are per axis and interleaved min-then-max, not two vectors.
 */
export function readSphere(view: BufferView): SphereJoint {
  return {
    type: 'sphere',
    position: Vector3.read(view),
    offset: Vector3.read(view),
    orientation: Matrix3.read(view),
    minX: view.readFloat32(),
    maxX: view.readFloat32(),
    minY: view.readFloat32(),
    maxY: view.readFloat32(),
    minZ: view.readFloat32(),
    maxZ: view.readFloat32(),
  }
}

/** Writes a `Sphere` payload, for a caller to prepend the two name fields to. */
export function writeSphere(sphere: SphereJoint): BufferView {
  const { position, offset, orientation, minX, maxX, minY, maxY, minZ, maxZ } = sphere

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
    Matrix3.write(orientation),
    limits,
  )
}

/** Reads a `Loose` payload from a cursor already past the record's two name fields. */
export function readLoose(view: BufferView): LooseJoint {
  return {
    type: 'loose',
    position: Vector3.read(view),
    orientation: Matrix3.read(view),
  }
}

/** Writes a `Loose` payload, for a caller to prepend the two name fields to. */
export function writeLoose(loose: LooseJoint): BufferView {
  const { position, orientation } = loose

  return BufferView.join(Vector3.write(position), Matrix3.write(orientation))
}

/** Reads a `Trans` payload from a cursor already past the record's two name fields. */
export function readTranslational(view: BufferView): TranslationalJoint {
  return {
    type: 'translational',
    position: Vector3.read(view),
    orientation: Matrix3.read(view),
  }
}

/** Writes a `Trans` payload, for a caller to prepend the two name fields to. */
export function writeTranslational(translational: TranslationalJoint): BufferView {
  const { position, orientation } = translational

  return BufferView.join(Vector3.write(position), Matrix3.write(orientation))
}

/**
 * What drives a joint, field by field. A channel sample has this shape; a field the joint does not
 * take is ignored, and one it takes but is absent stands at zero or the identity.
 */
export interface JointState {
  /** Revolute angle in radians, or prismatic or cylinder travel along the axis. */
  value?: number

  /** Cylinder angle about its axis, in radians. */
  rotation?: number

  /** Translational or loose displacement, added to the rest position in the parent frame. */
  position?: Vector3

  /** Sphere or loose rotation, applied before the rest orientation — on its left. */
  orientation?: Quat
}

/** The engine's clamp (`engbase.dll` `0x6622725`): below `min` first, then above `max`. */
const limit = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value

/** `T(position + travel) · R(turn) · R(orientation) · T(-offset)`. */
const contact = (
  joint: { position: Vector3; orientation: Matrix3; offset: Vector3 },
  turn: Quat,
  travel: Vector3,
): Matrix4 =>
  Matrix4.multiply(
    Matrix4.fromRotationTranslation(
      Matrix3.fromQuaternion(turn),
      Vector3.add(joint.position, travel),
    ),
    Matrix4.multiply(
      Matrix4.fromRotationTranslation(joint.orientation),
      Matrix4.translation(Vector3.multiplyScalar(joint.offset, -1)),
    ),
  )

/** Rotation by `angle` about `axis`, normalized first as the engine does for revolute joints. */
const turn = (axis: Vector3, angle: number): Quat =>
  Quat.axisAngle({ axis: Vector3.normalize(axis), angle })

/**
 * The child's frame in its parent's, for a joint driven to a state — what `engbase.dll` computes
 * per joint type (dispatch table `0x662aa84`), with the column-vector conventions of `Matrix4`.
 *
 * ```
 * fixed          T(position) · R(orientation)
 * revolute       T(position) · R(axis, θ) · R(orientation) · T(-offset)        θ clamped to [min, max]
 * prismatic      T(position + d·axis) · R(orientation) · T(-offset)            d clamped to [min, max]
 * cylinder       T(position + d·axis) · R(axis, θ) · R(orientation) · T(-offset)
 * sphere         T(position) · R(q) · R(orientation) · T(-offset)
 * translational  T(position + p) · R(orientation)
 * loose          T(position + p) · R(q) · R(orientation)
 * ```
 *
 * The driven rotation sits on the left of the rest orientation, in the parent frame. Revolute and
 * prismatic values are clamped by the engine when they are set (`0x66226e0`); nothing else is — a
 * sphere's limits and a cylinder's are stored and never applied. A revolute axis is normalized, a
 * prismatic one is not: travel is `d` times the axis as stored.
 * @param joint Joint
 * @param state Driven state; the joint's rest when omitted
 */
export function getJointMatrix(joint: Joint, state: JointState = {}): Matrix4 {
  const { value = 0, rotation = 0, position = Vector3.zero, orientation = Quat.identity } = state

  switch (joint.type) {
    case 'fixed':
      return Matrix4.fromRotationTranslation(joint.orientation, joint.position)
    case 'revolute':
      return contact(joint, turn(joint.axis, limit(value, joint.min, joint.max)), Vector3.zero)
    case 'prismatic':
      return contact(
        joint,
        Quat.identity,
        Vector3.multiplyScalar(joint.axis, limit(value, joint.min, joint.max)),
      )
    case 'cylinder':
      return contact(joint, turn(joint.axis, rotation), Vector3.multiplyScalar(joint.axis, value))
    case 'sphere':
      return contact(joint, orientation, Vector3.zero)
    case 'translational':
      return Matrix4.fromRotationTranslation(
        joint.orientation,
        Vector3.add(joint.position, position),
      )
    case 'loose':
      return Matrix4.multiply(
        Matrix4.fromRotationTranslation(
          Matrix3.fromQuaternion(orientation),
          Vector3.add(joint.position, position),
        ),
        Matrix4.fromRotationTranslation(joint.orientation),
      )
  }
}
