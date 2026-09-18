import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '#/corpus.js'
import { Matrix4 } from '#/math/index.js'
import { readDeformableModel, type DeformableModel } from './model.js'

/**
 * How the four files of a character meet — the figures [COSTUME.md](../../docs/refs/COSTUME.md) rests on.
 *
 * Nothing here reads a costume declaration: which head goes on which body is an INI this library
 * does not interpret. What is asserted is what the *geometry* says — that every child names the host
 * hardpoint it wants, that the seam carries real weight, and that a child's stored seam frame is a
 * record of one rig family rather than a constant, which is the whole reason a composer must take
 * the seam's pose from the host.
 */

interface Piece {
  path: string
  kind: string
  model: DeformableModel
  /** Hardpoint placements in the model's own bind space, by folded name. */
  seats: Map<string, Matrix4>
  /** Hardpoints carried by a detached bone: the seats this model is asking a host for. */
  wants: { name: string; placement: Matrix4; skinned: boolean }[]
}

/** `Bone to root` is the inverse bind — RENDERER.md §8 — so the forward pose is its inverse. */
const bindOf = (bone: { rotation: never; position: never }): Matrix4 =>
  Matrix4.invert(Matrix4.fromRotationTranslation(bone.rotation, bone.position))

function read(path: string, model: DeformableModel): Piece {
  const seats = new Map<string, Matrix4>()
  const wants: Piece['wants'] = []
  const used = new Set<number>()

  for (const level of model.levels) for (const id of level.geometry.boneIds) used.add(id)

  for (const [index, bone] of model.bones.entries()) {
    const bind = bindOf(bone as never)

    for (const hardpoint of bone.hardpoints) {
      const placement = Matrix4.multiply(
        bind,
        Matrix4.fromRotationTranslation(hardpoint.orientation, hardpoint.position),
      )

      const name = hardpoint.name.toLowerCase()

      if (!seats.has(name)) seats.set(name, placement)
      if (bone.name === undefined) wants.push({ name, placement, skinned: used.has(index) })
    }
  }

  return { path, kind: path.split(/[\\/]/).at(-2)?.toUpperCase() ?? '', model, seats, wants }
}

/** Largest elementwise difference, which is what "exact" is measured on. */
function apart(a: Matrix4, b: Matrix4): number {
  const x = Matrix4.toArray(a)
  const y = Matrix4.toArray(b)

  let worst = 0

  for (let at = 0; at < 16; at++) worst = Math.max(worst, Math.abs(x[at]! - y[at]!))

  return worst
}

describe('costume', { skip }, () => {
  const pieces = load('dfm').map(({ path, root }) => read(path, readDeformableModel(root)))

  const of = (kind: string) => pieces.filter((piece) => piece.kind === kind)

  const bodies = of('BODIES')
  const heads = of('HEADS')
  const hands = of('HANDS')

  it('ships 88 bodies, 104 heads and 12 hands', () => {
    strictEqual(pieces.length, 204)
    strictEqual(bodies.length, 88)
    strictEqual(heads.length, 104)
    strictEqual(hands.length, 12)
  })

  it('offers the six join hardpoints on every body but one', () => {
    const six = ['hp_head', 'hp_neck', 'hp_left a', 'hp_left b', 'hp_right a', 'hp_right b']
    const complete = bodies.filter((body) => six.every((name) => body.seats.has(name)))

    strictEqual(complete.length, 87)
    strictEqual(
      bodies
        .find((body) => !complete.includes(body))
        ?.path.split(/[\\/]/)
        .at(-1),
      'worm.dfm',
      'the one body that hosts nothing is the worm',
    )
  })

  it('names its own seat on every detached bone, and only heads and hands have them', () => {
    const counts = new Map<string, number>()

    for (const piece of pieces) {
      const detached = piece.model.bones.filter((bone) => bone.name === undefined)

      // **Exactly one hardpoint each is what makes the seat unambiguous.** A detached bone with two
      // would be asking for two seats with nothing to say which vertex follows which.
      for (const bone of detached) strictEqual(bone.hardpoints.length, 1, piece.path)

      counts.set(piece.kind, (counts.get(piece.kind) ?? 0) + detached.length)
    }

    strictEqual(counts.get('HEADS'), 144)
    strictEqual(counts.get('HANDS'), 12)
    strictEqual(counts.get('BODIES'), 0, 'a host is never a guest')
  })

  it('asks only for seats a body is capable of offering', () => {
    const offered = new Set(bodies.flatMap((body) => [...body.seats.keys()]))

    for (const piece of [...heads, ...hands])
      for (const want of piece.wants)
        strictEqual(offered.has(want.name), true, `${piece.path} wants ${want.name}`)
  })

  it('skins 137 of the 156 seams, and never leaves a neck idle', () => {
    const seams = [...heads, ...hands].flatMap((piece) => piece.wants)

    strictEqual(seams.length, 156)
    strictEqual(seams.filter((seam) => seam.skinned).length, 137)

    const idle = new Map<string, number>()

    for (const seam of seams.filter((seam) => !seam.skinned))
      idle.set(seam.name, (idle.get(seam.name) ?? 0) + 1)

    // **The 19 that carry nothing are shoulders and wrists, never a neck.** Which is the shape of
    // the rule a composer needs: the join every costume has is always weighted, and the optional
    // ones are the ones a model may declare and not use.
    strictEqual(
      [...idle]
        .sort()
        .map(([name, count]) => `${name}=${count}`)
        .join(),
      'hp_lcollarbone=7,hp_left a=2,hp_rcollarbone=7,hp_right a=2,hp_upper torso=1',
    )

    // Every head names a neck, and no body names anything: the asymmetry it all rests on.
    strictEqual(seams.filter((seam) => seam.name === 'hp_neck').length, 104)
  })

  it('splits into two rig families, which is why the seam pose belongs to the host', () => {
    // A head mated at `hp_head` predicts where its seam hardpoint lands in the body's space. Bodies
    // fall into exactly two groups by how many heads that prediction is exact for — and no third.
    const exactness = new Set<number>()

    for (const body of bodies) {
      const hostMate = body.seats.get('hp_head')

      if (!hostMate) continue

      let exact = 0

      for (const head of heads) {
        const childMate = head.seats.get('hp_head')
        const seam = head.wants.find((want) => want.name === 'hp_neck')
        const seat = body.seats.get('hp_neck')

        if (!childMate || !seam || !seat) continue

        const into = Matrix4.multiply(hostMate, Matrix4.invert(childMate))

        if (apart(Matrix4.multiply(into, seam.placement), seat) < 1e-6) exact++
      }

      exactness.add(exact)
    }

    strictEqual(
      [...exactness].sort((a, b) => b - a).join(),
      '60,33,0',
      'two families and the bodies that belong to neither',
    )
  })
})
