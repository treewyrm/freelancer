# Effects

What fires, what it looks like, and the script that sequences it. `src/fx/`, exported as `./fx`.

The first domain module over INI, chosen for that on purpose. `./fx` is where an INI reference
becomes an asset — a `[VisEffect]` names an `.ale` and one effect inside it — so it is the shortest
path from the data graph to something a renderer can draw. It also carries the one structure nothing
else in the library has had to read: a **fuse script**, a run of sections that belong to the section
before them.

Its files are the `effects`, `effect_shapes` and `fuses` keys of `[Data]`, 30 of the 99 entries.
[`./game`](GAME.md) routes them here.

## `effect_crc` is the case-sensitive hash

An `.ale` holds several effects and a `[VisEffect]` picks one by a CRC of the effect's name rather
than by the name. Which CRC is the whole content of this module, because picking wrong yields a
number rather than an error.

> **`effect_crc` is `getResourceId(name, true)`.**

Measured across all 1,218 retail `[VisEffect]` sections:

| Hash | Resolves | Loses | Gains |
| --- | --- | --- | --- |
| `getResourceId(name, true)` — case-sensitive | **1,210** | — | — |
| `getResourceId(name)` — folded | 1,150 | 60 | **0** |

The folded hash resolves a **strict subset**. It never wins and it loses 60, which is exactly the
number of mixed-case effect names in the corpus. That is what makes the wrong choice hard to notice:
it works for 94% of the data, because most effect names are already lowercase and the two hashes
agree there, and it fails on `gf_TLR_exit`, `GravityWell1020`, `Intro_planetchunk_sun` and the other
57 by resolving to nothing.

This is the INI side of the rule [ALCHEMY.md](ALCHEMY.md) already states for the inside of an `.ale`,
where node instances reference their nodes case-sensitively too. Alchemy is consistent with itself;
it is the rest of the library that folds.

**Eight resolve through neither hash**, and they are dead references rather than a reader fault:
`gf_{br,ku,li,rh}_shield0{2,3}` each name a `…shield01.ale` that defines only `…shield01`. The same
kind of thing as the 20 material references that live outside the asset tree.

All **3,818** `textures` references resolve through the folded path index, none outstanding. Twenty
`[VisEffect]` name no textures at all, and stay absent rather than gaining an empty list.

## A fuse is a script, not a record

A fuse is what runs when something is damaged or destroyed: effects start at hardpoints, groups and
attachments come off, an impulse pushes the debris, and another fuse may be lit partway through.

It is written as **a `[fuse]` section followed by a run of action sections, one per event, until the
next `[fuse]`**. Nothing links them but position — no nickname, no index, no count — so a reader that
treats sections as independent records reads 1,960 orphaned actions and loses every script in the
game.

```ini
[fuse]
name = death_comm
lifetime = 1
death_fuse = true

[tumble]
at_t = 0
ang_drag_scale = 0.3

[destroy_hp_attachment]
at_t = 0, 1
hardpoint = random
fate = debris

[destroy_root]
at_t = 1
```

The grouping is **total**. Across the 17 `FX/fuse*.ini` files: **209 `[fuse]` sections, 1,960 action
sections, and zero actions before the first `[fuse]`.** A run always has an owner, so `readFuses`
has no orphan case to invent a policy for — it throws if a tree ever disagrees, because silently
dropping the sections is how a mod loses its death sequence.

Of those, the game loads **192 scripts and 1,922 actions**: `FX/fuse_li_battleship.ini` is on disk
and absent from `[Data] fuses`.

`[fuse]` identifies itself by **`name`**, where every other archetype in the data uses `nickname`.
`getNickname` already takes the property name as a parameter, so nothing new was needed — but a
lookup assuming `nickname` finds no fuses at all.

### The twelve action kinds

| Section | Count | | Section | Count |
| --- | --- | --- | --- | --- |
| `start_effect` | 1,353 | | `start_cam_particles` | 13 |
| `destroy_group` | 291 | | `damage_root` | 7 |
| `destroy_hp_attachment` | 163 | | `damage_group` | 3 |
| `ignite_fuse` | 74 | | `tumble` | 1 |
| `destroy_root` | 37 | | `make_invincible` | 1 |
| `impulse` | 16 | | `dump_cargo` | 1 |

They sum to 1,960 and match [MODULES.md](MODULES.md)'s flat `./fx` counts exactly — that table
counted the sections; the grouping is the structure it does not capture.

`ignite_fuse` is what makes fuses a graph rather than a list.

### `at_t`

**1,921 of the 1,960 actions carry one; 39 do not** — 38 `start_effect` and the single
`make_invincible`. Making it required invents a zero for 39 events.

Arity is **1 value ×1,904 and 2 values ×17**, and is kept exactly as read so a round trip cannot
invent or drop a number. `timeOf(action, pick)` collapses it, with the choice injected rather than
assumed — Invariant 5, and a viewer that scrubs a timeline needs the choice reproducible rather than
fresh every frame.

## Round trip and residue

Every property is independently optional, absent stays absent, a repeated property is an ordered
list, and **unrecognized properties are preserved**. Retail needs the last one before any mod does:

| Section | Property | Count |
| --- | --- | --- |
| `[Effect]` | `:` | 1 |
| `[start_effect]` | `particles` | 3 |
| `[start_effect]` | `ONLY` | 1 |
| `[start_effect]` | `age_fire` | 1 |
| `[destroy_group]` | `separable` | 1 |
| `[destroy_group]` | `dmg_hp` | 1 |
| `[destroy_group]` | `dmg_obj` | 1 |

The `[Effect]` one is an author's separator line written without a comment marker —
`: = ==================================` — which the compiler kept and so does this.

Type tags are ignored throughout, as [SCHEMA.md](SCHEMA.md) requires: `[EffectType] radius`,
`run_time`, `head_width`, `core_width`, `head_brightness`, `trail_brightness` and `[fuse] lifetime`
are each float-typed in some files and int-typed in others and mean the same number in both.

## What building this settled in SCHEMA.md

[SCHEMA.md](SCHEMA.md) left three questions open, to be answered once the first domain modules
existed rather than guessed. Two of them are answered now.

**Runtime schema objects, or hand-written readers?** Hand-written readers, over a handful of field
helpers in `field.ts`. The section shapes here are small, heterogeneous and full of one-off residue,
and a declarative schema able to express all of it would be larger than the readers it replaced. It
also reads the way every UTF reader in this library already reads, which matters more than saving
lines. If a second domain module wants those helpers unchanged, they move to `./schema` — that is
when the question is worth revisiting.

**Strict or lenient validation?** Lenient with a diagnostics channel, as SCHEMA.md was leaning.
Missing *required* identity throws naming the section, because a `[fuse]` without a `name` cannot be
referenced; everything else is optional and everything unrecognized is kept.

The third — whether one schema per section is enough — `./fx` does not test, because none of its
sections change shape by file. `[Sound]` is still the case that decides it.

**And it adds a fourth question SCHEMA.md's identity section does not cover.** That section splits
sections into nicknamed archetypes, un-nicknamed singletons, and positional. A fuse script is a
fourth kind: **an opener that owns the run following it**, identified by `name`. `[Trigger]`'s
`act_*` lists and the `destroy_*` families in a ship's death sequence will need the same shape, which
is the argument for having built it here first.

That shape is now `runs` in [`src/schema/document.ts`](../src/schema/document.ts), and `readFuses` is
three lines over it with the same throw and the same order. Building it generic found that it is
**not one rule**: `[fuse]` owns *every* section until the next opener, but `shiparch.ini`'s
`[CollisionGroup]` attaches to the last `[Ship]` while its 157 `[Simple]` sections interleave between
ships without belonging to one. Applying `[fuse]`'s rule there would hand every `[Simple]` to
whichever ship happened to precede it, so a caller names the member kinds when only some attach.

### Reading it sequentially moved three sections, and only three

`readAction`'s twelve `switch` arms are twelve small tables now, and its six closures — each pushing
to a hand-maintained `known: string[]` — are gone with the `Reflect.set` they existed to feed. The
port is not behaviour-neutral, unlike `./ai`'s, and the whole of the difference is this:

| File | Section | Property | Was (first) | Is (last) |
| --- | --- | --- | --- | --- |
| `FX/fuse_ku_battleship.ini` | `[start_effect]` | `effect` | `explosion_sfx_csx_flash01` | `gf_explosion_ku_battleship_smallexp` |
| `FX/fuse_li_dreadnought.ini` | `[start_effect]` | `effect` | `explosion_sfx_csx_sectional04` | `gf_explosion_li_battleship_mainexpbig` |
| `FX/fuse_li_dreadnought.ini` | `[start_effect]` | `pos_offset` | `0, 0, 70` | `30, -20, 70` |
| `FX/fuse_or_osiris.ini` | `[start_effect]` | `effect` | `explosion_sfx_csx_sectional04` | `gf_explosion_li_battleship_mainexpbig` |
| `FX/fuse_or_osiris.ini` | `[start_effect]` | `pos_offset` | `0, 0, 70` | `30, -20, 70` |

Every other repeated property in these seventeen files writes the same value twice (`at_t`,
`ori_offset`, `attached`) or accumulates rather than overriding (`hardpoint`). `corpus.test.ts`
asserts the whole list rather than the count, because [SCHEMA.md](SCHEMA.md)'s TODO on first-wins
versus last-wins is still open and this is exactly what would have to change if the game disagrees.

### Not preserved

Property **interleaving** does not survive a write-back: recognized fields go out in the order the
reader declares them, and unrecognized ones follow in their original relative order. SCHEMA.md's
round-trip clause asks for "property order within a section", and this is weaker than that by the
width of the interleave. Byte-exactness is the encoding layer's guarantee — a tool that must not
perturb bytes edits the interim document, which `Game.documents` keeps for exactly this reason.

## TODO

| Question | Reading taken | Experiment |
| --- | --- | --- |
| What a two-value `at_t` means | A **min/max the game picks a moment from**, not a start and an end. Corroborated three ways: all 17 are `destroy_*` actions, all 17 ascend, five pair the range with `hardpoint = random` / `group_name = random`, and the other twelve give the six turrets of `fuse_space_police01` and `fuse_space_mining01` an *identical* `0.1, 0.9` window with *fixed* hardpoints — which only means anything if each picks a different moment inside it | Give two `destroy_hp_attachment` actions the same wide window and watch whether the attachments come off together or apart |
| What `lifetime` bounds, given it is not the script's duration | Keep both; derive neither from the other. **61 of the 1,921 timed actions fire after their fuse's `lifetime`, one by a factor of a hundred** | Set `lifetime` below an action's `at_t` and see whether the action still fires |
| Whether the eight dead shield references are ignored or fall back to the `01` effect | Report unresolved; do not substitute | Fit a ship with `gf_br_shield02` and see whether anything draws |
| Whether trailing values beyond a beam field's known arity are read | Keep them; expose the full list | Extend `tip_color` by a fourth value and look for a change |

---

[ALCHEMY.md](ALCHEMY.md) · [GAME.md](GAME.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [RETAIL.md](RETAIL.md)
