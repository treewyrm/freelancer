# AI

`src/ai/` — `[Pilot]` and the seventeen behaviour blocks it names. The second domain module over
INI, and **the first written from [DICTIONARY.md](DICTIONARY.md) rather than from the files.**

`MISSIONS/pilots_population.ini` and `MISSIONS/pilots_story.ini` hold all of it but `[MetaBehavior]`,
which is in three story mission files. 18 sections, 610 occurrences, 187 `(section, property)` pairs.

## Why this module went second

[MODULES.md](MODULES.md) names it the best module to prove the typed layer on, and building it bore
that out: seventeen sections with a shared family resemblance, one repeated shape, no cross-file
resolution and no positional ownership. Everything that could go wrong is about the *typed layer*
rather than about the data, which is what made it a test of the layer.

It is also the module the wiki reaches best — **172 of 187 pairs, 92%** — so the readings below are
unusually complete for a first pass. Three sections have no page at all (`[MetaBehavior]`,
`[MineBlock]`, `[MissileReactionBlock]`) and four more are short a property each.

## What building it settled

### The helpers moved to `./schema`

[SCHEMA.md](SCHEMA.md)'s answer to its own first open question ended: *"If a second domain module
wants those helpers unchanged they move to `./schema`; that is when this is worth revisiting, and not
before."* This is that module, and the move happened — but not for the reason the sentence
anticipated.

**Invariant 2 made it mandatory rather than optional.** `./ai` importing `#/fx/field.js` would be one
domain module reaching into another's meaning layer, which the dependency rule forbids outright. The
"unchanged" condition never got to apply: the choice was `./schema` or a second copy.

Two helpers were added on the way, and both are general rather than `./ai`'s:

| Helper | For | Why the existing ones could not |
| --- | --- | --- |
| `field.values(list, 'sn')` | A **mixed tuple** — `evade_dodge_style_weight = waggle, 0.5` | `numbers` is numbers-only and `list` is strings-only |
| `field.rows(section, name)` | A **repeated property kept per occurrence** | `list` deliberately flattens, which loses which weight went with which name |

The dictionary is the evidence that neither is local: `[Zone] faction`, `[Group] rep`,
`[Explosion] debris_type`, `[WeaponType] shield_mod`, `[GF_NPC] bribe` and dozens more are the same
two shapes, spread across every module still to be built.

`field.flag` was added at the same time, for `[CollisionGroup] separable` — written as a bare
`separable` 456 times and as `separable = true` 28 times, which is the one field in the data that
occurs in both of SCHEMA.md's forms. A later sweep settled *why* it is one field in two spellings
rather than two readings: none of those 28 says `false`, and reading index 0 of a zero-value property
is a hard error in the game, so presence is the test. See
[INI.md](INI.md#how-the-game-reads-a-value)'s seventh consequence.

### The table-driven reader is not a runtime schema

`block.ts` reads all seventeen blocks from one table of field names. That looks like the declarative
schema SCHEMA.md rejected and is not: the table declares nothing but which of four kinds each name
is. It infers no TypeScript types, validates nothing, and the interfaces in `types.ts` are still
hand-written and still the contract.

The distinction that decides it is **whether the sections are alike**. `./fx`'s were heterogeneous —
a `[VisEffect]`, a `[BeamBolt]` and a `[fuse]` share nothing — so writing them out was shorter than
any table. `./ai`'s seventeen blocks share a shape, and seventeen hand-rolled readers would be
seventeen copies of the same three lines. A future module picks whichever is shorter for the sections
it has; that is the whole rule.

### The port onto the sequential walk cost nothing, which is why it went first

When `#/schema/property.js` arrived, this module was ported before `./fx` because its port could not
change any behaviour: **no field on any of the seventeen block sections repeats anywhere in retail**,
so last-wins and first-wins agree everywhere, and every count in `corpus.test.ts` had to come out
unmoved. It did. Anything that had moved would have been a bug in the walk rather than an expected
difference — which is the only reason to port a working reader at all.

What the module got for it: the field lists stay lists, but a name in one is now checked against the
block interface it is listed under, and the `known: string[]` that shadowed every reader is gone
because `unrecognized` is derived from the walk. The four `for` loops and their `Reflect.set` went
with it. `MB_GotoGuide` is the one field with no constructor for its shape — one occurrence, arity as
read, types unexamined — and is written as a plain `Instruction`, which is what that interface is
for.

## Three things a reader gets wrong by default

### `[Pilot]` is two sections sharing a name

319 of the 320 are behaviour pilots. The one in `CHARACTERS/newcharacter.ini` is the new-character
record — `body`, `comm`, `voice`, `body.anim`, `thumb`, `comm.anim` — and **shares only `nickname`**
with the other 319.

It is not filtered out. A section on its own does not say which file it came from, and guessing from
the property set would be a policy (Invariant 6), so it reads as a `Pilot` with every block field
absent and its six real properties in `unrecognized`. That round-trips exactly, and `isBehaviour` is
the test a consumer wants.

This is the strongest of the three cases in
[DICTIONARY.md](DICTIONARY.md#one-section-two-shapes-split-by-file), and together with `[Group]` it
is what moves SCHEMA.md's open question 2 off `[Sound]`, whose split is the ambiguous one.

### `inherit` carries most of the data

**290 of the 319 pilots have `inherit`**, and most of them carry little else. Reading a pilot's
behaviour without walking that chain reads almost nothing — `pilot_ai_sandbox` names sixteen blocks
and the pilots that inherit from it name none.

`inheritanceOf` walks the chain, nearest first, and stops at a cycle or a dead reference. It
**deliberately does not merge**: which field wins when two pilots in the chain set it is the
consumer's call, and a merged record cannot be un-merged.

### The weighted fields are tuples, not lists

`evade_dodge_style_weight = waggle, 0.5` is a name and a weight, and the property repeats once per
option. Read with `field.list` it flattens to `['waggle', '0.5', 'slide', '0.2']` and the pairing is
gone. `field.rows` + `field.values` keeps it.

Retail measurements worth knowing about them:

- `evade_dodge_style_weight` — **the wiki marks it repeatable; retail never repeats it.** One row in
  all 30 blocks.
- `evade_dodge_direction_weight` — 64 rows over 25 of the 30.
- `attack_preference` on `[JobBlock]` — **262 rows over 59 sections**, three positions each
  (`string, number, string`), and the most-repeated property in the module.

## The dead reference

**One block reference in retail resolves to nothing**, and it is a typo in the data:

| Pilot | Property | Value | Block that exists |
| --- | --- | --- | --- |
| `MSN10_Bundschuh` | `gun_id` | `story_gun_capship_msn10_bundschuh` | `story_gun_capship_msn10` |

Nine other pilots reference the same block and spell it correctly. Reported, never substituted — the
same treatment `./fx` gives its eight dead shield references, and for the same reason: a reader that
guesses which block was meant is deciding something the game may not.

## Reaching it through `./game`

**`pilots` is a hardcoded key, not a `[Data]` one.** `EXE/freelancer.ini` never mentions the pilot
files; `content.dll` opens them by name, which is why they are in
[`game/hardcoded.ts`](../src/game/hardcoded.ts)'s 58 paths.

`Game.open` therefore needs `hardcoded: true` before `game.ai` holds anything:

```ts
const game = await Game.open(fs, { hardcoded: true })

game.ai.pilots // 320, of which 319 are behaviour pilots
game.ai.blocks // 290 blocks across seventeen kinds
```

The option is **off by default** — turning it on changes what `Game.documents` and `Game.entries`
contain and existing consumers pin counts on both — and it is the first thing to walk the hardcoded
list at all. Everything `hardcoded.ts` already said about routing those files through the same
reader switch as `[Data]` is now true rather than planned.

## Corpus

`corpus.test.ts`, 14 cases, and the counts are the ones DICTIONARY.md claims — if the two disagree
the tree wins and the document gets fixed. What it pins:

| | |
| --- | --- |
| `[Pilot]` sections | 320, of which **319** are behaviour pilots |
| Pilots carrying `inherit` | 290 |
| Blocks, all seventeen kinds | `gunblock` 99, `jobblock` 59, `evadedodgeblock` 30, `missileblock` 20, `buzzheadtowardblock` 17, `formationblock` 10, `evadebreakblock` 8, `buzzpassbyblock` / `countermeasureblock` / `repairblock` / `metabehavior` 6, `damagereactionblock` / `strafeblock` 5, `trailblock` 4, `enginekillblock` / `mineblock` / `missilereactionblock` 3 |
| `attack_preference` rows | 262 over 59 job blocks |
| `evade_dodge_direction_weight` rows | 64 over 25 of 30 |
| Unresolved block references | **1**, and it is the typo above |
| `MB_GotoGuide` | 8 values in all 6, kept raw |
| Round trip | A fixed point; no property is dropped |

## TODO

| Question | Reading taken | Experiment |
| --- | --- | --- |
| Whether `inherit` merges field by field or wholesale — a pilot that sets one field and inherits the rest, versus one that replaces the whole block reference | Yield the chain; merge nothing. A consumer that assumes field-by-field and is wrong gets a pilot with a parent's gun block it should not have | Give a pilot an `inherit` and a single `gun_id`, and see whether its `job_id` still comes from the parent |
| What `[MetaBehavior] MB_GotoGuide`'s eight positions are | Not decoded, kept raw. Six sections with one sample each is not enough, and a guess here would be a value the game could disagree with | Change one position at a time in `m10.ini` and watch the escorted ship |
| Whether `fire_style = single` does what the wiki says, given retail is `multiple` ×98 and never uses it | Record the string; narrow nothing | Set a pilot's gun block to `single` and count the weapons firing |
| Whether the fields that are `0` in every retail occurrence — `evade_dodge_roll_angle`, `evade_dodge_waggle_axis_cone_angle`, `buzz_dodge_waggle_axis_cone_angle` — do anything at all | `unread`. A field the corpus never exercises cannot have its meaning read off the corpus | Set each to a large value and watch an evading fighter |
| Whether `[JobBlock] attack_preference`'s third position is a bitfield of flags or a single symbolic name | Keep it as text; parse nothing | Combine two flag names in one row and see whether both apply |

---

[DICTIONARY.md](DICTIONARY.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [GAME.md](GAME.md) · [FX.md](FX.md)
