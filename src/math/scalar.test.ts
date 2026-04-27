import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  random,
  equal,
  clamp,
  mod,
  fract,
  saw,
  square,
  triangle,
  pingPong,
  lerp,
  smooth,
  smoother,
  quadIn,
  quadOut,
  hermite,
  remap,
  remapLog,
  remapExp,
} from './scalar.js'

// ---------------------------------------------------------------------------
// random
// ---------------------------------------------------------------------------

describe('random', () => {
  it('returns a value within the default range [-1, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = random()
      assert.ok(v >= -1 && v <= 1, `${v} outside [-1, 1]`)
    }
  })

  it('returns a value within a custom range', () => {
    for (let i = 0; i < 100; i++) {
      const v = random(0, 10)
      assert.ok(v >= 0 && v <= 10, `${v} outside [0, 10]`)
    }
  })
})

// ---------------------------------------------------------------------------
// equal
// ---------------------------------------------------------------------------

describe('equal', () => {
  it('returns true for identical values', () => {
    assert.equal(equal(1, 1), true)
    assert.equal(equal(0, 0), true)
    assert.equal(equal(-5, -5), true)
  })

  it('returns true when difference is within relative epsilon', () => {
    assert.equal(equal(1, 1.00005), true)
    assert.equal(equal(1000, 1000.05), true)
  })

  it('returns false when difference exceeds relative epsilon', () => {
    assert.equal(equal(1, 1.01), false)
    assert.equal(equal(0, 1), false)
  })

  it('uses custom epsilon', () => {
    assert.equal(equal(1, 1.5, 1), true)
    assert.equal(equal(1, 2, 0.1), false)
  })
})

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('returns min when value is below range', () => {
    assert.equal(clamp(-5, 0, 10), 0)
  })

  it('returns max when value is above range', () => {
    assert.equal(clamp(15, 0, 10), 10)
  })

  it('returns value unchanged when within range', () => {
    assert.equal(clamp(5, 0, 10), 5)
  })

  it('returns value unchanged with default infinite range', () => {
    assert.equal(clamp(1e9), 1e9)
    assert.equal(clamp(-1e9), -1e9)
  })
})

// ---------------------------------------------------------------------------
// mod
// ---------------------------------------------------------------------------

describe('mod', () => {
  it('returns standard modulo for positive values', () => {
    assert.equal(mod(7, 3), 1)
    assert.equal(mod(6, 3), 0)
  })

  it('returns positive result for negative dividend', () => {
    assert.equal(mod(-1, 3), 2)
    assert.equal(mod(-4, 3), 2)
  })

  it('returns 0 for a dividend of 0', () => {
    assert.equal(mod(0, 5), 0)
  })
})

// ---------------------------------------------------------------------------
// fract
// ---------------------------------------------------------------------------

describe('fract', () => {
  it('returns fractional part of a positive non-integer', () => {
    assert.equal(fract(0.5), 0.5)
    assert.equal(fract(1.5), 0.5)
    assert.equal(fract(0.25), 0.25)
  })

  it('returns 1.0 for positive integers (intentional: hold at end of animation cycle)', () => {
    assert.equal(fract(1), 1)
    assert.equal(fract(2), 1)
    assert.equal(fract(10), 1)
  })

  it('returns 0 for zero', () => {
    assert.equal(fract(0), 0)
  })

  it('returns fractional part of a negative non-integer', () => {
    assert.equal(fract(-0.5), 0.5)
    assert.equal(fract(-1.5), 0.5)
  })

  it('returns 0 for negative integers', () => {
    assert.equal(fract(-1), 0)
    assert.equal(fract(-2), 0)
  })
})

// ---------------------------------------------------------------------------
// saw
// ---------------------------------------------------------------------------

describe('saw', () => {
  it('returns 0 at v=0', () => {
    assert.equal(saw(0), 0)
  })

  it('ramps linearly across period', () => {
    assert.equal(saw(0.5, 1, 1), 0.5)
    assert.equal(saw(0.25, 1, 1), 0.25)
  })

  it('wraps back to 0 at end of period', () => {
    assert.equal(saw(1, 1, 1), 0)
  })

  it('returns 0 when period is 0', () => {
    assert.equal(saw(1, 1, 0), 0)
  })
})

// ---------------------------------------------------------------------------
// square
// ---------------------------------------------------------------------------

describe('square', () => {
  it('returns 0 in the low half of the cycle (default duty=0.5)', () => {
    assert.equal(square(0, 1, 1), 0)
    assert.equal(square(0.25, 1, 1), 0)
  })

  it('returns amplitude in the high half of the cycle', () => {
    assert.equal(square(0.75, 1, 1), 1)
  })

  it('respects custom duty cycle', () => {
    assert.equal(square(0.1, 1, 1, 0.2), 0)
    assert.equal(square(0.3, 1, 1, 0.2), 1)
  })

  it('returns 0 when period is 0', () => {
    assert.equal(square(0.5, 1, 0), 0)
  })
})

// ---------------------------------------------------------------------------
// triangle
// ---------------------------------------------------------------------------

describe('triangle', () => {
  it('returns 0 at start of period', () => {
    assert.equal(triangle(0, 1, 1), 0)
  })

  it('returns amplitude at midpoint', () => {
    assert.equal(triangle(0.5, 1, 1), 1)
  })

  it('returns 0 at end of period', () => {
    assert.equal(triangle(1, 1, 1), 0)
  })

  it('returns 0 when period is 0', () => {
    assert.equal(triangle(0.5, 1, 0), 0)
  })
})

// ---------------------------------------------------------------------------
// pingPong
// ---------------------------------------------------------------------------

describe('pingPong', () => {
  it('starts at 0', () => {
    assert.equal(pingPong(0), 0)
  })

  it('reaches 1 at midpoint', () => {
    assert.equal(pingPong(1), 1)
  })

  it('returns to 0 at full cycle', () => {
    assert.equal(pingPong(2), 0)
  })

  it('is symmetric around the midpoint', () => {
    assert.equal(pingPong(0.5), 0.5)
    assert.equal(pingPong(1.5), 0.5)
  })
})

// ---------------------------------------------------------------------------
// lerp
// ---------------------------------------------------------------------------

describe('lerp', () => {
  it('returns p0 at t=0', () => {
    assert.equal(lerp(3, 7, 0), 3)
  })

  it('returns p1 at t=1', () => {
    assert.equal(lerp(3, 7, 1), 7)
  })

  it('returns midpoint at t=0.5', () => {
    assert.equal(lerp(0, 10, 0.5), 5)
    assert.equal(lerp(-5, 5, 0.5), 0)
  })
})

// ---------------------------------------------------------------------------
// smooth / smoother
// ---------------------------------------------------------------------------

describe('smooth', () => {
  it('returns 0 at t=0', () => {
    assert.equal(smooth(0), 0)
  })

  it('returns 1 at t=1', () => {
    assert.equal(smooth(1), 1)
  })

  it('returns 0.5 at t=0.5 (symmetric)', () => {
    assert.equal(smooth(0.5), 0.5)
  })
})

describe('smoother', () => {
  it('returns 0 at t=0', () => {
    assert.equal(smoother(0), 0)
  })

  it('returns 1 at t=1', () => {
    assert.equal(smoother(1), 1)
  })

  it('returns 0.5 at t=0.5 (symmetric)', () => {
    assert.equal(smoother(0.5), 0.5)
  })
})

// ---------------------------------------------------------------------------
// quadIn / quadOut
// ---------------------------------------------------------------------------

describe('quadIn', () => {
  it('returns 0 at t=0', () => {
    assert.equal(quadIn(0), 0)
  })

  it('returns 1 at t=1', () => {
    assert.equal(quadIn(1), 1)
  })

  it('is slow at the start', () => {
    assert.equal(quadIn(0.5), 0.25)
  })
})

describe('quadOut', () => {
  it('returns 0 at t=0', () => {
    assert.equal(quadOut(0), 0)
  })

  it('returns 1 at t=1', () => {
    assert.equal(quadOut(1), 1)
  })

  it('is fast at the start', () => {
    assert.equal(quadOut(0.5), 0.75)
  })
})

// ---------------------------------------------------------------------------
// hermite
// ---------------------------------------------------------------------------

describe('hermite', () => {
  it('returns p0 at t=0', () => {
    assert.equal(hermite(1, 0, 2, 0, 0), 1)
  })

  it('returns p1 at t=1', () => {
    assert.equal(hermite(1, 0, 2, 0, 1), 2)
  })

  it('interpolates midpoint with zero tangents', () => {
    assert.equal(hermite(0, 0, 1, 0, 0.5), 0.5)
  })
})

// ---------------------------------------------------------------------------
// remap
// ---------------------------------------------------------------------------

describe('remap', () => {
  it('maps minimum of input range to minimum of output range', () => {
    assert.equal(remap(0, 0, 1, 10, 20), 10)
  })

  it('maps maximum of input range to maximum of output range', () => {
    assert.equal(remap(1, 0, 1, 10, 20), 20)
  })

  it('maps midpoint linearly', () => {
    assert.equal(remap(0.5, 0, 1, 0, 100), 50)
  })
})

// ---------------------------------------------------------------------------
// remapLog / remapExp
// ---------------------------------------------------------------------------

describe('remapLog', () => {
  it('returns bMin at aMin', () => {
    assert.equal(remapLog(0, 0, 1, 0.5, 2), 0.5)
  })

  it('returns bMax at aMax', () => {
    assert.equal(remapLog(1, 0, 1, 0.5, 2), 2)
  })
})

describe('remapExp', () => {
  it('returns bMin at aMin', () => {
    assert.equal(remapExp(0.5, 0.5, 2, 0, 1), 0)
  })

  it('returns bMax at aMax', () => {
    assert.equal(remapExp(2, 0.5, 2, 0, 1), 1)
  })
})
