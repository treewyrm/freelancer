import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as value from '#/thn/value.js'
import type { Globals } from '#/thn/types.js'
import { read } from './read.js'
import { write } from './write.js'
import type { Script } from './types.js'

/** A script with one entity in it, so a test can say only what it is about. */
const withEntity = (fields: Parameters<typeof value.table>[0]): Globals => [
  { name: 'duration', value: value.number(10) },
  { name: 'entities', value: value.list(value.table(fields)) },
  { name: 'events', value: value.list() },
]

/** A script with one event in it. */
const withEvent = (...parts: Parameters<typeof value.list>): Globals => [
  { name: 'duration', value: value.number(10) },
  { name: 'entities', value: value.list() },
  { name: 'events', value: value.list(value.list(...parts)) },
]

describe('the two export forms fold together', () => {
  const symbolic = withEntity({
    entity_name: 'Scene',
    type: value.identifier('SCENE'),
    up: value.identifier('Y_AXIS'),
    front: value.identifier('Z_AXIS'),
    fogon: value.identifier('N'),
    fogmode: value.identifier('F_LINEAR'),
  })

  // The same script as one of the 355: resolved numbers where the rest write the globals, and an
  // array stored as a hash keyed 1..n.
  const numeric: Globals = [
    { name: 'duration', value: value.number(10) },
    {
      name: 'entities',
      value: {
        type: 'table',
        array: [],
        entries: [
          {
            key: value.number(1),
            value: value.table({
              entity_name: 'Scene',
              type: value.number(9),
              up: value.number(1),
              front: value.number(2),
              fogon: value.number(0),
              fogmode: value.number(3),
            }),
          },
        ],
      },
    },
    { name: 'events', value: value.list() },
  ]

  it('reads both to the same script', () => {
    assert.deepEqual(read(numeric), read(symbolic))
  })

  it('resolves the entity type, the axes, the fog mode and the booleans', () => {
    assert.deepEqual(read(numeric).entities[0], {
      entity_name: 'Scene',
      type: 'SCENE',
      up: 'Y_AXIS',
      front: 'Z_AXIS',
      fog: { fogon: 'N', fogmode: 'F_LINEAR' },
    })
  })

  // The normalisation, and the reason `interim → typed → interim` is a fixed point rather than an
  // identity: what comes back is always the symbolic form, whichever went in.
  it('writes the symbolic form back, whichever form was read', () => {
    assert.deepEqual(write(read(numeric)), write(read(symbolic)))
    assert.deepEqual(
      value.getGlobal(write(read(numeric)), 'entities'),
      value.list(
        value.table({
          entity_name: 'Scene',
          type: value.identifier('SCENE'),
          up: value.identifier('Y_AXIS'),
          front: value.identifier('Z_AXIS'),
          fogon: value.identifier('N'),
          fogmode: value.identifier('F_LINEAR'),
        }),
      ),
    )
  })
})

describe('flags', () => {
  it('decodes a numeric flag set into names, in bit order', () => {
    const script = read(
      withEntity({ entity_name: 'X', type: value.number(3), flags: value.number(17) }),
    )

    assert.deepEqual(script.entities[0]?.flags, ['REFERENCE', 'HIDDEN'])
  })

  /**
   * Bit 2 is `SPATIAL` on a sound and `LIT_AMBIENT` on anything that renders — THORN's flag globals
   * are not one namespace. The two never share an entity type in 41,250 retail entities, which is
   * what makes the ambiguity decidable, and this is the one decode that consults the entity's type.
   */
  it('reads bit 2 as SPATIAL on a sound and LIT_AMBIENT on a compound', () => {
    const sound = read(
      withEntity({ entity_name: 'S', type: value.number(6), flags: value.number(2) }),
    )
    const compound = read(
      withEntity({ entity_name: 'C', type: value.number(1), flags: value.number(2) }),
    )

    assert.deepEqual(sound.entities[0]?.flags, ['SPATIAL'])
    assert.deepEqual(compound.entities[0]?.flags, ['LIT_AMBIENT'])
  })

  it('reads an attach flag composition either way round', () => {
    const composed = withEvent(
      value.number(0),
      value.identifier('ATTACH_ENTITY'),
      value.list('A', 'B'),
      value.table({ flags: value.identifier('POSITION', 'ORIENTATION', 'PARENT_CHILD') }),
    )
    const summed = withEvent(
      value.number(0),
      value.number(8),
      value.list('A', 'B'),
      value.table({ flags: value.number(70) }),
    )

    assert.deepEqual(read(summed), read(composed))
  })

  /**
   * A symbolic name is taken as written and not checked, because `thorn.dll` names four flags no
   * retail script uses — their bits are unmeasured, and refusing the name would refuse something
   * real. The numeric form has no such latitude.
   */
  it('accepts an unmeasured flag name but not an unmeasured bit', () => {
    assert.deepEqual(
      read(
        withEvent(
          value.number(0),
          value.identifier('START_SOUND'),
          value.list('A'),
          value.table({ flags: value.identifier('USE_SCRIPT_DURATION') }),
        ),
      ).events[0],
      { time: 0, targets: ['A'], action: 'START_SOUND', flags: ['USE_SCRIPT_DURATION'] },
    )

    assert.throws(
      () =>
        read(
          withEvent(
            value.number(0),
            value.identifier('START_SOUND'),
            value.list('A'),
            value.table({ flags: value.number(1024) }),
          ),
        ),
      /bit 1024 is not a flag/,
    )
  })
})

describe('what it refuses', () => {
  // Named in thorn.dll, measured nowhere. Guessing a shape for one is what this refuses to do.
  it('rejects an entity type the binary names but the corpus never uses', () => {
    assert.throws(
      () => read(withEntity({ entity_name: 'X', type: value.identifier('SUB_SCENE') })),
      /SUB_SCENE is not a entity type this library knows/,
    )
  })

  it('rejects an event action with no measured value', () => {
    assert.throws(
      () => read(withEvent(value.number(0), value.number(12), value.list('A'))),
      /12 is not a event action this library knows/,
    )
  })

  it('names the path when a value is the wrong shape', () => {
    assert.throws(
      () =>
        read(
          withEntity({
            entity_name: 'X',
            type: value.identifier('CAMERA'),
            spatialprops: value.table({ pos: value.list(1, 2) }),
          }),
        ),
      /entities\[1\]\.spatialprops\.pos: expected 3 numbers, found 2/,
    )
  })

  it('rejects a script with no duration', () => {
    assert.throws(
      () => read([{ name: 'entities', value: value.list() }]),
      /the script does not set it/,
    )
  })
})

describe('what it keeps', () => {
  it('keeps a key the vocabulary does not name, and writes it back', () => {
    const globals = withEntity({
      entity_name: 'X',
      type: value.identifier('MARKER'),
      inventedByAMod: value.number(7),
    })
    const script = read(globals)

    assert.deepEqual(script.entities[0]?.unknown, { inventedByAMod: value.number(7) })
    assert.deepEqual(
      value.getGlobal(write(script), 'entities'),
      value.list(
        value.table({
          entity_name: 'X',
          type: value.identifier('MARKER'),
          inventedByAMod: value.number(7),
        }),
      ),
    )
  })

  // An absent property stays absent rather than being written with a default: a default emitted is
  // a claim the file did not make.
  it('leaves an absent property absent', () => {
    const script = read(withEntity({ entity_name: 'X', type: value.identifier('MARKER') }))

    assert.deepEqual(script.entities[0], { entity_name: 'X', type: 'MARKER' })
    assert.deepEqual(
      value.getGlobal(write(script), 'entities'),
      value.list(value.table({ entity_name: 'X', type: value.identifier('MARKER') })),
    )
  })

  // Seven retail particle systems carry an empty one, so an empty block is not the same as no block.
  it('distinguishes an empty block from a missing one', () => {
    const empty = read(
      withEntity({ entity_name: 'P', type: value.identifier('PSYS'), psysprops: value.table({}) }),
    )
    const missing = read(withEntity({ entity_name: 'P', type: value.identifier('PSYS') }))

    assert.deepEqual(empty.entities[0], { entity_name: 'P', type: 'PSYS', psysprops: {} })
    assert.deepEqual(missing.entities[0], { entity_name: 'P', type: 'PSYS' })
    assert.deepEqual(read(write(empty)), empty)
  })
})

describe('the shapes the guide does not have', () => {
  /**
   * An entity says `hvaspect`/`nearplane`/`farplane`; a `START_CAMERA_PROP_ANIM` says
   * `aspect`/`near`/`far`. Both spellings are in `thorn.dll`, so this is the engine's inconsistency.
   */
  it('reads the animating camera block as a different block from the entity one', () => {
    const entity = read(
      withEntity({
        entity_name: 'C',
        type: value.identifier('CAMERA'),
        cameraprops: value.table({ fovh: 25, hvaspect: 1.85, nearplane: 1, farplane: 5000 }),
      }),
    )
    const animation = read(
      withEvent(
        value.number(0),
        value.identifier('START_CAMERA_PROP_ANIM'),
        value.list('C'),
        value.table({ cameraprops: value.table({ fovh: 25, aspect: 1.85, near: 1, far: 5000 }) }),
      ),
    )

    assert.deepEqual(entity.entities[0], {
      entity_name: 'C',
      type: 'CAMERA',
      cameraprops: { fovh: 25, hvaspect: 1.85, nearplane: 1, farplane: 5000 },
    })
    assert.deepEqual(animation.events[0], {
      time: 0,
      targets: ['C'],
      action: 'START_CAMERA_PROP_ANIM',
      cameraprops: { fovh: 25, aspect: 1.85, near: 1, far: 5000 },
    })
  })

  // A SCENE writes the fog keys flat; a START_FOG_PROP_ANIM writes them as a block. Grouped either
  // way, and splatted back out flat when a scene entity is written.
  it('groups a scene entity’s flat fog keys and writes them back flat', () => {
    const globals = withEntity({
      entity_name: 'Scene',
      type: value.identifier('SCENE'),
      fogon: value.identifier('Y'),
      fogstart: 0,
      fogend: 400,
    })
    const script = read(globals)

    assert.deepEqual(script.entities[0], {
      entity_name: 'Scene',
      type: 'SCENE',
      fog: { fogon: 'Y', fogstart: 0, fogend: 400 },
    })
    assert.deepEqual(write(script), globals)
  })

  // Retail SET_CAMERA events are three fields long, not four with an empty table.
  it('writes a SET_CAMERA with no property table', () => {
    const globals = withEvent(value.number(0), value.identifier('SET_CAMERA'), value.list('M', 'C'))

    assert.deepEqual(read(globals).events[0], {
      time: 0,
      targets: ['M', 'C'],
      action: 'SET_CAMERA',
    })
    assert.deepEqual(write(read(globals)), globals)
  })
})

describe('pathprops', () => {
  const withPath = (props: Parameters<typeof value.table>[0]): Globals =>
    withEntity({
      entity_name: 'Path',
      type: value.identifier('MOTION_PATH'),
      pathprops: value.table(props),
    })

  // A retail string, verbatim: two keyframes, and the trailing `, ` the exporter leaves behind
  // because the separator belongs to each point's format rather than sitting between points.
  const data =
    'OPEN, {0.000000,-0.000000,0.000000}, {1.000000,0.000000,0.000000,0.000000}, ' +
    '{0.000000,0.099999,0.000224}, {1.000000,0.000000,-0.000000,0.000000}, '

  const globals = withPath({ path_type: 'CV_CROrientationSplinePath', path_data: data })

  it('reads path_data into position and orientation pairs', () => {
    assert.deepEqual(read(globals).entities[0], {
      entity_name: 'Path',
      type: 'MOTION_PATH',
      pathprops: {
        path_type: 'CV_CROrientationSplinePath',
        flag: 'OPEN',
        points: [
          { position: [0, -0, 0], orientation: [1, 0, 0, 0] },
          { position: [0, 0.099999, 0.000224], orientation: [1, 0, -0, 0] },
        ],
      },
    })
  })

  /**
   * The string is written back exactly as it came in — six decimals from `%f`, the trailing
   * separator, and the negative zeros `toFixed` would flatten. Decomposing `path_data` is only
   * defensible if nothing is lost putting it back.
   */
  it('writes path_data back verbatim, negative zeros and all', () => {
    assert.deepEqual(write(read(globals)), globals)
  })

  // Neither is in a retail script and both are in `thorn.dll`, so both are readable rather than
  // rejected: `CV_CRSplinePath` carries positions with no orientations, and a path may be a loop.
  it('reads the positions-only path type and the CLOSED flag the corpus never uses', () => {
    const script = read(
      withPath({
        path_type: 'CV_CRSplinePath',
        path_data: 'CLOSED, {1.000000,2.000000,3.000000}, {4.000000,5.000000,6.000000}, ',
      }),
    )

    assert.deepEqual(script.entities[0]?.type === 'MOTION_PATH' && script.entities[0].pathprops, {
      path_type: 'CV_CRSplinePath',
      flag: 'CLOSED',
      points: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    })

    assert.deepEqual(read(write(script)), script)
  })

  // Three retail motion paths have no path at all. `NULL` is not a spline class the binary names —
  // it is what the exporter writes where the class would go — so it is an arm with no points.
  it('reads a NULL path as its own arm, with no path_data', () => {
    const script = read(withPath({ path_type: 'NULL' }))

    assert.deepEqual(script.entities[0]?.type === 'MOTION_PATH' && script.entities[0].pathprops, {
      path_type: 'NULL',
    })
    assert.deepEqual(write(script), withPath({ path_type: 'NULL' }))
  })

  it('refuses a path type outside the two the binary names', () => {
    assert.throws(
      () => read(withPath({ path_type: 'CV_CRHermitePath', path_data: 'OPEN, ' })),
      /pathprops\.path_type: CV_CRHermitePath is not a path type this library knows/,
    )
  })

  /**
   * `path_type` is the one property in this layer that another property depends on, so it cannot be
   * absent the way every other key can: there would be no shape to read `path_data` as.
   */
  it('refuses pathprops with no path_type', () => {
    assert.throws(() => read(withPath({ path_data: 'OPEN, ' })), /pathprops: expected a path_type/)
  })

  it('refuses an oriented path whose last position has no orientation', () => {
    assert.throws(
      () =>
        read(
          withPath({
            path_type: 'CV_CROrientationSplinePath',
            path_data: 'OPEN, {0.000000,0.000000,0.000000}, ',
          }),
        ),
      /pathprops\.path_data\[2\]: expected an orientation after the last position/,
    )
  })

  it('refuses a point of the wrong width', () => {
    assert.throws(
      () =>
        read(
          withPath({
            path_type: 'CV_CRSplinePath',
            path_data: 'OPEN, {0.000000,0.000000}, ',
          }),
        ),
      /pathprops\.path_data\[1\]: expected 3 numbers, found 2/,
    )
  })

  it('refuses a flag that is neither OPEN nor CLOSED', () => {
    assert.throws(
      () => read(withPath({ path_type: 'CV_CRSplinePath', path_data: 'LOOPED, ' })),
      /LOOPED is not a path flag this library knows/,
    )
  })
})

describe('round-trip', () => {
  // The typed layer is a fixed point: `typed → interim → typed` is identity, and the other direction
  // normalises. Everything the corpus suite asserts over 1,506 scripts, in one hand-built script.
  it('is an identity through the interim model', () => {
    const script: Script = {
      duration: 800,
      entities: [
        {
          entity_name: 'Camera',
          type: 'CAMERA',
          template_name: '',
          lt_grp: 0,
          srt_grp: 0,
          usr_flg: 0,
          flags: ['HIDDEN'],
          spatialprops: {
            pos: [0, 0, 0],
            orient: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ],
          },
          cameraprops: { fovh: 41, hvaspect: 1.777777, nearplane: 1, farplane: 5000 },
        },
        {
          entity_name: 'Light',
          type: 'LIGHT',
          lightprops: { on: 'Y', type: 'L_DIRECT', diffuse: [0.25, 0.45, 0.55], theta: 4000 },
          userprops: { nofog: 'Y' },
        },
      ],
      events: [
        { time: 0, action: 'SET_CAMERA', targets: ['Monitor', 'Camera'] },
        {
          time: 0,
          action: 'ATTACH_ENTITY',
          targets: ['Camera', 'Camera_Marker'],
          duration: 8000,
          offset: [-50, 25, 0],
          up: 'Y_AXIS',
          front: 'NEG_Z_AXIS',
          target_part: '',
          target_type: 'ROOT',
          flags: ['POSITION', 'ORIENTATION', 'LOOK_AT', 'ENTITY_RELATIVE'],
        },
        {
          time: 0,
          action: 'START_SPATIAL_PROP_ANIM',
          targets: ['Camera_Marker'],
          duration: 800,
          target_type: 'ROOT',
          spatialprops: { axisrot: [3600, 'Y_AXIS'] },
          param_curve: {
            CLSID: 'FreeFormPCurve',
            points: [
              [0, 0, 0, 0],
              [1, 1, 0, 0],
            ],
          },
          pcurve_period: -1000,
        },
      ],
    }

    assert.deepEqual(read(write(script)), script)
  })
})
