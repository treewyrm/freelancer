# Dictionary

Every retail `(section, property)` pair, grouped by the module that will read it, with the
measurement beside the reading.

**This document exists to be built from.** [MODULES.md](MODULES.md) says which module owns which
section; this says what the properties in it are, so `src/<module>/types.ts` is a transcription of a
table here rather than an act of invention. [`./fx`](FX.md) was written before this existed and is
recorded here after the fact, as the worked example of what a finished module's tables look like.

Two sources, joined:

- **The retail sweep** — 1,252 `.ini` files under `DATA`, read with `./ini`, giving **257 distinct
  sections over 2,080 distinct `(section, property)` pairs** with occurrence counts, arity histograms
  and value-type signatures. It cannot be argued with and it says nothing about meaning.
- **The community wiki** — [ini-editing](https://wiki.librelancer.net/) as of `7d88090`. It reaches
  **1,255 of the 2,080 pairs, 60%**, and carries the half the sweep cannot produce: which fields are
  paths, which enumerations are closed, what a number means. Its own pages say to take it with a
  pinch of salt, and 21 of its 80 are empty.

Neither is sufficient. Reading `[Sound] range = INT, INT` from the wiki alone and declaring a fixed
pair invents a second number for the 11 sounds that carry one — [SCHEMA.md](SCHEMA.md)'s own worked
example of the trap. The sweep's `1 ×11, 2 ×369` is what makes that row buildable. Equally, the sweep
alone cannot tell you that `[Solar] DA_archetype` is a path and `[Solar] type` is not.

Section names, property names and arities are facts about Digital Anvil's data. The wiki's prose is
its authors' and is **restated here, never reproduced** — it is GPL-3.0 and this package is MIT.

## Reading a row

| Column | What it is |
| --- | --- |
| **Property** | As authored. Compared case-insensitively everywhere, as `./ini` does |
| **Kind** | The field kind, which is also the reader call — see below |
| **Retail** | Occurrences, then the arity histogram **wherever arity varies**. A single arity is left implicit in the kind |
| **Reading** | What it means, in one line. Empty where nothing knows |
| **Status** | `confirmed` / `inferred` / `guessed` / `unread` |

**Kind** is [SCHEMA.md](SCHEMA.md)'s field kinds, each having a constructor in
[`src/schema/property.ts`](../src/schema/property.ts) and a lookup helper in
[`src/schema/field.ts`](../src/schema/field.ts):

| Kind | TypeScript | Instruction | Lookup | When |
| --- | --- | --- | --- | --- |
| scalar | `string` / `number` / `boolean` | `text` / `number` / `boolean` | `field.text` / `field.number` / `field.boolean` | one value; a repeat overrides |
| tuple | `[number, number]`, `[number, number, number]` | `tuple(n, into)` | `field.tuple(n)` | fixed positions, refused at any other width |
| list | `number[]` / `string[]` | `numbers` / `strings` | `field.numbers` | unbounded values on one line |
| accumulating | `string[]` | `merge` | `field.list` | one list however written — on one line or over many |
| repeated | `T[]` | `each(into, row, values)` | `filterProperties` + a per-row read | the property occurring many times, each a record |
| flag | `boolean` | `flag` | `field.flag` | present with no values — **or** with `= true`, which is the same fact |
| group | `T[]` | `group(name, into, …)` | — | an opener owning the properties after it |
| undecoded | `Value[][]` | `raw` | `field.rows` | kept exactly as read, because nothing knows what it means |

Two corrections to what this table used to say. The helpers moved from `src/fx/` to `src/schema/`
when `./ai` became the second module to want them. And **flag was listed as `hasProperty`, which is
the wrong test** — `hasProperty` is true for a property that carries values too, so it cannot tell
a flag from anything else that happens to be present.

A kind written `tuple(2/3)` means the arity varies and both widths occur — **keep what was read**
rather than padding, which is the rule `at_t` already follows in `./fx`.

**Status** is [ALCHEMY.md](ALCHEMY.md)'s vocabulary, unchanged, and so is its rule: **only
observation in the running game reaches `confirmed`, and a `guessed` reading never derives a value
the game might disagree with.** A wiki claim enters at `guessed`; the sweep corroborating it — the
declared arity matching the measured one, a `BOOL` field carrying only `true`/`false` by name, an
enumeration's retail values being a subset of the named set — moves it to `inferred`. `unread` means
the property is in the data and nothing here knows why.

Three things get rows rather than being dropped:

- A retail property the wiki misses — **825 of them**, at `unread`.
- A wiki property with no retail occurrence — listed under its section as **wiki-only**. 94 in total,
  each either a mod-era field, a misspelling, or wrong.
- A section with no wiki page at all — the table is written anyway, entirely from the sweep.

## What is not here

No defaults, and no behaviour. A default written down is a claim about the game that the file did not
make, and Invariant 6 puts it with the consumer. Where a property is absent from most sections that
is recorded as a count, not filled in.

## Coverage

Ordered as built. `./fx` and `./ai` are done; the rest are the queue.

| Module | Sections | Pairs | Wiki reaches | |
| --- | --- | --- | --- | --- |
| [`./ai`](#ai) **built** | 18 | 187 | 172 | 92% |
| [`./audio`](#audio) | 5 | 46 | 19 | 41% |
| [`./universe`](#universe) | 21 | 162 | 117 | 72% |
| [`./base`](#base) | 10 | 36 | 16 | 44% |
| [`./equipment`](#equipment) | 33 | 416 | 195 | 47% |
| [`./ships`](#ships) | 11 | 92 | 82 | 89% |
| [`./solar`](#solar) | 29 | 234 | 128 | 55% |
| [`./fx`](#fx) **built** | 25 | 167 | 148 | 89% |
| [`./interface`](#interface) | 42 | 303 | 40 | 13% |
| [`./characters`](#characters) | 12 | 32 | 27 | 84% |
| [`./constants`](#constants) | 5 | 21 | 21 | 100% |
| [`./randommissions`](#randommissions) | 10 | 44 | 0 | 0% |
| [`./missions`](#missions) | 36 | 340 | 290 | 85% |
| | **257** | **2,080** | **1,255** | **60%** |

The gap is concentrated, not spread, and the concentration is the useful part: `./interface` at 13%
and `./randommissions` at 0% will be built from the sweep and from observation, and `./base` at 44%
is missing exactly the sections that describe a room's contents. Plan accordingly rather than
discovering it three modules in.

### Two corrections to MODULES.md

Both found by making the partition total, and neither changes a count anywhere else:

- **`[locked_gates]` and `[Group]` were unassigned or misassigned.** MODULES.md states the partition
  covers 256 names; the sweep finds **257**, and `[locked_gates]` (`initialworld.ini`, one section
  holding 27 `locked_gate` values) is the one with no home. `[Group]` is counted at 3 and given to
  `./interface`, but 55 of its 58 are the faction groups in `initialworld.ini` — the `groups`
  `[Data]` key — and belong to `./universe`.
- **`[Pilot]` is not wholly `./ai`.** 319 of the 320 are the AI pilots in `MISSIONS/pilots_*.ini`;
  the one in `CHARACTERS/newcharacter.ini` is the new-character record and belongs to `./characters`.

### One section, two shapes, split by file

[SCHEMA.md](SCHEMA.md)'s open question 2 asks whether a section's shape genuinely depends on the file
it appears in, names `[Sound]` as the case that decides it, and notes `./fx` did not test it. The
sweep finds **three** instances, and two of them are stronger evidence than `[Sound]`, because their
two shapes **share no property but `nickname`**:

| Section | Shape A | Shape B | Overlap |
| --- | --- | --- | --- |
| `[Group]` | `initialworld.ini` ×55 — `nickname`, `ids_name`, `ids_info`, `ids_short_name`, `rep` | `INTERFACE/keylist.ini` ×3 — `group_num`, `name` | **none** |
| `[Pilot]` | `MISSIONS/pilots_*.ini` ×319 — 17 `*_id` references and `inherit` | `CHARACTERS/newcharacter.ini` ×1 — `body`, `comm`, `voice`, `body.anim`, `thumb`, `comm.anim` | `nickname` only |
| `[Sound]` | sound definitions ×1,817 — carry `nickname` | voice banks ×23,997 — do not | partial |

A section the game disambiguates by file would still be one shape read leniently. Two shapes with a
null intersection cannot be that. **The reading taken here is two sections sharing a name**, modelled
separately, which is what SCHEMA.md was already leaning toward — and it no longer rests on `[Sound]`,
whose split is the ambiguous one of the three. The experiment named there still stands for `[Sound]`
itself.

---

## `./ai`

**18 sections, 187 pairs, wiki reaches 172 (92%).** `MISSIONS/pilots_population.ini` and
`MISSIONS/pilots_story.ini` hold all of it but `[MetaBehavior]`, which is in three story mission
files. There is no cross-file resolution and no nesting: one `[Pilot]` names a block of each kind by
nickname, and the blocks are flat records. That is why MODULES.md calls this the module to prove the
schema machinery on.

**Naming conventions, stated once.** They hold across every block and make the tables below terse:

| Suffix | Means | Kind |
| --- | --- | --- |
| `_time` | seconds | scalar `number` |
| `_variance_percent` | fraction of the paired `_time` to jitter it by, `0`–`1` | scalar `number` |
| `_throttle` | a `0`–`1` control input, never above `1` in retail | scalar `number` |
| `_cone_angle` | degrees, not radians — retail carries `75`, `90`, `180` | scalar `number` |
| `_distance` / `_range` | metres | scalar `number` |
| `_percent` | a fraction `0`–`1`, not `0`–`100` | scalar `number` |
| `_style_weight` / `_direction_weight` | `name, weight` — repeated, one row per option | repeated tuple |
| `_id` (on `[Pilot]`) | nickname of a block of the matching kind | scalar `string` |

**Booleans are spelled four ways** — `False` ×34, `FALSE` ×14, `True` ×3, `TRUE` ×2 on a typical
field — and never as a BINI boolean, since retail has none. `field.boolean` reads all four, and `yes`
would read as **false**; nothing in this module writes `yes`.

**The int/float tag is pure residue here.** 23 of these fields are int-typed in one file and
float-typed in another for the same meaning — `gun_fire_interval_time` is `f/i`,
`gun_fire_burst_interval_time` is `i/f`. Declare `number` and coerce, per SCHEMA.md.

### `[Pilot]` — 320, in 3 files

**319 of them.** The one in `CHARACTERS/newcharacter.ini` is a different section sharing the name and
is tabulated under [`./characters`](#characters).

Every `*_id` names a block of the matching kind by its `nickname`; a reader resolves them against the
block tables, and nothing here resolves across files.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 320 | Identity. What `[NPCShipArch] pilot` names | inferred |
| `inherit` | scalar `string` | 290 | Another `[Pilot]` to take unset fields from. Present on 290 of 320, which is why so many pilots carry almost nothing else | guessed |
| `gun_id` | scalar `string` | 148 | → `[GunBlock]` | inferred |
| `job_id` | scalar `string` | 62 | → `[JobBlock]` | inferred |
| `evade_dodge_id` | scalar `string` | 63 | → `[EvadeDodgeBlock]` | inferred |
| `missile_id` | scalar `string` | 43 | → `[MissileBlock]` | inferred |
| `buzz_head_toward_id` | scalar `string` | 39 | → `[BuzzHeadTowardBlock]` | inferred |
| `buzz_pass_by_id` | scalar `string` | 39 | → `[BuzzPassByBlock]` | inferred |
| `evade_break_id` | scalar `string` | 38 | → `[EvadeBreakBlock]` | inferred |
| `damage_reaction_id` | scalar `string` | 25 | → `[DamageReactionBlock]` | inferred |
| `trail_id` | scalar `string` | 20 | → `[TrailBlock]` | inferred |
| `strafe_id` | scalar `string` | 20 | → `[StrafeBlock]` | inferred |
| `mine_id` | scalar `string` | 20 | → `[MineBlock]` | inferred |
| `countermeasure_id` | scalar `string` | 20 | → `[CountermeasureBlock]` | inferred |
| `formation_id` | scalar `string` | 18 | → `[FormationBlock]` | inferred |
| `engine_kill_id` | scalar `string` | 17 | → `[EngineKillBlock]` | inferred |
| `missile_reaction_id` | scalar `string` | 17 | → `[MissileReactionBlock]` | inferred |
| `repair_id` | scalar `string` | 17 | → `[RepairBlock]` | inferred |

There is no `metabehavior_id`. `[MetaBehavior]` is reached from mission scripts, not from a pilot.

**One of these references is dead**, and it is a typo in the data rather than a missing block:
`MSN10_Bundschuh` asks for `story_gun_capship_msn10_bundschuh`, the block is named
`story_gun_capship_msn10`, and the nine other pilots that use it spell it correctly. Found by
building the module; reported, never substituted.

### `[GunBlock]` — 99

When and how accurately the pilot shoots. Every field is present on all 99 but the last four, and the
fields divide into the primary weapon (`gun_*`) and the auto-turrets (`auto_turret_*`), which run on
their own clock.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 99 | Identity | inferred |
| `gun_fire_interval_time` | scalar `number` | 99 | Seconds between shots within a burst | guessed |
| `gun_fire_interval_variance_percent` | scalar `number` | 99 | Jitter on it. `0.5` on 90 of 99 | guessed |
| `gun_fire_burst_interval_time` | scalar `number` | 99 | Seconds between bursts | guessed |
| `gun_fire_burst_interval_variance_percent` | scalar `number` | 99 | Jitter on it | guessed |
| `gun_fire_no_burst_interval_time` | scalar `number` | 99 | Interval used when the weapon does not burst | guessed |
| `gun_fire_accuracy_cone_angle` | scalar `number` | 99 | Half-angle of the spread the shot is scattered into. `0.5`–`8` | guessed |
| `gun_fire_accuracy_power` | scalar `number` | 99 | Shapes the distribution inside that cone; higher clusters toward centre | guessed |
| `gun_fire_accuracy_power_npc` | scalar `number` | 97 | The same against an NPC rather than the player. Consistently harsher — `3` and `6` dominate against the player's `1.1` | guessed |
| `gun_range_threshold` | scalar `number` | 98 | Multiple of weapon range within which it will open fire. `1.1` on 94 of 98 | guessed |
| `gun_range_threshold_variance_percent` | scalar `number` | 96 | Jitter on it | guessed |
| `gun_target_point_switch_time` | scalar `number` | 98 | Seconds before re-aiming at a different point on the target | guessed |
| `fire_style` | scalar `string` | 98 | `single` fires one weapon at a time, `multiple` fires freely. **Retail is `multiple` ×98 and nothing else** — the wiki names a value the data never uses | guessed |
| `auto_turret_interval_time` | scalar `number` | 99 | As `gun_fire_interval_time`, for turrets | guessed |
| `auto_turret_burst_interval_time` | scalar `number` | 99 | As `gun_fire_burst_interval_time` | guessed |
| `auto_turret_burst_interval_variance_percent` | scalar `number` | 99 | Jitter on it | guessed |
| `auto_turret_no_burst_interval_time` | scalar `number` | 99 | As `gun_fire_no_burst_interval_time` | guessed |

`100000` appears as a value of four of the interval fields, in one block each — the idiom for
"never", since no engagement lasts a day.

### `[JobBlock]` — 59

What the pilot is doing when not in a manoeuvre: whom it follows, when it runs, and what it picks up.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 59 | Identity | inferred |
| `attack_preference` | **repeated** tuple | 262 over 59 sections, repeating in 56 — arity 3 `string, int, string` | Target class, a weight, and a bitfield naming the conditions. The most-repeated property in the module | guessed |
| `wait_for_leader_target` | scalar `boolean` | 51 | Hold fire until the wing leader has picked a target | guessed |
| `maximum_leader_target_distance` | scalar `number` | 32 | Metres beyond which the leader's target is ignored | guessed |
| `flee_when_leader_flees_style` | scalar `boolean` | 51 | Named `_style` but written `True`/`False` throughout | guessed |
| `flee_when_hull_damaged_percent` | scalar `number` | 51 | Hull fraction at which it runs. `0` on 30 of 51 — most pilots never flee on damage | guessed |
| `flee_no_weapons_style` | scalar `boolean` | 51 | Flee when disarmed. `True` on 49 of 51 | guessed |
| `flee_scene_threat_style` | scalar `string` | 51 | Threat level at which it disengages. `easy` \| `equal` \| `hard` \| `hardest` | inferred |
| `scene_toughness_threshold` | scalar `string` | 51 | Same vocabulary, deciding whether to engage at all | inferred |
| `loot_flee_threshold` | scalar `string` | 51 | Same vocabulary, plus `easiest` — deciding whether to break off to collect loot | inferred |
| `loot_preference` | scalar `string` | 51 | `lt_none` \| `lt_all` \| `lt_commodities` \| `lt_potions` | inferred |
| `attack_subtarget_order` | scalar `string` | 51 | `anything` in all 51 — the only value retail uses | guessed |
| `field_targeting` | scalar `string` | 51 | Whether to fight inside an asteroid field. `never` \| `always` \| `low_density` \| `high_density` | inferred |
| `force_attack_formation` | scalar `boolean` | 27 | Attack while holding formation | guessed |
| `combat_drift_distance` | scalar `number` | 35 | Metres the engagement is allowed to wander from where it started | guessed |
| `allow_player_targeting` | scalar `boolean` | 1 | | unread |

The four threat-level fields share one closed vocabulary — `easiest`, `easy`, `equal`, `hard`,
`hardest` — and it is worth a shared type. Retail spells them in both cases (`HARDEST` ×14 beside
`hardest` ×19), which is why every comparison folds.

### `[EvadeDodgeBlock]` — 30

The largest block by field count, and the one the wiki documents best — most of these readings are
its authors' observations from the running game rather than guesses, but they are recorded here at
`guessed` because this repository has not observed them.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 30 | Identity | inferred |
| `evade_dodge_style_weight` | tuple(2) `string, number` | 30 | Dodge style and its weight — `waggle`, `waggle_random`, `slide`, `corkscrew`. **The wiki marks this repeatable; retail never repeats it**, one per block in all 30 | guessed |
| `evade_dodge_direction_weight` | **repeated** tuple(2) | 64 over 25 sections | Direction and weight — `left`, `right`, `up`, `down` | guessed |
| `evade_activate_range` | scalar `number` | 29 | Metres within which a threat in the cone triggers evasion. Lower is more aggressive | guessed |
| `evade_dodge_cone_angle` | scalar `number` | 30 | The cone that pairs with it. Degrees — `75` on half of them | guessed |
| `evade_dodge_cone_angle_variance_percent` | scalar `number` | 29 | `0.5` on all 29 | guessed |
| `evade_dodge_interval_time` | scalar `number` | 30 | Seconds before evasion can be re-entered | guessed |
| `evade_dodge_interval_time_variance_percent` | scalar `number` | 30 | Jitter on it | guessed |
| `evade_dodge_time` | scalar `number` | 30 | Seconds one evasion lasts at most | guessed |
| `evade_dodge_distance` | scalar `number` | 30 | Metres of separation that ends it | guessed |
| `evade_dodge_turn_throttle` | scalar `number` | 29 | `0` makes every evasion a straight line | guessed |
| `evade_dodge_slide_throttle` | scalar `number` | 29 | For the `slide` style | guessed |
| `evade_dodge_roll_angle` | scalar `number` | 29 | `0` in all 29 | unread |
| `evade_dodge_waggle_axis_cone_angle` | scalar `number` | 29 | `0` in all 29 | unread |
| `evade_dodge_corkscrew_turn_throttle` | scalar `number` | 29 | For the `corkscrew` style; `0` flattens it | guessed |
| `evade_dodge_corkscrew_roll_throttle` | scalar `number` | 29 | Same | guessed |
| `evade_dodge_corkscrew_roll_flip_direction` | scalar `boolean` | 29 | `False` in all 29 | unread |

Two fields sit at `unread` despite the wiki naming them, because it carries a value for them and the
data does not vary: a field that is `0` in all 29 occurrences cannot have its meaning read off the
corpus, and a reading that is only a guess about an unexercised field is worth less than saying so.

### `[BuzzHeadTowardBlock]` — 17

The approach run. Pairs with `[BuzzPassByBlock]`, which is the departure.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 17 | Identity | inferred |
| `buzz_head_toward_style_weight` | **repeated** tuple(2) | 21 over 17 sections | Approach style and weight | guessed |
| `buzz_dodge_direction_weight` | **repeated** tuple(2) | 22 over 9 sections | Direction and weight, as the evade block's | guessed |
| `buzz_min_distance_to_head_toward` | scalar `number` | 17 | Metres at which the run begins | guessed |
| `buzz_min_distance_to_head_toward_variance_percent` | scalar `number` | 17 | Jitter on it | guessed |
| `buzz_max_time_to_head_away` | scalar `number` | 17 | Seconds spent heading away before turning back | guessed |
| `buzz_head_toward_engine_throttle` | scalar `number` | 17 | `0.8` on 16 of 17 | guessed |
| `buzz_head_toward_turn_throttle` | scalar `number` | 17 | | guessed |
| `buzz_head_toward_roll_throttle` | scalar `number` | 17 | | guessed |
| `buzz_head_toward_roll_flip_direction` | scalar `boolean` | 4 | `False` in all 4 | unread |
| `buzz_dodge_turn_throttle` | scalar `number` | 16 | Dodging *during* the approach, which is why the dodge fields repeat here | guessed |
| `buzz_dodge_cone_angle` | scalar `number` | 16 | | guessed |
| `buzz_dodge_cone_angle_variance_percent` | scalar `number` | 16 | `0.5` in all 16 | guessed |
| `buzz_dodge_waggle_axis_cone_angle` | scalar `number` | 16 | `0` in all 16 | unread |
| `buzz_dodge_roll_angle` | scalar `number` | 16 | | guessed |
| `buzz_dodge_interval_time` | scalar `number` | 16 | | guessed |
| `buzz_dodge_interval_time_variance_percent` | scalar `number` | 16 | | guessed |
| `buzz_slide_throttle` | scalar `number` | 3 | | guessed |
| `buzz_slide_interval_time` | scalar `number` | 3 | | guessed |
| `buzz_slide_interval_time_variance_percent` | scalar `number` | 3 | `0.5` in all 3 | guessed |

### `[BuzzPassByBlock]` — 6

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 6 | Identity | inferred |
| `buzz_pass_by_style_weight` | **repeated** tuple(2) | 9 over 6 sections | Departure style and weight | guessed |
| `buzz_break_direction_weight` | **repeated** tuple(2) | 10 over 5 sections | Break direction and weight | guessed |
| `buzz_distance_to_pass_by` | scalar `number` | 6 | Metres of the closest approach | guessed |
| `buzz_pass_by_time` | scalar `number` | 6 | Seconds the pass lasts | guessed |
| `buzz_break_direction_cone_angle` | scalar `number` | 4 | `90` in all 4 | guessed |
| `buzz_break_turn_throttle` | scalar `number` | 6 | | guessed |
| `buzz_pass_by_roll_throttle` | scalar `number` | 4 | | guessed |
| `buzz_drop_bomb_on_pass_by` | scalar `boolean` | 4 | Release a bomb at the closest point | guessed |

### `[EvadeBreakBlock]` — 8

The hard break, as opposed to the dodge. Every `nickname` here is distinct and each is used by
exactly one style, which is why there are only eight.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 8 | Identity | inferred |
| `evade_break_style_weight` | **repeated** tuple(2) | 15 over 8 sections | Break style and weight | guessed |
| `evade_break_direction_weight` | **repeated** tuple(2) | 16 over 7 sections | Break direction and weight | guessed |
| `evade_break_time` | scalar `number` | 8 | `5` in all 8 | guessed |
| `evade_break_interval_time` | scalar `number` | 8 | `2.5` in all 8 | guessed |
| `evade_break_roll_throttle` | scalar `number` | 8 | | guessed |
| `evade_break_turn_throttle` | scalar `number` | 7 | `1` in all 7 | guessed |
| `evade_break_afterburner_delay` | scalar `number` | 8 | `0` in all 8 | guessed |
| `evade_break_afterburner_delay_variance_percent` | scalar `number` | 4 | `0` in all 4 | unread |
| `evade_break_attempt_reverse_time` | scalar `number` | 4 | `0` in all 4 | unread |
| `evade_break_reverse_distance` | scalar `number` | 4 | `0` in all 4 | unread |

### `[MissileBlock]` — 20

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 20 | Identity | inferred |
| `missile_launch_interval_time` | scalar `number` | 20 | Seconds between launches | guessed |
| `missile_launch_interval_variance_percent` | scalar `number` | 20 | Jitter on it | guessed |
| `missile_launch_range` | scalar `number` | 20 | Metres. `1000` on 14 of 20, `2000` on the rest | guessed |
| `missile_launch_cone_angle` | scalar `number` | 20 | Degrees off the nose the target must be within. One block uses `180`, which is every direction | guessed |
| `missile_launch_allow_out_of_range` | scalar `boolean` | 20 | Fire anyway when beyond `missile_launch_range` | guessed |

### `[MissileReactionBlock]` — 3 — no wiki page

What the pilot does about an incoming missile. Read entirely from the sweep.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 3 | Identity | inferred |
| `evade_missile_distance` | scalar `number` | 3 | `1000` in all 3. Metres at which the missile is reacted to, by the naming convention | guessed |
| `evade_break_missile_reaction_time` | scalar `number` | 2 | | unread |
| `evade_slide_missile_reaction_time` | scalar `number` | 2 | | unread |
| `evade_afterburn_missile_reaction_time` | scalar `number` | 2 | | unread |

The three `_reaction_time` fields name the three evasions the pilot can answer with, which is a
reading from the names alone. Nothing corroborates it.

### `[DamageReactionBlock]` — 5

Uniform: every field is a `_percent` / `_time` pair naming what to do at what damage level, and all
five sections carry all thirteen.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 5 | Identity | inferred |
| `evade_break_damage_trigger_percent` | scalar `number` | 5 | Hull fraction that triggers a break | guessed |
| `evade_dodge_more_damage_trigger_percent` | scalar `number` | 5 | …that triggers heavier dodging | guessed |
| `engine_kill_face_damage_trigger_percent` | scalar `number` | 5 | …that triggers an engine-kill turn | guessed |
| `engine_kill_face_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |
| `roll_damage_trigger_percent` | scalar `number` | 5 | …that triggers a roll | guessed |
| `roll_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |
| `afterburner_damage_trigger_percent` | scalar `number` | 5 | …that triggers the afterburner | guessed |
| `afterburner_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |
| `brake_reverse_damage_trigger_percent` | scalar `number` | 5 | …that triggers braking into reverse | guessed |
| `drop_mines_damage_trigger_percent` | scalar `number` | 5 | …that triggers mines | guessed |
| `drop_mines_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |
| `fire_guns_damage_trigger_percent` | scalar `number` | 5 | …that triggers guns | guessed |
| `fire_guns_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |
| `fire_missiles_damage_trigger_percent` | scalar `number` | 5 | …that triggers missiles | guessed |
| `fire_missiles_damage_trigger_time` | scalar `number` | 5 | Seconds it is held | guessed |

A `_percent` of `1` means "at any damage" and is the value seven of these carry throughout, so most
of the table is on all the time.

### `[FormationBlock]` — 10

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 10 | Identity | inferred |
| `force_attack_formation_active_time` | scalar `number` | 10 | Seconds formation is held during an attack | guessed |
| `force_attack_formation_unactive_time` | scalar `number` | 10 | Seconds before it can be re-formed | guessed |
| `break_formation_damage_trigger_percent` | scalar `number` | 9 | Damage fraction that breaks it | guessed |
| `break_formation_damage_trigger_time` | scalar `number` | 9 | Seconds before the break takes effect | guessed |
| `break_formation_missile_reaction_time` | scalar `number` | 6 | Seconds after a missile lock | guessed |
| `break_apart_formation_missile_reaction_time` | scalar `number` | 6 | The same, scattering rather than breaking | guessed |
| `break_apart_formation_on_evade_break` | scalar `boolean` | 6 | Scatter when any member breaks | guessed |
| `break_formation_on_evade_break_time` | scalar `number` | 6 | Seconds it takes | guessed |
| `formation_exit_top_turn_break_away_throttle` | scalar `number` | 6 | `1` in all 6 | guessed |
| `formation_exit_roll_outrun_throttle` | scalar `number` | 6 | | guessed |
| `formation_exit_max_time` | scalar `number` | 6 | Seconds the exit manoeuvre may take | guessed |

Wiki-only: `countermeasure_unactive_time`, which retail carries on `[CountermeasureBlock]` and not
here — a transcription slip on the wiki's side.

### `[CountermeasureBlock]` — 6

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 6 | Identity | inferred |
| `countermeasure_active_time` | scalar `number` | 6 | Seconds countermeasures run. `3` in all 6 | guessed |
| `countermeasure_unactive_time` | scalar `number` | 6 | Seconds before they can run again | guessed |

The six blocks are `countermeasure_a`, `countermeasure_test` and `countermeasure_handicap_0..3` —
a difficulty ladder, which is how most of this module's variation is authored.

### `[TrailBlock]` — 4

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 4 | Identity | inferred |
| `trail_distance` | scalar `number` | 4 | Metres kept behind the target | guessed |
| `trail_lock_cone_angle` | scalar `number` | 4 | Degrees within which the tail counts as held. `30` in all 4 | guessed |
| `trail_break_time` | scalar `number` | 4 | Seconds before breaking off. `0.5` in all 4 | guessed |
| `trail_max_turn_throttle` | scalar `number` | 4 | | guessed |
| `trail_min_no_lock_time` | scalar `number` | 2 | Seconds without a lock before giving up | guessed |
| `trail_break_roll_throttle` | scalar `number` | 2 | | guessed |
| `trail_break_afterburner` | scalar `boolean` | 2 | Afterburn out of the break | guessed |

### `[StrafeBlock]` — 5

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 5 | Identity | inferred |
| `strafe_run_away_distance` | scalar `number` | 5 | Metres of separation that ends the run | guessed |
| `strafe_attack_throttle` | scalar `number` | 5 | `1` in all 5 | guessed |
| `strafe_turn_throttle` | scalar `number` | 1 | | unread |

### `[EngineKillBlock]` — 3

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 3 | Identity | inferred |
| `engine_kill_search_time` | scalar `number` | 2 | Seconds spent drifting while looking | guessed |
| `engine_kill_face_time` | scalar `number` | 2 | Seconds spent turning to face | guessed |
| `engine_kill_use_afterburner` | scalar `boolean` | 3 | `False` in all 3 | guessed |
| `engine_kill_afterburner_time` | scalar `number` | 2 | Seconds it burns for | guessed |
| `engine_kill_max_target_distance` | scalar `number` | 2 | Metres beyond which it will not attempt this | guessed |

### `[MineBlock]` — 3 — no wiki page

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 3 | Identity | inferred |
| `mine_launch_interval` | scalar `number` | 3 | Seconds between drops. `10` in all 3. **Note the name breaks the convention** — no `_time` suffix | guessed |
| `mine_launch_cone_angle` | scalar `number` | 3 | Degrees behind which the pursuer must be. `30` in all 3 | guessed |
| `mine_launch_range` | scalar `number` | 3 | Metres. `250` in all 3 | guessed |

### `[RepairBlock]` — 6

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 6 | Identity | inferred |
| `use_shield_repair_at_damage_percent` | scalar `number` | 5 | Shield fraction at which a battery is used | guessed |
| `use_shield_repair_pre_delay` | scalar `number` | 5 | Seconds before | guessed |
| `use_shield_repair_post_delay` | scalar `number` | 5 | Seconds after | guessed |
| `use_hull_repair_at_damage_percent` | scalar `number` | 5 | Hull fraction at which a kit is used | guessed |
| `use_hull_repair_pre_delay` | scalar `number` | 5 | Seconds before | guessed |
| `use_hull_repair_post_delay` | scalar `number` | 5 | Seconds after | guessed |

The nicknames say what the block does — `repair_fighter_never`, `_hull`, `_shield`, `_both` — and the
zeroed fields in `repair_fighter_never` are how "never" is authored.

### `[MetaBehavior]` — 6, in 3 files — no wiki page

The one section here that is not a pilot block. Six sections across `MISSIONS/M02`, `M08` and `M10`,
each naming a scripted movement a mission can hand to a ship.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 6 | Identity. Named for the destination — `goto_tradelane`, `goto_bruschal_base` | inferred |
| `MB_GotoGuide` | list, arity 8 — `string` then 7 `int` | 6 | A target name followed by seven numbers. The first is `Player` in the sample read; two of the seven are large signed values that look like ids rather than quantities | unread |

**Not decoded, and deliberately left so.** Eight positional values with one sample each is not enough
to read, and a guessed reading here would be a value the game could disagree with. It rounds through
`./ini` untouched either way. The name suggests the `MB_*` family has other members no retail file
uses — a mod that adds one arrives as an unrecognized property, which is the point of keeping them.

---

## `./audio`

**5 sections, 46 pairs, wiki reaches 19 (41%).** The coverage figure understates it: the wiki's
`soundcfg.ini` page heads a section "CFG" and then **opens its fence with `[Voice]`**, so all 22 of
`[CFG]`'s properties are attributed to the wrong section. Corrected below, the real reach is 41 of 46.

Largest module in the data by a wide margin — 25,814 `[Sound]` sections, 23,997 of them voice lines —
and the cheapest to build. It pairs with [AUDIO.md](AUDIO.md): a voice bank's `msg` values hash to the
UTF entries in `DATA/AUDIO` by `getObjectId`.

### `[Sound]` — 25,814, in 27 files

**Two shapes, split by file**, and the split is by which key of `[Data]` loaded the file:

- **Sound definitions** — 1,817 carry `nickname` and `file`, and are what everything else references.
- **Voice lines** — 23,997 carry `msg` instead, one per line of dialogue in a voice bank.

`attenuation` is on 25,811 of 25,814 and is the only field both shapes share in practice. See
[the split table](#one-section-two-shapes-split-by-file); this is the ambiguous one of the three,
because the two shapes do overlap.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 1,817 | Identity of a sound definition | inferred |
| `msg` | scalar `string` | 23,995 | Identity of a voice line. Hashed with `getObjectId` to find the entry in the bank's UTF file — see [AUDIO.md](AUDIO.md) | inferred |
| `file` | scalar `string` | 1,817 | Path to the audio, relative to the data directory | inferred |
| `attenuation` | scalar `number` | 25,811 | Decibel trim, `-96` to `0` | inferred |
| `type` | scalar `string` | 1,274 in 1,273 sections | `voice` \| `music` \| `ambience` \| `interface`, and absent for a sound that is none of them. **One section carries it twice and one carries `normal`**, which is not in the set | inferred |
| `range` | tuple(1/2) | 380 — 1 ×11, 2 ×369 | Min and max audible distance. **A lone value is min, and the engine derives the max** — this is SCHEMA.md's worked example, and reading it as a fixed pair invents a number for 11 sounds | inferred |
| `Priority` | scalar `number` | 16,976 | Mixing priority, `-6` to `0` in retail with one outlier at `1` | inferred |
| `duration` | scalar `number` | 17,323 | Seconds the line runs. Voice lines only | inferred |
| `is_2d` | scalar `boolean` | 1,126 | Force non-positional playback. `true` in all 1,126 — never written `false` | inferred |
| `streamer` | scalar `boolean` | 132 | `true` in all 132. Stream from disk rather than loading whole, on the wiki's reading | guessed |
| `pitch_bendable` | scalar `boolean` | 39 | `true` in all 39 | guessed |
| `crv_pitch` | scalar `number` | 198 | Selects a pitch curve. Small integers, `2`–`30` | guessed |
| `persistent` | scalar `string` | 20 | `space` in all 20 | unread |
| `ambient` | tuple(2) `string` | 2 | In two `SOLAR/BLACKHOLE` files, not in `AUDIO` | unread |
| `flash` | tuple(4) `string` | 1 | Same, once | unread |

The three boolean fields are written `true` and never `false` — absence is how false is authored,
which is why absence must stay absent rather than being filled with a default.

### `[Voice]` — 199, in 18 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 109 | Identity. **Matches the UTF filename in `DATA/AUDIO`** holding the lines | inferred |
| `extend` | scalar `string` | 90 | Another `[Voice]` to inherit lines from. 90 of the 199 are extensions rather than definitions, which is why only 109 carry a `nickname` | inferred |
| `script` | **repeated** `string` | 359 over 180 sections | Animation scripts the voice drives — head and body motion played with the line | guessed |

### `[mVoiceProp]` — 93, in 4 files

Shared with `./missions` and owned here. Spelled `mVoiceProp` in the data.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `voice` | scalar `string` | 93 | → `[Voice]` | inferred |
| `permutation_count` | **repeated** tuple(2) `string, int` | 2,717 over 48 sections | A `[Sound]` and how many recorded variants of it exist, so the game can pick one | guessed |
| `gender` | scalar `string` | 45 | `male` \| `female` | inferred |
| `supports_roles` | list `string` | 45 — 1 ×13, 2 ×12, 3 ×3, **7 ×17** | Roles this voice can speak for. SCHEMA.md names this as one of the two unbounded-list cases; the arity histogram is why | guessed |

### `[reverb]` — 3

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 3 | Identity — `dry`, `bar_small`, `equip_large` | inferred |
| `settings` | tuple(3) `number` | 3 | Three integers configuring the reverb. Not decoded | unread |

### `[CFG]` — 1

The mixer, in `AUDIO/soundcfg.ini`. One section, 22 properties, each once — a singleton in the sense
[SCHEMA.md](SCHEMA.md#identity-and-nicknames) means. The wiki documents all 22 under a mislabelled
header, as above.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `master_music`, `master_ambient`, `master_interface`, `master_sfx`, `master_voice` | scalar `number` | 1 each | Per-bus master trim, in the same decibel units as `[Sound] attenuation` | guessed |
| `ducking_comm_down_by`, `_down_time`, `_up_time` | scalar `number` | 1 each | How far and how fast everything else drops under comm dialogue | guessed |
| `ducking_spaceflight_down_by`, `_down_time`, `_up_time` | scalar `number` | 1 each | The same under spaceflight audio | guessed |
| `ducking_rtc_down_by`, `_down_time` | scalar `number` | 1 each | The same under a cutscene. **No `_up_time`** — the only one of the three families missing it | guessed |
| `default_crv_pitch`, `default_crv_attenuation` | scalar `number` | 1 each | Curves used when a `[Sound]` names none | guessed |
| `default_loop_style`, `default_reverb` | scalar `string` | 1 each | `default_reverb` names a `[reverb]` | guessed |
| `music_fade_time`, `cross_fade_silence` | scalar `number` | 1 each | Music transition timing | guessed |
| `cockpit_attenuation` | scalar `number` | 1 | Trim applied inside a cockpit | guessed |
| `ear_doppler_factor` | scalar `number` | 1 | Doppler scale | guessed |
| `spaceflight_dialogue_pan_range` | scalar `number` | 1 | How far dialogue is allowed to pan off centre | guessed |

---

## `./universe`

**21 sections, 162 pairs, wiki reaches 117 (72%).** `UNIVERSE/universe.ini` is the practical root of
the whole data set, and a per-system file is where most of the volume is.

Two conventions hold throughout and are worth stating once:

- **`pos` and `rotate` are three numbers**, and `rotate` is Euler angles in degrees. `[system] pos`
  is the exception at two — it is a position on the flat navmap, not in space.
- **`ids_name` / `ids_info` / `strid_name` are numeric resource ids**, resolved through `./resource`
  and never through the data. `strid_name` and `ids_name` are the same thing under two spellings, and
  both occur.

### `[Zone]` — 5,769, in 53 files

**The most structurally varied section in the data**, and the one that will most reward being read
carefully. Spelled `zone` and `Zone` both ways, which is why every lookup folds.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 5,769 | Identity | inferred |
| `pos` | tuple(3) `number` | 5,769 | Centre, in system coordinates | inferred |
| `rotate` | tuple(3) `number` | 3,784 | Euler angles, degrees | inferred |
| `shape` | scalar `string` | 5,769 | `SPHERE` \| `BOX` \| `ELLIPSOID` \| `CYLINDER` \| `RING`. Written lowercase 8 times | inferred |
| `size` | tuple(1/2/3) `number` | 5,769 — 1 ×1,872, 2 ×3,306, 3 ×591 | **Arity is determined by `shape`**: 1 for a sphere (radius), 2 for a cylinder (radius, height), 3 for a box or ellipsoid (extent per axis). Keep as read and let the consumer pair it with `shape` | inferred |
| `sort` | scalar `number` | 5,754 | Present on almost every zone and, per the wiki, ignored — the game sorts by file order | guessed |
| `density` | scalar `number` | 4,224 | Soft ceiling on ships spawned inside | guessed |
| `relief_time` | scalar `number` | 4,215 | Seconds of quiet after a fight before respawning resumes | guessed |
| `repop_time` | scalar `number` | 4,101 | Divisor in the respawn chance, evaluated every 3 seconds | guessed |
| `max_battle_size` | scalar `number` | 4,105 | Ship ceiling while a fight is running | guessed |
| `toughness` | scalar `number` | 3,806 | Present on 3,806 zones and, per the wiki, unused — `encounter` carries the real difficulty | guessed |
| `pop_type` | tuple(1/2/3) `string` | 3,841 | Classifies the zone for the population system. Development residue on the wiki's reading, with 12 observed values | guessed |
| `encounter` | **group** opener, tuple(2/3) | 5,425 over 4,080 sections — 3 ×5,039, 2 ×386 | An `[EncounterParameters]` nickname, a difficulty, and a probability. The two-value form omits the probability. Owns the `faction` rows following it — see below | inferred |
| `faction` | member tuple(2) | 7,105 over 4,080 sections | Faction and weight, choosing who the encounter spawns as | inferred |
| `faction_weight` | **repeated** tuple(2), section-level | 5,611 over 3,801 sections | Same shape. **Not a member of the `encounter` run** — all 5,611 precede every `encounter` in their section, in every file, without exception | inferred |

**`encounter` owns the `faction` rows after it, with one file's worth of doubt.** The pairing is what
the files overwhelmingly write — 4,297 of the 5,425 encounters are followed by exactly one `faction`,
and the run lengths tail off from there — but **497 `faction` properties in 300 sections precede
their section's first `encounter`**, and every one of them is in
`UNIVERSE/SYSTEMS/INTRO/intro.ini`, where the author wrote all thirteen factions and then all six
encounters. The game loads that file. So the grouping is read but a leading member is never fatal:
it is kept in `unrecognized`, reported, and round-trips untouched. See the TODO.
| `density_restriction` | **repeated** tuple(2) `int, string` | **15,640 over 3,628 sections** | A cap and the `make_class` it applies to. The second-most repeated property in the data | guessed |
| `path_label` | tuple(2/3) | 3,305 — 2 ×3,022, 3 ×283 | Which patrol path this zone is a leg of, and which leg | guessed |
| `usage` | tuple(1/2) `string` | 3,305 | `patrol` \| `trade` | inferred |
| `mission_eligible` | scalar `boolean` | 3,305 | Whether missions may use the zone | inferred |
| `vignette_type` | scalar `string` | 688 | `open` \| `field` \| `exclusion` | inferred |
| `mission_type` | **repeated** tuple(1/2) `string` | 293 | `lawful` \| `unlawful` | guessed |
| `visit` | scalar `number` | 687 | Navmap disclosure bitfield. The wiki decodes ten bits | guessed |
| `property_flags` | scalar `number` | 835 | Navmap appearance bitfield — density, hazard, and material class. The wiki decodes eleven bits | guessed |
| `property_fog_color` | tuple(3) `number` | 182 | RGB of the zone's fog on the navmap | guessed |
| `attack_ids` | list `string` | 806 — 1 ×642, up to 5 | `lane_id` values this patrol may intercept | guessed |
| `tradelane_attack` | scalar `number` | 784 | How often a patrol intercepts a lane | guessed |
| `lane_id` | scalar `string` | 139 | Identifies a tradelane zone for `attack_ids` | guessed |
| `tradelane_down` | scalar `number` | 133 | Paired with `lane_id`; effect unconfirmed | guessed |
| `spacedust` | scalar `string` | 270 | Dust effect inside the zone | inferred |
| `spacedust_maxparticles` | scalar `number` | 262 | Particle budget for it | inferred |
| `damage` | scalar `number` | 173 | Damage per second to anything inside | inferred |
| `Music` | scalar `string` | 166 | Overrides the system's space music | inferred |
| `ids_name` | scalar `number` | 145 | | inferred |
| `ids_info` | **repeated** `number` | 147 in 145 sections | Two zones carry it twice | inferred |
| `edge_fraction` | scalar `number` | 144 | How quickly nebula fog fades at the boundary | guessed |
| `population_additive` | scalar `boolean` | 129 | Whether this zone's population adds to or overrides earlier ones. `false` on 129 of 129 | guessed |
| `interference` | scalar `number` | 59 | Sensor range multiplier, `0`–`1` | guessed |
| `comment` | tuple(1/2) `string` | 678 | Authoring note. Carried through, never interpreted | inferred |
| `zone_creation_distance` | scalar | 27 — `false` ×19, `0` ×8 | Written as a boolean and as a number in the same field | unread |
| `difficulty` | scalar `number` | 300 — **arity 0 ×1**, 1 ×299 | One zone carries it with no value at all, which is a flag | unread |
| `drag_modifier` | scalar `number` | 1 | Divides speed inside the zone | guessed |
| `power_modifier` | scalar `number` | 1 | | unread |
| `spin` | tuple(3) `number` | 1 | | unread |
| `reputation` | scalar `string` | 1 | | unread |
| `spacedust_maxdust` | scalar `number` | 3 | | unread |

**Five misspellings survive in retail** and must round-trip untouched, since the game ignores them and
a mod may not: `spacedust_masparticles` ×2, `spacedust _maxparticles` ×5 (with a space in the name),
`spacedusr_maxparticles` ×1, `pacedust` ×3, and the wiki-only `longevity`, which retail never carries.

### `[Object]` — 3,578, in 54 files

A placed solar. `Archetype` names a `[Solar]`, which makes this the most-travelled reference edge in
the data.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 3,578 | Identity within the system | inferred |
| `Archetype` | scalar `string` | 3,578 | → `[Solar]` | inferred |
| `pos` | tuple(3) `number` | 3,578 | | inferred |
| `rotate` | tuple(3) `number` | 2,442 | | inferred |
| `ids_name` | scalar `number` | 2,894 | | inferred |
| `ids_info` | **repeated** `number` | 2,762 in 2,751 sections | 11 objects carry it twice | inferred |
| `reputation` | **repeated** `string` | 2,123 in 2,116 sections | Owning faction | inferred |
| `behavior` | **repeated** `string` | 1,706 in 1,695 sections | `NOTHING` in all 1,706. Required before a solar will use its weapons | guessed |
| `loadout` | scalar `string` | 1,633 | → `[Loadout]` | inferred |
| `pilot` | **repeated** `string` | 1,507 | → `[Pilot]`. Five distinct values, four of them a difficulty ladder | inferred |
| `difficulty_level` | scalar `number` | 1,489 | | guessed |
| `next_ring` / `prev_ring` | scalar `string` | 925 each | Tradelane chain links, both directions | inferred |
| `visit` | scalar `number` | 511 | Navmap disclosure bitfield, as `[Zone]`'s | guessed |
| `parent` | scalar `string` | 269 | Selecting this object selects the parent instead | guessed |
| `base` | scalar `string` | 261 | → `[Base]`, for the info panel | inferred |
| `dock_with` | scalar `string` | 260 | → `[Base]`, for docking. Distinct from `base` | inferred |
| `goto` | tuple(3) `string` | 239 | Destination system, destination object, and the `[Gate_Tunnel]` to play | inferred |
| `jump_effect` | scalar `string` | 239 | → `[JumpGateEffect]` | inferred |
| `tradelane_space_name` | **repeated** `number` | 271 in 267 sections | Ids naming the lane's endpoints | inferred |
| `msg_id_prefix` | scalar `string` | 227 | Voice prefix used when hailing | guessed |
| `space_costume` | tuple(2/3) `string` | 179 — 2 ×164, 3 ×15 | Head, body, and optionally an accessory for traffic control | inferred |
| `voice` | scalar `string` | 178 | → `[Voice]` for traffic control | inferred |
| `atmosphere_range` | scalar `number` | 127 | Radius of the atmospheric burn bubble | guessed |
| `burn_color` | tuple(3) `number` | 81 | RGB of it. No wiki row | guessed |
| `spin` | tuple(3) `number` | 65 | Angular velocity | inferred |
| `star` | scalar `string` | 54 | → `[Star]` in `SOLAR/stararch.ini` | inferred |
| `ambient_color` | tuple(3) `number` | 44 | | guessed |
| `Ambient` | tuple(3) `number` | 4 | The same field under a second spelling | guessed |
| `ring` | tuple(2) `string` | 8 | A `[Zone]` and a rings file | guessed |
| `faction` | scalar `string` | 4 | | unread |
| `info_ids` | scalar `number` | 4 | | unread |
| `size` | tuple(3) `number` | 2 | | unread |
| `info_card` / `info_card_ids` | scalar `number` | 1 each | | unread |
| `260800` | **flag** | 6 | A property whose *name* is a number and which carries no value. Pure authoring residue, in six objects, and it must survive a round trip | unread |

`260800` is the example [INI.md](INI.md#the-compiler-preserves-nonsense) already cites. It is here so
that a reader knows to expect it rather than treating an unparseable name as a fault.

### `[EncounterParameters]` — 1,163, in 48 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 1,163 | Identity, referenced by `[Zone] encounter` | inferred |
| `filename` | scalar `string` | 1,163 | Path to the encounter script. **The single most common cross-file reference in the data** | inferred |
| `faction` | **repeated** `string` | 60 over 17 sections | No wiki row | unread |

### `[FlashlightSet]` — 852, in 50 files — no wiki page

Room lighting rigs, in the base interior files. Read from the sweep alone.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `hardpoint` | **repeated** `string` | 4,885 over 850 sections | Where the lights are. Repeats heavily — one rig, many mounts | guessed |
| `icolor` | tuple(3) `number` | 852 | RGB | guessed |
| `scale` | scalar `number` | 852 | | guessed |
| `blink` | **repeated** `number` | 852 | | unread |
| `endpause` | scalar `number` | 782 | | unread |
| `gap` | scalar `number` | 147 | | unread |
| `numlights` | scalar `number` | 44 | | unread |
| `:gap` | scalar `number` | 1 | A property named `:gap` — residue, and a second case of a name that is not an identifier | unread |

### `[SystemConnections]` — 131, in 3 files — no wiki page

The precomputed autopilot routing tables. Generated by the game when absent, per the wiki's index.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `Path` | **repeated** list `string` | **5,375 over 131 sections**, arity 3 to 13 | A route as a sequence of system nicknames. Arity is the hop count, so this is genuinely unbounded and must not be tupled | inferred |

### `[Group]` — 58, in 2 files

**Two sections sharing a name, with no property in common.** See
[the split table](#one-section-two-shapes-split-by-file).

Faction groups, `initialworld.ini` ×55:

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 55 | Identity of the faction | inferred |
| `ids_name` / `ids_info` / `ids_short_name` | scalar `number` | 55 each | Name, infocard, and the short name used where space is tight | inferred |
| `rep` | **repeated** tuple(2) `number, string` | **3,025 over 55 sections** | Standing toward another faction, `-1` to `1`. Every faction states its stance toward every other, which is why 55 sections carry 3,025 rows | inferred |

Keymap groups, `INTERFACE/keylist.ini` ×3 — belongs to `./interface` by shape:

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `group_num` | scalar `number` | 3 | `0`, `1`, `2` | inferred |
| `name` | scalar `number` | 3 | A resource id, not text. `1504` in all three | inferred |

### `[locked_gates]` — 1 — no wiki page

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `locked_gate` | **repeated** `string` | 27 in one section | Jump gates closed at game start. Written as `getObjectId` hashes in decimal, not as nicknames — the only place in the data that stores a reference pre-hashed | guessed |

### `[LightSource]` — 140, in 53 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 140 | Identity | inferred |
| `pos` | tuple(3) `number` | 140 | | inferred |
| `color` | tuple(3) `number` | 140 | RGB | inferred |
| `range` | scalar `number` | 140 | | inferred |
| `type` | scalar `string` | 140 | `DIRECTIONAL` ×92 \| `POINT` ×48 | inferred |
| `atten_curve` | scalar `string` | 89 | `DYNAMIC_DIRECTION` in all 89 | guessed |
| `attenuation` | tuple(3) `number` | 48 | Constant, linear and quadratic terms | guessed |
| `direction` | tuple(3) `number` | 3 | For `DIRECTIONAL` sources | inferred |
| `rotate` | tuple(3) `number` | 2 | | inferred |
| `color_curve` | tuple(2) `string, number` | 2 | Names a curve in an `[IGraph]` file | guessed |
| `ids_name` | scalar `number` | 2 | | unread |
| `behavior` | **repeated** `string` | 2 | | unread |

### `[SystemInfo]`, `[Music]`, `[Dust]`, `[Ambient]`, `[Background]` — 54, 54, 54, 54, 46

Per-system atmosphere, one of each per system file.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[SystemInfo]` | `space_color` | tuple(3) `number` | 54 | RGB behind the starspheres | inferred |
| | `local_faction` | scalar `string` | 54 | Present in every system and, per the wiki, unused | guessed |
| | `name` | scalar `string` | 31 | | unread |
| | `rpop_solar_detection` | scalar `boolean` | 1 | Lets NPCs spawn inside a very large model's bounding box | guessed |
| `[Music]` | `space` / `danger` / `battle` | scalar `string` | 54 each | → `[Sound]`, one per game state | inferred |
| `[Dust]` | `spacedust` | scalar `string` | 54 | `Dust` in all 54 | inferred |
| `[Ambient]` | `color` | tuple(3) `number` | 54 | System-wide ambient RGB | inferred |
| `[Background]` | `nebulae` | **repeated** `string` | 47 in 46 sections | Path to the nebula starsphere, drawn behind the stars | inferred |
| | `basic_stars` | scalar `string` | 39 | Path to the star sphere `.cmp` | inferred |
| | `complex_stars` | scalar `string` | 39 | Path to the sphere drawn over it | inferred |

`[SystemInfo] space_farclip` is wiki-only — documented with a minimum and a warning about planet
artefacts, and carried by no retail file.

### `[System]` — 53, in `UNIVERSE/universe.ini`

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 53 | Identity | inferred |
| `file` | scalar `string` | 53 | Path to the per-system file, which is the payload | inferred |
| `pos` | tuple(2) `number` | 53 | Position on the universe map. **Two values, not three** | inferred |
| `strid_name` | scalar `number` | 53 | | inferred |
| `ids_info` | scalar `number` | 53 | | inferred |
| `visit` | scalar `number` | 53 | Navmap disclosure bitfield | guessed |
| `msg_id_prefix` | scalar `string` | 45 | Voice prefix for the system's name | guessed |
| `NavMapScale` | scalar `number` | 37 | Navmap zoom, `1.5`–`4` | guessed |

### `[Asteroids]` and `[Nebula]` — 210 and 60

Identical shape; both attach a definition file to a zone.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `file` | scalar `string` | 210 / 60 | Path to the field definition under `SOLAR` | inferred |
| `zone` | scalar `string` | 210 / 60 | → `[Zone]` in this system | inferred |

### `[Archetype]` — 18, in 18 files

A preload list. Every property repeats and every one names something by nickname.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `ship` | **repeated** `string` | 93 over 18 sections | → `[Ship]` | inferred |
| `simple` | **repeated** `string` | 60 over 2 sections | → `[Simple]` | inferred |
| `snd` | **repeated** `string` | 30 over 2 sections | → `[Sound]` | inferred |
| `equipment` | **repeated** `string` | 21 over 2 sections | → equipment archetype | inferred |
| `solar` | **repeated** `string` | 20 over 12 sections | → `[Solar]` | inferred |
| `voice` | **repeated** tuple(2) `string` | 6 over 1 section | A `[Voice]` and a `[Sound]` | inferred |

### `[Spiels]` — 54 — no wiki page

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `ShipDealer` | scalar `string` | 32 | → a dialogue script for the dealer's patter | guessed |
| `CommodityDealer` | scalar `string` | 18 | Same | guessed |
| `EquipmentDealer` | scalar `string` | 17 | Same | guessed |

### `[MissionCreatedSolar]` — 9 — no wiki page

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `base` | scalar `string` | 9 | → `[Base]` the solar belongs to | guessed |
| `pos` | tuple(3) `number` | 9 | | inferred |
| `ids_info` | scalar `number` | 9 | | inferred |

### `[Time]`, `[FlashlightLine]`

Not swept as separate rows here — `[Time]` is a singleton in `constants.ini` and `[FlashlightLine]`
has 5 occurrences alongside `[FlashlightSet]`. Both are covered when the module is written.

---

## `./base`

**10 sections, 36 pairs, wiki reaches 16 (44%), and the shortfall is total rather than partial**:
seven of the ten sections have no wiki page at all, `rooms.md` is one of the 21 empty stubs, and
between them those seven are 5,382 of the module's 5,884 occurrences. **This module is built from the
sweep**, and the readings below are correspondingly thin.

The join is `[Base] file` → a base file holding `[BaseInfo]` and `[Room]`, and `[Room] file` → a room
file holding everything else. 464 room files, one section of most kinds each.

### `[Base]` — 197, in `UNIVERSE/universe.ini`

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 197 | Identity | inferred |
| `system` | scalar `string` | 197 | → `[System]` | inferred |
| `file` | scalar `string` | 197 | Path to the base file | inferred |
| `strid_name` | scalar `number` | 197 | | inferred |
| `BGCS_base_run_by` | scalar `string` | 169 | Which faction the traffic-control voice says runs the base | guessed |
| `terrain_tiny` / `terrain_sml` / `terrain_mdm` / `terrain_lrg` | scalar `string` | 51 each | Models bound to the matching `$terrain_*` variable in the base's `ambi_terrain_static` scene script — a direct INI → THN handoff | guessed |
| `terrain_dyna_01` / `terrain_dyna_02` | scalar `string` | 32 each | The same for `ambi_terrain_dynamic` | guessed |
| `autosave_forbidden` | scalar `boolean` | 4 | `true` in all 4. Story bases the player cannot return to | guessed |

Wiki-only: `ship_sml_01..03`, `ship_mdm_01..03`, `ship_lrg_01..03` — nine fields no retail base
carries.

### `[BaseInfo]` — 200

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 200 | Identity | inferred |
| `start_room` | scalar `string` | 200 | → `[Room]` the player arrives in. `Deck` on 164 of 200 | inferred |

Wiki-only: `ship_repair_cost`, `price_variance`.

### `[Room]` — 464, in 200 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 464 | Identity within the base. A closed set in practice — `Bar`, `Deck`, `ShipDealer`, `Equipment`, `Trader`, `Cityscape`, `Planetscape`, `Digsite` — and one is spelled `bar` | inferred |
| `file` | scalar `string` | 464 | Path to the room file | inferred |

### `[Room_Info]` — 446 — no wiki page

One per room file, and the join from a room to its scene scripts.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `scene` | **repeated** tuple(2/3/4) | 666 over 445 sections — 3 ×322, 2 ×312, 4 ×32 | Names a `.thn` and the conditions it plays under. **This is where 3,000 of the data's THN references live** — see [THN.md](THN.md) | guessed |
| `set_script` | scalar `string` | 443 | The room's base scene | guessed |
| `animation` | scalar `string` | 162 | `Sc_loop` on 157 of 162 | guessed |
| `goodscart_script` | scalar `string` | 19 | Scene for the goods cart | guessed |

### `[Hotspot]` — 3,581, in 442 files — no wiki page

**The largest section in the module by a factor of eight**, and entirely undocumented. Each is one
clickable region of a room.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `name` | scalar `string` | 3,581 | Identity within the room | inferred |
| `behavior` | scalar `string` | 3,581 | What clicking does. A closed set of at least ten — `ExitDoor` ×1,555, `Repair`, `FrontDesk`, `VirtualRoom`, `StartEquipDealer`, `MoveRight`, `NewsVendor`, `MissionVendor`, `StartDealer`, `StartShipDealer` | guessed |
| `room_switch` | scalar `string` | 1,879 | Room to move to, for a door | guessed |
| `virtual_room` | scalar `string` | 1,137 | Room whose contents to show without moving | guessed |
| `set_virtual_room` | scalar `string` | 350 | | unread |
| `state_read` / `state_send` | scalar `number` | 961 each | `1` and `2`, mirrored between the pair — a two-state handshake of some kind | unread |

### `[Camera]`, `[Room_Sound]`, `[CharacterPlacement]`, `[PlayerShipPlacement]`, `[ForSaleShipPlacement]` — no wiki pages

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Camera]` | `name` | scalar `string` | 443 | `Camera_0` on 442 of 443 — the scene script supplies the rest | guessed |
| `[Room_Sound]` | `ambient` | scalar `string` | 436 | → `[Sound]` looping in the room | guessed |
| | `music` | tuple(1/2) `string` | 197 — 1 ×175, 2 ×22 | → `[Sound]`, with a second value on 22 | guessed |
| `[CharacterPlacement]` | `name` | scalar `string` | 265 | `Zg/PC/Player/01/A/Stand` in all 265 — a marker path into the scene | guessed |
| | `start_script` | scalar `string` | 208 | | guessed |
| `[PlayerShipPlacement]` | `name` | scalar `string` | 208 | `X/Shipcentre/01` in all 208 | guessed |
| | `landing_script` / `launching_script` | scalar `string` | 29 each | | guessed |
| `[ForSaleShipPlacement]` | `name` | scalar `string` | 86 | `X/Shipcentre/01..03` — the three display slots in a ship dealer | guessed |

Every one of these `name` values is a path into a scene script's entity tree rather than a nickname
in the INI graph, which is why they resolve nowhere in this data set and why the module is thin
without `./thn` beside it.

---

## `./equipment`

**33 sections, 416 pairs, wiki reaches 195 (47%).** The shortfall is not where it looks: the wiki
documents the *gameplay* fields of every archetype well and omits the *presentation* fields almost
entirely, so `refire_delay` has a reading and `DA_archetype`, `material_library`, `LODranges`,
`debris_type` and `hit_pts` — the same nine fields on twenty-odd sections — do not.

**The nine shared fields, stated once.** Every mountable archetype carries most of them, they mean the
same thing everywhere, and the tables below do not repeat them:

| Property | Kind | Reading | Status |
| --- | --- | --- | --- |
| `nickname` | scalar `string` | Identity | inferred |
| `ids_name` / `ids_info` | scalar `number` | Resource ids | inferred |
| `DA_archetype` | scalar `string` | **Path** to the `.3db` or `.cmp` model | inferred |
| `material_library` | scalar `string` | **Path** to the `.mat` its model needs | inferred |
| `LODranges` | list `number` | Screen-space LOD thresholds. **Arity varies 2/3/4/5** — SCHEMA.md's unbounded-list case | inferred |
| `hit_pts` | scalar `number` | Health | inferred |
| `mass` / `volume` | scalar `number` | Cargo mass and hold space | inferred |
| `HP_child` | scalar `string` | Hardpoint on this item that mates with the mount. `HpConnect` almost everywhere | inferred |
| `parent_impulse` / `child_impulse` | scalar `number` | Separation force applied to each side when it is blown off. `20` / `80` throughout | guessed |
| `debris_type` | scalar `string` | → `[Debris]` in `./fx` | inferred |
| `separation_explosion` | scalar `string` | → `[Explosion]`. `sever_debris` throughout | inferred |
| `explosion_resistance` | scalar `number` | Damage multiplier against area damage | guessed |
| `lootable` | scalar `boolean` | Whether it drops | inferred |
| `toughness` | scalar `number` | Value the AI weighs when choosing a target | guessed |
| `power_usage` | scalar `number` | Energy drawn per use | inferred |

`DA_archetype` and `material_library` are the two most useful **path** rows in the whole document —
they are the edge from the INI graph to the asset side, and only the wiki says they are paths.

### `[Good]` — 855, in 4 files

The economy's item table. Three shapes by `category`, and the field set follows it.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 855 | Identity | inferred |
| `category` | scalar `string` | 855 | `equipment` ×752 \| `commodity` ×40 \| `shiphull` ×32 \| `ship` ×31. **Selects which of the other fields apply** | inferred |
| `equipment` | scalar `string` | 792 | → an equipment archetype, for `equipment` and `commodity` | inferred |
| `price` | scalar `number` | 824 | Base price. **`int` ×812 and `float` ×12** — SCHEMA.md's headline example of the tag being residue | inferred |
| `combinable` | scalar `boolean` | 792 | Whether units stack in the hold | guessed |
| `item_icon` | scalar `string` | 762 | **Path** to the icon `.3db` | inferred |
| `shop_archetype` | scalar `string` | 727 | **Path** to the model shown in the dealer | inferred |
| `material_library` | scalar `string` | 641 | **Path**, for that model. No wiki row | inferred |
| `ids_name` / `ids_info` | scalar `number` | 687 / 655 | | inferred |
| `hull` | scalar `string` | 31 | → the `shiphull` `[Good]`, for a `ship` | inferred |
| `ship` | scalar `string` | 32 | → `[Ship]`, for a `shiphull` | inferred |
| `addon` | **repeated** tuple(3) `string, string, int` | 507 over 31 sections | Equipment fitted with the ship: archetype, hardpoint, and a count | inferred |
| `free_ammo` | tuple(2) `string, int` | 32 | Ammunition included with the ship | inferred |
| `good_buy_price` / `good_sell_price` / `bad_buy_price` / `bad_sell_price` | scalar `number` | 40 each | Price multipliers at maximum and minimum reputation. **`bad_sell_price` is `float` ×21 and `int` ×19** | guessed |
| `jump_dist` | scalar `number` | 40 | Only on the 40 commodities. Distance a trade route is worth, on the wiki's reading | guessed |
| `msg_id_prefix` | scalar `string` | 40 | Voice prefix for the commodity's name | guessed |

### `[BaseGood]` — 413, in 3 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `base` | scalar `string` | 413 | → `[Base]`. **The identity is positional — there is no nickname** | inferred |
| `MarketGood` | **repeated** tuple(7/8) | **14,694 over 407 sections — 7 ×12,865, 8 ×1,829** | Good, rank required, reputation required, minimum stock, maximum stock, a flag, a price multiplier, and an optional eighth. **The most-repeated property in the data after `[Loadout] equip`, and four distinct type signatures** — `s,i,i,i,i,i,i` and `s,i,f,i,i,i,i` are the two commonest | guessed |

`MarketGood`'s positional meaning is the single largest unread thing in `./equipment`. Eight
positions over 14,694 rows is enough data to read it, but not from the corpus alone: the wiki names
seven of the eight and the eighth appears only in 1,829 rows. Recorded as a tuple, kept as read.

### `[FactionGood]` — 48

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `faction` | scalar `string` | 48 | → a `[Group]` faction. Positional identity again | inferred |
| `MarketGood` | **repeated** tuple(3) | 626 over 35 sections | A commodity and two numbers. **Two signatures — `s,i,i` ×572 and `s,s,i` ×54** — the same field carrying a string where a number usually is | guessed |

### `[Gun]` — 513, and `[MineDropper]` ×10, `[CounterMeasureDropper]` ×3

One shape. A launcher: what it fires, how fast, and what it looks like doing so. All the shared fields
above, plus:

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `projectile_archetype` | scalar `string` | 513 | → `[Munition]`, `[Mine]` or `[CounterMeasure]` | inferred |
| `refire_delay` | scalar `number` | 513 | Seconds between shots | inferred |
| `muzzle_velocity` | scalar `number` | 513 | Metres per second | inferred |
| `damage_per_fire` | scalar `number` | 513 | `0` on all 513 — damage is the munition's | inferred |
| `power_usage` | scalar `number` | 513 | Energy per shot | inferred |
| `turn_rate` | scalar `number` | 513 | Degrees per second for a turret. `90` on all 513 | guessed |
| `auto_turret` | scalar `boolean` | 513 | Whether it fires itself | inferred |
| `hp_gun_type` | scalar `string` | 266 | Which hardpoint class it mounts on | inferred |
| `dry_fire_sound` | scalar `string` | 19 | → `[Sound]` when out of ammunition | inferred |
| `use_animation` | scalar `string` | 237 | Animation script played on firing. `Sc_fire` on all 237 | inferred |
| `flash_particle_name` | scalar `string` | 442 | → `[Effect]` at the muzzle | inferred |
| `flash_radius` | scalar `number` | 442 | `15` on all 442 | guessed |
| `light_anim` | scalar `string` | 454 | → `[LightAnim]`. `l_gun01_flash` on all 454 | inferred |
| `AI_range` | scalar `number` | 3 | On the countermeasure dropper only | unread |

Wiki-only on `[Gun]`: `dispersion_angle`, `gun_elevation`, `gun_azimuth` — three fields retail never
carries but every mod adds, so a reader must not choke on them.

### `[Munition]` — 513, and `[Mine]` ×10, `[CounterMeasure]` ×3

What a launcher fires.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `hp_type` | scalar `string` | 513 | `hp_gun` ×511 \| `hp_torpedo` ×2 | inferred |
| `hull_damage` / `energy_damage` | scalar `number` | 437 each | Damage to hull and to shields. 425 munitions do no energy damage | inferred |
| `weapon_type` | scalar `string` | 229 | → `[WeaponType]`, which is what the shield table keys on | inferred |
| `lifetime` | scalar `number` | 513 | Seconds before it expires | inferred |
| `requires_ammo` | scalar `boolean` | 513 | `false` ×494, `true` ×19 | inferred |
| `units_per_container` | scalar `number` | 19 | Rounds per cargo unit | inferred |
| `one_shot_sound` | scalar `string` | 513 | → `[Sound]` | inferred |
| `const_effect` | scalar `string` | 513 | → `[Effect]` for the projectile in flight | inferred |
| `munition_hit_effect` | scalar `string` | 434 | → `[Effect]` on impact | inferred |
| `explosion_arch` | scalar `string` | 76 | → `[Explosion]` | inferred |
| `detonation_dist` | scalar `number` | 76 | Proximity fuse radius | inferred |
| `Motor` | scalar `string` | 76 | → `[Motor]`, for anything self-propelled | inferred |
| `HP_trail_parent` | scalar `string` | 76 | Hardpoint the exhaust trail hangs off. `HPExhaust` on all 76 | inferred |
| `seeker` | scalar `string` | 76 | `LOCK` ×71 \| `DUMB` ×5 | inferred |
| `seeker_range` / `seeker_fov_deg` / `time_to_lock` | scalar `number` | 71 each | Acquisition envelope. `time_to_lock` is `0` on all 71 | inferred |
| `max_angular_velocity` | scalar `number` | 71 | Radians per second the seeker can turn — the one field here in radians rather than degrees | guessed |
| `force_gun_ori` | scalar `boolean` | 513 | Launch along the gun's axis rather than toward the target | guessed |
| `cruise_disruptor` | scalar `boolean` | 3 | `true` on the three disruptors | inferred |
| `loot_appearance` | scalar `string` | 19 | → `[LootCrate]` when it drops | inferred |
| `owner_safe_time` | scalar `number` | 13 | Seconds before it can hurt whoever fired it. Mines and countermeasures only | guessed |
| `linear_drag`, `seek_dist`, `top_speed`, `acceleration` | scalar `number` | 10 each | `[Mine]` only, and it has no wiki page | guessed |
| `range`, `diversion_pctg` | scalar `number` | 3 each | `[CounterMeasure]` only | guessed |

`[Mine]` has no wiki page but is byte-for-byte the same shape as `[Munition]` plus four fields, which
is how its rows are read at all. The wiki attaches twelve of them to `[LootCrate]` instead — a
misfiling, not a disagreement.

### `[Motor]` — 76

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 76 | Identity | inferred |
| `lifetime` | scalar `number` | 76 | Seconds the motor burns | inferred |
| `accel` | scalar `number` | 76 | Acceleration while it does | inferred |
| `delay` | scalar `number` | 76 | Seconds before ignition. `0` on all 76 | inferred |

### `[Explosion]` — 156, in 2 files

**The one section spelled two ways** — `explosion` ×86 and `Explosion` ×70 — which is why nothing
here compares section names by string.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 156 | Identity | inferred |
| `lifetime` | tuple(1/2) `number` | 156 — 1 ×23, 2 ×133 | A duration, or a min/max range to pick one from. Arity kept as read | inferred |
| `process` | scalar `string` | 156 | `disappear` ×122 \| `shatter` ×22 \| `none` ×12 | inferred |
| `effect` | **repeated** tuple(1/2) | 145 over 143 sections | → `[Effect]` and an optional weight | inferred |
| `debris_type` | **repeated** tuple(2) `string, number` | 133 over 47 sections | → `[Debris]` and a weight | inferred |
| `radius` | scalar `number` | 93 | Blast radius | inferred |
| `hull_damage` / `energy_damage` | scalar `number` | 93 / 86 | | inferred |
| `impulse` | scalar `number` | 86 | Push applied. `0` on all 86 | inferred |
| `strength` | scalar `number` | 86 | `100` on all 86 | guessed |
| `num_child_pieces` | scalar `number` | 24 | Fragments produced by `shatter` | inferred |
| `innards_debris_object` | **repeated** `string` | 109 over 22 sections | Models thrown out of the interior | guessed |
| `innards_debris_num` / `_radius` / `_start_time` | scalar `number` | 22 / 22 / 47 | How many, how far, and when | guessed |
| `debris_impulse` | scalar `number` | 49 | Push applied to the debris | inferred |

Wiki-only: `da_archetype`, `material_library`, `mass` — three fields no retail explosion carries,
which is a wiki transcription from a neighbouring section.

### `[ShieldGenerator]` — 126, and `[Shield]` ×36

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `max_capacity` | scalar `number` | 126 | Shield pool | inferred |
| `regeneration_rate` | scalar `number` | 126 | Per second | inferred |
| `constant_power_draw` | scalar `number` | 126 | `0` on all 126 | inferred |
| `rebuild_power_draw` | scalar `number` | 126 | Draw while rebuilding from collapse | inferred |
| `offline_threshold` | scalar `number` | 126 | Fraction below which it collapses. `0.15` on 123 of 126 | inferred |
| `offline_rebuild_time` | scalar `number` | 126 | Seconds to come back. `12` on 123 | inferred |
| `shield_type` | scalar `string` | 121 | → `[WeaponType]`'s counterpart — `S_Graviton01`, `S_Molecular01`, `S_Positron01` | inferred |
| `hp_type` | scalar `string` | 123 | Mount class | inferred |
| `shield_hit_effects` | **repeated** tuple(2) `number, string` | 372 over 126 sections | A damage threshold and the `[Effect]` above it | guessed |
| `shield_collapse_sound` / `shield_rebuilt_sound` | scalar `string` | 126 each | → `[Sound]` | inferred |
| `shield_collapse_particle` | scalar `string` | 3 | → `[Effect]` | inferred |
| `[Shield]` `HP_child` | scalar `string` | 36 | `SpConnect` on all 36 — a different mount prefix from everything else | inferred |

Wiki-only: `hp_shield_type`.

### `[WeaponType]` — 21

The damage-type matrix, in `EQUIPMENT/weaponmoddb.ini`.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 21 | Identity — `W_Laser01`, `S_Graviton01`, and so on | inferred |
| `shield_mod` | **repeated** tuple(2) `string, number` | 189 over 21 sections | A shield type and the multiplier this weapon does against it. 21 × 9 is the whole matrix | inferred |

### `[Power]` — 164, in 2 files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `capacity` | scalar `number` | 164 | Energy pool | inferred |
| `charge_rate` | scalar `number` | 164 | Per second | inferred |
| `thrust_capacity` / `thrust_charge_rate` | scalar `number` | 32 each | The separate pool the thruster draws on | inferred |

### `[Engine]` — 60

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `max_force` | scalar `number` | 60 | Thrust | inferred |
| `linear_drag` | scalar `number` | 60 | Drag, which with `max_force` sets top speed | inferred |
| `reverse_fraction` | scalar `number` | 60 | Reverse thrust as a fraction of forward | inferred |
| `cruise_charge_time` | scalar `number` | 60 | Seconds to engage cruise. `5` on all 60 | inferred |
| `cruise_power_usage` | scalar `number` | 60 | `20` on all 60 | inferred |
| `indestructible` | scalar `boolean` | 60 | `false` on all 60 | inferred |
| `flame_effect` / `trail_effect` / `trail_effect_player` | scalar `string` | 59 / 40 / 32 | → `[Effect]`. The player gets a different trail | inferred |
| `cruise_disrupt_effect` | scalar `string` | 3 | → `[Effect]` | inferred |
| `rumble_sound`, `character_loop_sound`, `character_start_sound`, `engine_kill_sound`, `cruise_start_sound`, `cruise_loop_sound`, `cruise_stop_sound`, `cruise_disrupt_sound`, `cruise_backfire_sound` | scalar `string` | 60 down to 32 | → `[Sound]`, one per state. Nine of them | inferred |
| `rumble_atten_range` / `rumble_pitch_range` / `character_pitch_range` | tuple(2) `number` | 47 / 47 / 34 | Min and max, driven by throttle | guessed |
| `inside_sound_cone` / `outside_sound_cone` / `outside_cone_attenuation` | scalar `number` | 60 each | Directional audio cone, in degrees, and the trim outside it | inferred |

### `[Thruster]` — 6

Shared fields plus `max_force` (`72000` on all 6), `particles` → `[Effect]`, and `hp_particles`
naming the hardpoint it plays at.

### `[CloakingDevice]` — 9

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `cloakin_time` / `cloakout_time` | scalar `number` | 9 each | Seconds each way. **Note the spelling** — `cloakin`, not `cloak_in` | inferred |
| `cloakin_fx` / `cloakout_fx` | scalar `string` | 9 each | → `[Effect]` | inferred |

`hit_pts` is `1000000000` on all nine, which is how "cannot be shot off" is authored.

### `[Commodity]` — 105

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `units_per_container` | scalar `number` | 105 | Units in one cargo slot | inferred |
| `decay_per_second` | scalar `number` | 105 | Perishable goods. `0` on 102 of 105 | inferred |
| `loot_appearance` | scalar `string` | 105 | → `[LootCrate]` when jettisoned | inferred |
| `pod_appearance` | scalar `string` | 102 | → `[CargoPod]` when carried externally | inferred |

### `[CargoPod]` ×15, `[LootCrate]` ×29, `[Armor]` ×24, `[Light]` ×74, `[AttachedFX]` ×52, `[InternalFX]` ×37

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Armor]` | `hit_pts_scale` | scalar `number` | 24 | Multiplier on the ship's hull | inferred |
| `[LootCrate]` | `explosion_arch` | scalar `string` | 29 | → `[Explosion]`. `debris_normal` on all 29 | inferred |
| `[CargoPod]` | `explosion_arch` | scalar `string` | 12 | One per commodity colour | inferred |
| `[AttachedFX]` | `particles` | scalar `string` | 52 | → `[Effect]` played on a hardpoint | inferred |
| | `use_throttle` | scalar `boolean` | 1 | Scale it with throttle | guessed |
| `[InternalFX]` | `use_sound` | scalar `string` | 27 | → `[Sound]` | inferred |
| | `use_animation` | scalar `string` | 8 | Animation script — `Sc_loop`, `Sc_rotate ring`, and five more with **spaces in the name** | inferred |
| `[Light]` | `inherit` | scalar `string` | 58 | Another `[Light]` to take unset fields from. 58 of 74 | inferred |
| | `color` / `min_color` / `glow_color` | tuple(3) `number` | 17 / 14 / 8 | RGB, at full and at minimum, and for the glow sprite | inferred |
| | `bulb_size` / `glow_size` | scalar `number` | 46 each | **`bulb_size` is `float` ×37 and `int` ×9**, SCHEMA.md's second example | inferred |
| | `flare_cone` | tuple(2) `number` | 47 | Inner and outer angle of the flare | guessed |
| | `intensity` | scalar `number` | 11 | | guessed |
| | `avg_delay` / `blink_duration` | scalar `number` | 31 each | Blink timing | inferred |
| | `lightsource_cone` | scalar `number` | 6 | Degrees. `360` on 5 of 6 | guessed |
| | `always_on` / `docking_light` | scalar `boolean` | 2 each | | unread |

### `[Scanner]` ×2, `[Tractor]` ×1, `[RepairKit]` ×1, `[ShieldBattery]` ×1, `[TradeLane]` ×1

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Scanner]` | `range` / `cargo_scan_range` | scalar `number` | 2 each | Target range, and the shorter range at which cargo is readable | inferred |
| `[Tractor]` | `max_length` / `reach_speed` | scalar `number` | 1 each | Beam reach and how fast it pulls | inferred |
| | `color` | tuple(3) `number` | 1 | RGB of the beam | inferred |
| | `operating_effect` | scalar `string` | 1 | → `[Effect]` | inferred |
| | `tractor_complete_snd` | scalar `string` | 1 | → `[Sound]` | inferred |
| `[RepairKit]`, `[ShieldBattery]` | `units_per_container`, `loot_appearance` | | 1 each | Consumables; nothing else of their own | inferred |
| `[TradeLane]` | `tl_ship_enter`, `tl_ship_travel`, `tl_ship_exit`, `tl_ship_disrupt`, `tl_player_travel`, `tl_player_splash`, `tl_ring_active` | scalar `string` | 1 each | → `[Effect]` and `[Sound]`, one per phase of a lane transit | guessed |
| | `secs_before_enter`, `secs_before_splash`, `secs_before_exit` | scalar `number` | 1 each | Phase timing | guessed |
| | `spin_max`, `spin_accel`, `activation_start`, `activation_end` | scalar `number` | 1 each | Ring animation | guessed |

`[TradeLane]` has no wiki page, is a singleton, and drives every lane in the game.

### `[LOD]` — 388

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `obj` | scalar `string` | 388 | `Root` ×194 \| `barrel` ×194 — a part of the weapon model | inferred |
| `LODranges` | tuple(2) `number` | 388 | Its own thresholds, overriding the archetype's | inferred |

Positional: a `[LOD]` belongs to the `[Gun]` above it, which makes this the second **run-owning**
structure in the data after `[fuse]`. Not confirmed, but the file layout admits nothing else.

### `[EngineEquipConsts]` ×1, `[ShieldEquipConsts]` ×1

In `constants.ini`, assigned here on shape rather than location. Ten properties between them, each
once: the cruise timing and throttle-attenuation constants, and `HULL_DAMAGE_FACTOR`. All `guessed`.
Wiki-only on the engine block: `max_engine_fx_throttle`, `cruise_drag`, `cruise_accel_time`,
`cruising_speed`.

---

## `./ships`

**11 sections, 92 pairs, wiki reaches 82 (89%).** Three of the eleven — `[Loadout]`,
`[CollisionGroup]` and `[Simple]` — are **shared with `./solar` and `./fx`** and owned here, which is
what MODULES.md's shared-section table is about.

### `[Loadout]` — 803, in `SHIPS/loadouts.ini` and `SOLAR/loadouts.ini`

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 803 | Identity | inferred |
| `archetype` | scalar `string` | 534 | → `[Ship]` or `[Solar]` this fits. Absent on 269, which are fitted by whatever references them | inferred |
| `equip` | **repeated** tuple(1/2) `string` | **16,087 over 801 sections — 2 ×13,255, 1 ×2,832** | An equipment nickname and the hardpoint to mount it on. **The most-repeated property in the data.** The one-value form is equipment with no hardpoint — internal fittings | inferred |
| `cargo` | **repeated** tuple(2/3) | 1,043 over 388 sections — 2 ×905, 3 ×138 | A commodity and a count | inferred |

### `[CollisionGroup]` — 484, in `SHIPS/shiparch.ini` and `SOLAR/solararch.ini`

A destructible sub-part. Positional: it belongs to the `[Ship]` or `[Solar]` above it.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `obj` | scalar `string` | 484 | The `.cmp` part this group covers | inferred |
| `separable` | **flag**, mostly | 484 — **arity 0 ×456, arity 1 ×28** | Whether the part comes off. **456 write it as a zero-value flag and 28 write `separable = true`** — the same field in both of SCHEMA.md's forms, and the clearest reason a reader must accept a flag *and* a value | inferred |
| `hit_pts` | scalar `number` | 484 | | inferred |
| `child_impulse` | scalar `number` | 484 | Push on the part when it separates | inferred |
| `parent_impulse` | scalar `number` | 456 | Push on what it separates from | inferred |
| `debris_type` | scalar `string` | 484 | → `[Debris]` | inferred |
| `mass` | scalar `number` | 360 | | inferred |
| `root_health_proxy` | scalar `boolean` | 329 | Damage here damages the hull instead. `true` on all 329 | guessed |
| `dmg_hp` / `dmg_obj` | scalar `string` | 322 each | Hardpoint and part swapped in once destroyed | guessed |
| `group_dmg_hp` / `group_dmg_obj` | scalar `string` | 46 each | The same at group rather than part level | guessed |
| `fuse` | **repeated** tuple(3) `string, number, number` | 279 over 243 sections | → `[fuse]` in `./fx`, with a damage threshold and a delay. **This is the INI edge into the fuse scripts `./fx` already reads** | inferred |
| `separation_explosion` | scalar `string` | 106 | → `[Explosion]` | inferred |
| `type` | scalar `string` | 100 | | unread |
| `------------------------------------------` | **flag** | 1 | A separator comment the compiler took as a property name. Third case of a name that is not an identifier, after `[Object] 260800` and `[FlashlightSet] :gap` | unread |

Wiki-only: `explosion_resistance`, `linked_equip`.

### `[Ship]` — 115, in 2 files

The largest single archetype in the data by field count. 69 of the 115 are complete; the other 46 are
cutscene stand-ins in `rtc_shiparch.ini` carrying only the model fields.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 115 | Identity | inferred |
| `type` | scalar `string` | 115 | `FIGHTER` \| `FREIGHTER` \| `TRANSPORT` \| `GUNBOAT` \| `CRUISER` \| `CAPITAL` \| `MINING` | inferred |
| `ship_class` | scalar `number` | 33 | `0`–`3`. Distinct from `type` and used for level gating | guessed |
| `DA_archetype` | scalar `string` | 115 | **Path** to the `.cmp` | inferred |
| `material_library` | **repeated** `string` | 178 over 115 sections | **Path**. Repeats — a ship can need several `.mat` files | inferred |
| `LODranges` | list `number` | 115 — **arity 1 to 8** | The widest arity spread of any field in the data | inferred |
| `envmap_material` | scalar `string` | 63 | `envmapbasic` on all 63. → a material, for the reflection | inferred |
| `cockpit` | scalar `string` | 40 | **Path** to a cockpit `.ini`, not a nickname | inferred |
| `pilot_mesh` | scalar `string` | 39 | `generic_pilot` on all 39 | inferred |
| `ids_name` / `ids_info` | scalar `number` | 69 each | | inferred |
| `ids_info1` / `ids_info2` / `ids_info3` | scalar `number` | 33 each | The stat block is assembled from four infocards, not one | inferred |
| `msg_id_prefix` | scalar `string` | 65 | Voice prefix | guessed |
| `mission_property` | scalar `string` | 65 | `can_use_berths` \| `can_use_large_moors` \| `can_use_med_moors` — which docking points it fits | inferred |
| `mass` | scalar `number` | 69 | | inferred |
| `hold_size` | scalar `number` | 69 | Cargo capacity | inferred |
| `hit_pts` | scalar `number` | 69 | | inferred |
| `nanobot_limit` / `shield_battery_limit` | scalar `number` | 31 each | Consumable caps | inferred |
| `linear_drag` | scalar `number` | 69 | | inferred |
| `steering_torque` / `angular_drag` / `rotation_inertia` | tuple(3) `number` | 69 each | Per-axis: pitch, yaw, roll. **The three that decide how a ship handles** | inferred |
| `nudge_force` | scalar `number` | 69 | | guessed |
| `strafe_force` / `strafe_power_usage` | scalar `number` | 34 each | | inferred |
| `max_bank_angle` | scalar `number` | 36 | Degrees of roll in a turn | inferred |
| `camera_offset` | tuple(2) `number` | 37 | Chase camera, behind and above | inferred |
| `camera_angular_acceleration`, `camera_horizontal_turn_angle`, `camera_vertical_turn_up_angle`, `camera_vertical_turn_down_angle`, `camera_turn_look_ahead_slerp_amount` | scalar `number` | 35 each | Chase camera lag and lead | guessed |
| `camera_angular_slerp_multiplier` | scalar `number` | 1 | | unread |
| `explosion_arch` | scalar `string` | 69 | → `[Explosion]` | inferred |
| `fuse` | **repeated** tuple(3) | 159 over 63 sections | → `[fuse]`, threshold, delay. As `[CollisionGroup]`'s | inferred |
| `surface_hit_effects` | **repeated** tuple(4) | 207 over 69 sections | A damage threshold and three `[Effect]` nicknames | guessed |
| `shield_link` | tuple(3) `string` | 40 | Shield generator, and the two hardpoints the bubble spans | guessed |
| `hp_type` | **repeated** list `string` | 714 over 42 sections — arity 2 to 7 | A mount class and every hardpoint of that class. Both repeated *and* unbounded, which is the one field in the data that is genuinely both | inferred |
| `num_exhaust_nozzles` | scalar `number` | 69 | How many engine flames to draw | inferred |
| `bay_door_anim` | scalar `string` | 44 | Animation script for the cargo bay | inferred |
| `bay_doors_open_snd` / `bay_doors_close_snd` | scalar `string` | 45 each | → `[Sound]` | inferred |
| `HP_bay_surface` / `HP_bay_external` | scalar `string` | 64 each | Hardpoints the bay animation runs between | guessed |
| `HP_tractor_source` | scalar `string` | 68 | Where the tractor beam originates | inferred |
| `nomad` | scalar `boolean` | 3 | `true` on the three Nomad hulls | inferred |
| `docking_sphere` | tuple(4) | 2 | Shared shape with `[Solar]` | inferred |
| `docking_camera` / `distance_render` | scalar `number` | 2 each | Shared with `[Solar]` | unread |

### `[Simple]` — 235, in `SHIPS/shiparch.ini` and `FX/explosions.ini`

A model with no behaviour — debris, props, cutscene set dressing.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 235 | Identity | inferred |
| `DA_archetype` | scalar `string` | 235 | **Path** | inferred |
| `material_library` | scalar `string` | 235 | **Path** | inferred |
| `LODranges` | list `number` | 157 — 2 ×48, 3 ×109 | | inferred |
| `mass` | scalar `number` | 234 | | inferred |
| `hit_pts` | scalar `number` | 39 | `200` on all 39 | inferred |
| `MinSpecLOD` | scalar `number` | 1 | Lowest LOD a minimum-spec machine draws | guessed |

### `[Cockpit]` ×33, `[CockpitCamera]` ×34, `[TurretCamera]` ×33, `[RearViewCamera]` ×1

One cockpit file per ship, holding all four.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Cockpit]` | `mesh` | scalar `string` | 33 | **Path** to the cockpit model | inferred |
| | `int_brightness` | scalar `number` | 33 | `0.5` on all 33 | guessed |
| | `head_turn` | tuple(2) `number` | 33 | How far the pilot's view swings, each axis | guessed |
| `[CockpitCamera]` | `fovx` | scalar `number` | 1 | Horizontal field of view | inferred |
| | `znear` | scalar `number` | 3 | Near plane. **`int` ×2 and `float` ×1**, SCHEMA.md's third example | inferred |
| `[TurretCamera]` | `tether` | tuple(3/4) `number` | 33 — 3 ×31, **4 ×2** | How the turret view trails the ship. SCHEMA.md names this as a trailing-optional tuple, and this is the measurement | inferred |
| | `yaw_rotate_speed` / `pitch_rotate_speed` / `accel_speed` | scalar `number` | 33 each | | inferred |
| `[RearViewCamera]` | `view_position` | tuple(3) `number` | 1 | | inferred |

### `[WinCamera]` ×1, `[ChaseCamera]` ×1, `[DeathCamera]` ×1

Singletons in the root `cameras.ini`, each carrying only `fovx`. Here rather than in `./constants`
because they are the same shape as the cockpit cameras.

---

## `./solar`

**29 sections, 234 pairs, wiki reaches 128 (55%).** The split is clean and worth knowing before
starting: **the archetypes are documented and the skies are not.** `[Solar]`, `[Field]`, `[Cube]`,
`[Band]` and the asteroid family have wiki pages; `[Exterior]`, `[Clouds]`, `[Fog]`, `[NebulaLight]`,
`[BackgroundLightning]`, `[DynamicLightning]`, `[Lens_Glow]`, `[ExclusionBand]`, `[FadeChunks]` and
`[CloseChunks]` — 10 sections and 90 pairs of nebula and ring rendering — have none at all, and
`rings.md` and `nebula_fields.md` are two of the 21 empty stubs.

Four sections are **shared with `./universe`** and owned here: `[Field]`, `[TexturePanels]`,
`[AsteroidBillboards]`, `[Shape]`.

### `[Solar]` — 321, in `SOLAR/solararch.ini`

What `[Object] Archetype` names. Shares its whole presentation half with `[Ship]`.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 321 | Identity | inferred |
| `type` | scalar `string` | 321 | Object class the universe loader reads. `freelancer.ini` warns solar must load before universe **because universe inspects this field** | inferred |
| `DA_archetype` | scalar `string` | 321 | **Path** to the `.3db` or `.cmp` | inferred |
| `material_library` | **repeated** `string` | 622 over 315 sections | **Path**. Repeats — a station needs several | inferred |
| `LODranges` | list `number` | 255 — arity 2 to 8 | | inferred |
| `envmap_material` | scalar `string` | 115 | `envmapbasic` on all 115 | inferred |
| `shape_name` | scalar `string` | 313 | Navmap icon | guessed |
| `solar_radius` | scalar `number` | 316 | Radius used for culling and for the navmap | guessed |
| `mass` | scalar `number` | 293 | | inferred |
| `hit_pts` | scalar `number` | 237 | | inferred |
| `ids_name` | scalar `number` | 215 | | inferred |
| `ids_info` | **repeated** `number` | 217 over 216 sections | | inferred |
| `loadout` | scalar `string` | 87 | → `[Loadout]` | inferred |
| `destructible` | **repeated** `boolean` | 77 over 76 sections | `true` on all 77. One section carries it twice | inferred |
| `explosion_arch` | scalar `string` | 75 | → `[Explosion]` | inferred |
| `fuse` | **repeated** tuple(3) | 115 over 74 sections | → `[fuse]`, threshold, delay | inferred |
| `docking_sphere` | **repeated** tuple(3/4) | 262 over 55 sections — 3 ×162, 4 ×100 | Dock type, hardpoint, radius, and optionally an animation script | inferred |
| `docking_camera` | scalar `number` | 42 | `0` on all 42 | unread |
| `open_anim` | scalar `string` | 2 | Animation script for the dock | inferred |
| `open_sound` / `close_sound` | scalar `string` | 36 each | → `[Sound]` | inferred |
| `jump_out_hp` | scalar `string` | 9 | Hardpoint a ship emerges from | guessed |
| `surface_hit_effects` | tuple `number, string…` | 53 | As `[Ship]`'s | guessed |
| `shield_link` | tuple(3) `string` | 3 | As `[Ship]`'s | guessed |
| `phantom_physics` | scalar `boolean` | 7 | `true` on all 7. The player passes through the model | inferred |
| `animated_textures` | scalar `boolean` | 1 | | guessed |
| `distance_render` | scalar `number` | 2 | | unread |
| `nomad` | scalar `boolean` | 1 | | inferred |

### `[Asteroid]` ×86, `[DynamicAsteroid]` ×26, `[AsteroidMine]` ×9

Three archetypes in `SOLAR/asteroidarch.ini`, all carrying `DA_archetype` and `material_library` as
**paths**.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Asteroid]` | `explosion_arch` | scalar `string` | 4 | → `[Explosion]` | inferred |
| | `recharge_time` | scalar `number` | 4 | Seconds before it can be mined again | guessed |
| `[DynamicAsteroid]` | `explosion_arch` | scalar `string` | 26 | → `[Explosion]` | inferred |
| | `particle_effect` | scalar `string` | 3 | → `[Effect]` trailing the rock | inferred |
| `[AsteroidMine]` | `detect_radius` | scalar `number` | 9 | Proximity trigger | guessed |
| | `explosion_offset` | scalar `number` | 9 | Where the blast is centred relative to the rock | guessed |
| | `explosion_impulse` | scalar `number` | 3 | | guessed |
| | `recharge_time` | scalar `number` | 9 | | guessed |
| | `phantom_physics` | scalar `boolean` | 3 | | inferred |

### `[Field]` — 154, and the field body sections

A field definition file is `[Field]` followed by the body sections that fill it. Positional in the
same weak sense `[LOD]` is — the file has one of each.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `cube_size` | scalar `number` | 154 | Edge of the repeating cell the field tiles | inferred |
| `fill_dist` | scalar `number` | 154 | How far from the camera cells are populated | inferred |
| `empty_cube_frequency` | scalar `number` | 149 | Fraction of cells left empty | inferred |
| `diffuse_color` / `ambient_color` / `ambient_increase` | tuple(3) `number` | 126 each | Lighting applied to the rocks | inferred |
| `tint_field` | tuple(3) `number` | 28 | | guessed |
| `max_alpha` | scalar `number` | 8 | | guessed |
| `contains_fog_zone` | scalar | 1 | | unread |

### `[Cube]` — 153

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `asteroid` | **repeated** list | **810 over 153 sections — 7 ×740, 8 ×70** | One rock in the cell: archetype, three position components, three rotation components, and an optional eighth. The field's whole contents are these rows | guessed |
| `xaxis_rotation` / `yaxis_rotation` / `zaxis_rotation` | tuple(4) `number` | 21 each | Per-axis rotation ranges applied to the cell | guessed |

### `[DynamicAsteroids]` — 145

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `asteroid` | scalar `string` | 145 | → `[DynamicAsteroid]` | inferred |
| `count` | scalar `number` | 145 | How many follow the player | inferred |
| `placement_radius` / `placement_offset` | scalar `number` | 145 each | The shell they are placed in around the camera | guessed |
| `max_velocity` / `max_angular_velocity` | scalar `number` | 145 each | | inferred |
| `color_shift` | tuple(3) `number` | 144 | RGB multiplier | inferred |

### `[AsteroidBillboards]` — 99

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `count` | scalar `number` | 99 | Impostors drawn beyond the real rocks | inferred |
| `start_dist` | scalar `number` | 99 | Where they take over | inferred |
| `fade_dist_percent` | scalar `number` | 99 | Fraction of that distance spent fading | inferred |
| `shape` | scalar `string` | 99 | → a `[Shape]` in a texture panel library | inferred |
| `size` | tuple(2) `number` | 99 | Width and height | inferred |
| `color_shift` | tuple(3) `number` | 96 | | inferred |
| `ambient_intensity` | scalar `number` | 95 | | inferred |

### `[Band]` — 74, and `[ExclusionBand]` — 3

A planetary or asteroid ring drawn as a strip.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `shape` | scalar `string` | 74 | → a `[Shape]`. Five values in retail | inferred |
| `render_parts` | scalar `number` | 74 | Segments the ring is divided into | inferred |
| `height` / `offset_dist` | scalar `number` | 74 each | Strip height, and its distance from the parent | inferred |
| `fade` | tuple(4) `number` | 74 | Four distances defining the fade in and out | guessed |
| `texture_aspect` | scalar `number` | 74 | | inferred |
| `color_shift` | tuple(3) `number` | 74 | | inferred |
| `ambient_intensity` | scalar `number` | 72 | | inferred |
| `vert_increase` | scalar `number` | 74 | Vertical tessellation | guessed |
| `[ExclusionBand] zone` | scalar `string` | 3 | → `[Zone]` the band is cut out of | inferred |
| `[ExclusionBand] cull_mode` | scalar `number` | 3 | `0` on all 3. **Wiki-only on `[Band]`, real on `[ExclusionBand]`** | guessed |

`[ExclusionBand]` has no wiki page and is `[Band]` plus `zone` and `cull_mode` — and `cull_mode` is
one of `[Band]`'s two wiki-only fields, so the wiki has the field on the wrong section rather than
inventing it.

### `[Exclusion Zones]` — 169

Note the space in the section name, which is why headers stay opaque strings.

**`exclusion` is an opener, and the eight properties under it are its members, not eight flat
lists.** This section is the clean case of [SCHEMA.md](SCHEMA.md)'s fifth identity kind and the one
that forced `Fields.group`: **634 openers over 169 sections with zero members before the first**,
runs of nought to five. The reading recorded here before was nine unrelated repeated lists, which
loses which shell belongs to which zone — an `exclusion` with a `zone_shell` and a `max_alpha` is one
record, and the file writes them adjacent for exactly that reason:

```ini
exclusion = ZONE_Br04_EastLeeds_exclusion_1
fog_far = 9000
zone_shell = solar\nebula\walker_exclusion.3db
max_alpha = 0.3
exclusion = ZONE_Br04_EastLeeds_exclusion_3
fog_far = 9000
zone_shell = solar\nebula\generic_exclusion.3db
max_alpha = 0.3
exclusion_tint = 170, 30, 30
```

The **grouping** is `inferred` — a zero-orphan sweep over 634 openers is what it rests on. Each
member's own meaning keeps the status it had.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `exclusion` | **group** opener, `string` | 634 over 169 sections | → `[Zone]` cut out of this field, owning the members below until the next `exclusion` | inferred |
| `exclude_billboards` | member `number` | 165 over 63 sections | `1` throughout | guessed |
| `exclude_dynamic_asteroids` | member `number` | 11 over 7 sections | `1` throughout | guessed |
| `fog_far` | member `number` | 100 over 33 sections | | unread |
| `zone_shell` | member `string` | 86 over 30 sections | **Path** to a `.3db` drawn as the exclusion boundary | guessed |
| `max_alpha` | member `number` | 86 over 30 sections | Opacity of it | guessed |
| `shell_scalar` | member `number` | 25 over 19 sections | Scale applied to it | guessed |
| `exclusion_tint` | member tuple(3) `number` | 43 over 25 sections | | guessed |
| `empty_cube_frequency` | scalar `number` | 3 | Overrides `[Field]`'s inside the exclusion. Section-level, not a member | guessed |
| `billboard_count` | scalar `number` | 2 | Section-level | unread |
| `color` | tuple(3) `number` | 1 | Section-level | unread |
| `exclude` | scalar | 1 | Misspelling of `exclusion`, once — and therefore **not** an opener, so whatever followed it attaches to the previous one | unread |

### `[Properties]` — 202

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `flag` | **repeated** `string` | 365 over 202 sections | Named traits of the field — how the navmap and the mining system classify it | guessed |

### `[LootableZone]` — 80

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `asteroid_loot_container` / `dynamic_loot_container` | scalar `string` | 80 each | → `[LootCrate]` | inferred |
| `asteroid_loot_commodity` / `dynamic_loot_commodity` | scalar `string` | 80 each | → `[Commodity]` | inferred |
| `asteroid_loot_count` / `dynamic_loot_count` | tuple(2) `number` | 80 each | Min and max units | inferred |
| `asteroid_loot_difficulty` / `dynamic_loot_difficulty` | scalar `number` | 80 each | Mining difficulty | guessed |
| `zone` | scalar `string` | 18 | → `[Zone]` | inferred |

The static and dynamic halves are the same four fields twice — rock mining and debris mining.

### `[TexturePanels]` ×241, `[Texture]` ×51, `[Shape]` ×82

The texture panel library: a `.txm` file, the shapes cut out of it, and the rectangles that define
them. `[Texture]` and `[Shape]` also appear in `mouse.ini`, which is `./interface`'s.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[TexturePanels]` | `file` | **repeated** `string` | 243 over 241 sections | **Path** to the library | inferred |
| `[Texture]` | `file` | scalar `string` | 51 | **Path** to the `.txm` | inferred |
| | `name` | scalar `string` | 16 | | inferred |
| | `tex_shape` | **repeated** `string` | 74 over 27 sections | Shape names the library provides. Same field `./fx` reads on `[Texture]` in `effect_shapes.ini` | inferred |
| | `texture_name` / `shape_name` | **repeated** `string` | 16 / 49 | The `mouse.ini` spelling of the same pairing | guessed |
| | `dim` | **repeated** tuple(4) `number` | 44 over 7 sections | The rectangle, inline rather than as a `[Shape]` | guessed |
| `[Shape]` | `name` | scalar `string` | 82 | Identity | inferred |
| | `x` / `y` / `w` / `h` | scalar `number` | 81 each | Pixel rectangle within the texture | inferred |

### `[Star]` ×38, `[Star_Glow]` ×46, `[Lens_Flare]` ×7, `[Lens_Glow]` ×5, `[Spines]` ×16

`SOLAR/stararch.ini`. `[Star]` names the other four by nickname.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Star]` | `nickname` | scalar `string` | 38 | Identity, named by `[Object] star` | inferred |
| | `radius` | scalar `number` | 38 | | inferred |
| | `star_glow` | scalar `string` | 38 | → `[Star_Glow]` | inferred |
| | `star_center` | scalar `string` | 36 | → a shape for the disc | inferred |
| | `lens_flare` / `lens_glow` | scalar `string` | 32 / 34 | → `[Lens_Flare]` / `[Lens_Glow]` | inferred |
| | `spines` | scalar `string` | 29 | → `[Spines]` | inferred |
| | `intensity_fade_in` / `_out` | scalar `number` | 36 each | `0` throughout | unread |
| | `zone_occlusion_fade_in` / `_out` | scalar `number` | 36 each | `1` throughout. Fading when a nebula occludes the star | guessed |
| `[Star_Glow]` | `shape` | scalar `string` | 46 | → a `[Shape]` | inferred |
| | `scale` | scalar `number` | 46 | | inferred |
| | `inner_color` / `outer_color` | tuple(3) `number` | 46 each | Gradient across the glow | inferred |
| `[Lens_Flare]` | `shape` | scalar `string` | 7 | `hexagon` \| `lenscircle2` | inferred |
| | `min_radius` / `max_radius` | scalar `number` | 7 each | | inferred |
| | `bead` | **repeated** list `number` | 61 over 7 sections, arity 6 | One flare element along the lens axis | guessed |
| `[Lens_Glow]` | `shape`, `radius_scale`, `inner_color`, `outer_color`, `glow_fade_in_seconds`, `glow_fade_out_seconds` | | 5 each | No wiki page. Same shape as `[Star_Glow]` plus the fade times | guessed |
| `[Spines]` | `shape` | scalar `string` | 16 | `stripe_narrow` \| `stripe_flare` | inferred |
| | `radius_scale`, `min_radius`, `max_radius` | scalar `number` | 16 / 14 / 14 | | inferred |
| | `spine` | **repeated** list `number` | 88 over 16 sections, arity 9 | One spike: nine numbers, undecoded | unread |

### The sky sections — no wiki pages

Ten sections, 90 pairs, nothing documented. Read from the sweep and from what the names say. These
are what `SOLAR/NEBULA/*` and `SOLAR/RINGS/*` are made of, and the module cannot be finished without
observation.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Exterior]` ×70 | `shape` | **repeated** `string` | 247 over 70 sections | Shapes composing the nebula shell | guessed |
| | `shape_weights` | tuple(4) `number` | 59 | Weights choosing between them | guessed |
| | `fill_shape` | scalar `string` | 59 | Shape used for the interior fill | guessed |
| | `plane_slices` | scalar `number` | 59 | Slices of the shell drawn | guessed |
| | `bit_radius`, `bit_radius_random_variation`, `min_bits`, `max_bits`, `move_bit_percent`, `equator_bias` | scalar `number` | 59 each | The scattered "bits" that make a nebula look volumetric | guessed |
| | `color` | tuple(3) `number` | 68 | | inferred |
| | `opacity`, `thickness_edge`, `outer_edge`, `inner_edge`, `num_segments`, `transition_dist` | scalar `number` | 3–11 each | Ring geometry, on the ring files rather than the nebula ones | guessed |
| | `fade_range` | tuple(2) `number` | 8 | | guessed |
| | `detail_shape` / `detail_tile` | | 4 each | | unread |
| | `ball_scale`, `flash`, `flash_radius`, `flash_size`, `spin` | scalar | 2 each | | unread |
| `[Clouds]` ×66 | `puff_shape` | **repeated** `string` | 264 over 66 sections | Shapes a cloud puff is drawn from | guessed |
| | `puff_weights` | tuple(4) `number` | 66 | Weights choosing between them | guessed |
| | `puff_count`, `puff_radius`, `puff_drift`, `puff_max_alpha` | scalar `number` | 51–66 | | guessed |
| | `puff_colora` / `puff_colorb` | tuple(3) `number` | 66 / 64 | Gradient endpoints | inferred |
| | `max_distance` | scalar `number` | 66 | | inferred |
| | `near_fade_distance` | tuple(2) `number` | 64 | | inferred |
| | `lightning_intensity`, `lightning_gap`, `lightning_duration` | scalar `number` | 33–40 | | guessed |
| | `lightning_color` | tuple(3) `number` | 40 | | inferred |
| | `puff_density`, `puff_cloud_size`, `puff_particles`, `puff_size`, `puff_opacity` | scalar | 2 each | A second spelling of four of the fields above, in two files | unread |
| `[Fog]` ×61 | `fog_enabled` | scalar `number` | 59 | `1` throughout | inferred |
| | `near` / `distance` | scalar `number` | 59 each | Fog start and end | inferred |
| | `color` | tuple(3) `number` | 61 | | inferred |
| | `opacity` | scalar `number` | 2 | | unread |
| `[NebulaLight]` ×60 | `ambient` | tuple(3) `number` | 60 | Ambient light inside the nebula | inferred |
| | `sun_burnthrough_intensity` / `_scaler` | scalar `number` | 47 each | How much of the star shows through | guessed |
| `[BackgroundLightning]` ×54 | `duration`, `gap` | scalar `number` | 54 each | | inferred |
| | `color` | tuple(3) `number` | 54 | | inferred |
| `[DynamicLightning]` ×20 | `duration`, `gap`, `ambient_intensity`, `intensity_increase` | scalar `number` | 20 each | Same as background, plus the flash's effect on ambient | guessed |
| | `color` | tuple(3) `number` | 20 | | inferred |
| `[FadeChunks]` ×2, `[CloseChunks]` ×2 | `num`, `shape`, `thickness` | | 2 each | Debris rings around the two black holes, `SOLAR/BLACKHOLE/` | guessed |
| | `fade_range` | tuple(4) / tuple(2) | 2 each | **Different arity in the two sections** — 4 in `[FadeChunks]`, 2 in `[CloseChunks]` | inferred |
| | `size` | tuple(2) `number` | 2 each | | inferred |
| | `color` | tuple(3) `number` | 2 each | | inferred |

---

## `./fx` — built

**25 sections, 167 pairs, wiki reaches 148 (89%).** Recorded after the fact, because
[`src/fx/`](../src/fx/index.ts) was written before this document existed. It is the worked example:
every row below has a corresponding field on an interface in
[`src/fx/types.ts`](../src/fx/types.ts), and the two agree.

See [FX.md](FX.md) for the findings. The three that a table cannot carry:

- **`[fuse]` opens a run**, and every section after it belongs to that script until the next `[fuse]`.
  209 openers own 1,960 action sections with nothing but position linking them. A flat read yields
  1,960 orphans. This is the **fourth identity kind** SCHEMA.md now names.
- **`[VisEffect] effect_crc` is the case-sensitive hash**, `getResourceId(name, true)`. It resolves
  1,210 of 1,218; the folded hash resolves a strict subset of 1,150.
- **`at_t`'s two-value form is a min/max to pick a moment from**, not a start and an end. 17 of the
  1,960 actions carry it. Arity is kept as read.

### The archetypes

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[VisEffect]` ×1,218 | `nickname` | scalar `string` | 1,218 | Identity | inferred |
| | `alchemy` | scalar `string` | 1,218 | **Path** to the `.ale` | inferred |
| | `effect_crc` | scalar `number` | 1,218 | Selects one effect inside it. **Case-sensitive hash** | inferred |
| | `textures` | **repeated** `string` | 3,818 over 1,198 sections | **Paths** to `.txm` libraries. Up to ten per effect | inferred |
| `[Effect]` ×705 | `nickname` | scalar `string` | 705 | Identity | inferred |
| | `effect_type` | scalar `string` | 704 | → `[EffectType]` | inferred |
| | `vis_effect` | scalar `string` | 660 | → `[VisEffect]` | inferred |
| | `vis_generic` | scalar `string` | 137 | → `[VisEffect]`, the low-detail alternative | guessed |
| | `vis_beam` | scalar `string` | 49 | → `[BeamSpear]` or `[BeamBolt]`. **No wiki row** | inferred |
| | `snd_effect` | scalar `string` | 134 | → `[Sound]`, looping for the effect's duration | inferred |
| | `lgt_effect` | scalar `string` | 25 | `elite_flash_to_red` on all 25 | guessed |
| | `lgt_range_scale` / `lgt_radius` | scalar `number` | 25 each | Identical values in all 25 sections | guessed |
| | `:` | scalar | 1 | **A property named `:`.** Residue, preserved | unread |
| `[EffectType]` ×45 | `nickname` | scalar `string` | 45 | Identity. **The set is hardcoded** — the wiki says the names cannot be changed or added to | inferred |
| | `priority` / `generic_priority` | scalar `number` | 45 each | Culling order when the particle budget is exhausted | guessed |
| | `lod_type` | scalar `string` | 45 | `EFT_LOD_NONE` \| `_TRAIL` \| `_WEAPON` \| `_SMALL` \| `_MEDIUM` \| `_LARGE` \| `_SMALL_DISTANT`, **plus `EFT_LOD_MED` which the wiki does not list** | inferred |
| | `radius` | scalar `number` | 45 | Approximate size, feeding `visibility` and `update` | guessed |
| | `visibility` | scalar `string` | 45 | `EXIST_OFFSCREEN` \| `CULL_OFFSCREEN` | inferred |
| | `update` | scalar `string` | 45 | `UPDATE_OFFSCREEN` \| `CULL_UPDATE` | inferred |
| | `run_time` | scalar `number` | 45 | Maximum seconds. **`-1` is the "forever" idiom** | inferred |
| | `pbubble` | tuple(2) `number` | 45 | Radii the effect gets a particle budget within | guessed |
| `[EffectLOD]` ×6 | `type` | scalar `string` | 6 | Identity. **Named `type`, not `nickname`** | inferred |
| | `max_lod_screen_size`, `min_lod_screen_size`, `min_screen_size` | scalar `number` | 6 each | Screen-size thresholds for the class | guessed |
| `[Debris]` ×41 | `nickname` | scalar `string` | 41 | Identity | inferred |
| | `death_method` | scalar `string` | 41 | `exploding` \| `vanishing` | inferred |
| | `lifetime` | tuple(2) `number` | 41 | Min and max seconds | inferred |
| | `linear_drag` | scalar `number` | 41 | | inferred |
| | `angular_drag` / `rotation_inertia` | tuple(3) `number` | 41 / 2 | Per axis | inferred |
| | `trail` | scalar `string` | 11 | → `[Effect]` | inferred |
| | `explosion` | scalar `string` | 39 | → `[Explosion]` | inferred |
| `[LightAnim]` ×26 | `name` | scalar `string` | 26 | Identity. **`name`, not `nickname`** — second section to do so after `[fuse]` | inferred |
| | `frame` | **repeated** list `number` | 72 over 26 sections, arity 5 | One keyframe: time and four components | guessed |
| `[Layer]` ×8 | `texture` | scalar `string` | 8 | `jumptube` \| `jumptube5` | inferred |
| | `color` | tuple(3) `number` | 8 | | inferred |
| | `near_alpha_factor` / `far_alpha_factor` / `radius_factor` | scalar `number` | 8 each | | guessed |
| | `u_offset` / `v_offset` | scalar `number` | 8 each | Texture scroll | inferred |

`[Layer]` is positional inside `[Gate_Tunnel]` / `[JumpGateEffect]` / `[JumpShipEffect]`, which is a
third run-owning structure.

### The beam appearances

`[BeamSpear]` ×51 and `[BeamBolt]` ×4 share thirteen fields; the bolt adds `core_length`,
`sec_core_width`, `sec_core_color` and `sec_outter_color`, and the two are modelled as a
discriminated union so a consumer cannot read `sec_core_color` off a spear.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 51 / 4 | Identity, named by `[Effect] vis_beam` | inferred |
| `tip_length` / `tail_length` / `head_width` / `core_width` | scalar `number` | 51 each | The beam's geometry | inferred |
| `tip_color` / `core_color` / `outter_color` / `tail_color` | tuple(3) `number` | 51 each | 8-bit RGB. **`outter`, with two t's**, as authored | inferred |
| `head_brightness` / `trail_brightness` | scalar `number` | 51 each | Alpha, `0`–`1` | inferred |
| `head_texture` | scalar `string` | 51 | `ball` \| `star` | inferred |
| `trail_texture` | scalar `string` | 51 | `wide` \| `thin` | inferred |
| `flash_size` | scalar `number` | 51 | Muzzle flash at creation | inferred |

### The fuse scripts

`[fuse]` ×209 and the twelve action kinds it owns. Full tables in `src/fx/types.ts`; the shape is
what matters here.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[fuse]` | `name` | scalar `string` | 209 | Identity. **`name`, not `nickname`, alone among archetypes** | inferred |
| | `lifetime` | scalar `number` | 209 | **Not the script's duration** — 61 of 1,921 timed actions fire after it | inferred |
| | `death_fuse` | scalar `boolean` | 105 | Whether this is the script a death runs | inferred |
| | `LODranges` | tuple(4) `number` | 1 | On one fuse only | unread |
| `[start_effect]` ×1,353 | `effect` | **repeated** `string` | 1,320 | → `[Effect]` | inferred |
| | `hardpoint` | **repeated** `string` | 2,256 over 1,320 sections | Repeats in 129 sections — one effect, many mounts | inferred |
| | `at_t` | **repeated** tuple(1/2) | 1,318 | When it fires. **Absent on 38** | inferred |
| | `attached` | **repeated** `boolean` | 938 | Follows the part, or is left in world space | inferred |
| | `pos_offset` / `ori_offset` | **repeated** tuple(3) | 965 / 830 | | inferred |
| | `particles` | scalar `string` | 3 | Residue — `effect` under another name | unread |
| | `ONLY` / `age_fire` | **flag** | 1 each | Residue, preserved | unread |
| `[destroy_group]` ×291 | `at_t` | tuple(1/2) | 291 — 2 ×2 | | inferred |
| | `group_name` | scalar `string` | 291 | → `[CollisionGroup] obj`, or `random` | inferred |
| | `fate` | scalar `string` | 290 | `disappear` \| `debris` | inferred |
| | `separable` / `dmg_hp` / `dmg_obj` | | 1 each | Residue from `[CollisionGroup]`, preserved | unread |
| `[destroy_hp_attachment]` ×163 | `at_t` | tuple(1/2) | 163 — **2 ×15** | | inferred |
| | `hardpoint` | scalar `string` | 163 | A hardpoint, or `random` | inferred |
| | `fate` | scalar `string` | 163 | `debris` \| `disappear` \| `loot` | inferred |
| `[destroy_root]` ×37 | `at_t` | scalar `number` | 37 | `1` on all 37 | inferred |
| `[ignite_fuse]` ×74 | `at_t` | scalar `number` | 74 | | inferred |
| | `fuse` | scalar `string` | 74 | → another `[fuse]`. **This is what makes fuses a graph** | inferred |
| | `fuse_t` | scalar `number` | 72 | Where in that script to start | inferred |
| `[impulse]` ×16 | `at_t`, `hardpoint`, `radius`, `force` | | 16 each | The push a detonation gives everything nearby | inferred |
| | `damage` | scalar `number` | 12 | `0` on all 12 | inferred |
| | `pos_offset` | tuple(3) `number` | 12 | | inferred |
| `[start_cam_particles]` ×13 | `effect`, `at_t`, `pos_offset`, `ori_offset` | | 13 each | `gf_whiteflash` on all 13 — particles on the camera, not the object | inferred |
| `[damage_group]` ×3, `[damage_root]` ×7 | `group_name`, `damage_type`, `hitpoints` | | | | inferred |
| `[tumble]` ×1, `[dump_cargo]` ×1, `[make_invincible]` ×1 | | | 1 each | `make_invincible` is the only action with no `at_t` | inferred |

### `[Gate_Tunnel]` ×4, `[JumpGateEffect]` ×5, `[JumpShipEffect]` ×1

Not yet read by `./fx` — the `gate_tunnels` and `jump_effect` `[Data]` keys are still stub arms in
`Game.#interpret`. `[Layer]` above is their body.

---

## `./interface`

**42 sections, 303 pairs, wiki reaches 40 (13%) — the least documented module in the data**, and the
one whose files break the most assumptions. 303 pairs across only 352 occurrences: almost every
section here is a singleton with a long property list.

**Three structural patterns live only here**, and a reader must handle all three:

1. **The property name is the data.** `[Montage]` in `INTERFACE/buttonmontage.ini` has 53 properties
   whose names are **file paths** — `interface\HUD\HUD_contactall.3db = 0, 0` — and `[NavBar]` has 26
   whose names are room names and `IDS_*` symbols. There is no fixed schema to write; the reader must
   yield the properties as pairs.
2. **Numbered section families.** `[RoomControl1]`..`[RoomControl7]` and `[ButtonControl1]`..`[5]` are
   twelve sections with **identical eleven-property shapes**, differing only by a digit in the name.
3. **Sections with no properties at all.** `[Waypoint]`, `[Status]`, `[Target]`, `[Core]`,
   `[ContactList]`, `[Targetable_Objects]`, `[DamageIndicator]`, `[CruiseProgress]` in
   `INTERFACE/hud.ini`, and `[keymap=1.1]` — nine empty sections that exist as markers. A reader that
   requires an identity property finds nothing here.

`[keymap=1.1]` also carries an `=` in its section name, which is the reason section headers are
opaque strings and never identifiers.

### The keymap — `[KeyCmd]` ×146, `[KeyMap]` ×5, `[key]` ×92 — no wiki pages

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[KeyCmd]` | `nickname` | scalar `string` | 146 | Identity of a bindable command | inferred |
| | `ids_name` / `ids_info` | scalar `number` | 126 each | | inferred |
| | `state` | tuple(1/2/3) `string` | 146 — 1 ×104, 2 ×37, 3 ×5 | `keydown` \| `keyup`, one per binding slot | guessed |
| | `key` | **repeated** tuple(1/2) | 123 over 114 sections | Default binding: a key, optionally with a modifier | guessed |
| `[KeyMap]` | `nickname` | scalar `string` | 5 | `IDR_ALWAYS_PRESENT`, `IDR_GAMEFLOW`, `IDR_SPACE`, `IDR_COCKPIT`, `IDR_CHASECAM` — the five contexts a binding can be active in | inferred |
| | `key` | **repeated** `string` | 151 over 4 sections | Which `[KeyCmd]`s belong to the context | guessed |
| `[key]` | `id` | scalar `number` | 92 | A scancode. `INTERFACE/keylist.ini`, grouped by the `[Group]` sections above it | guessed |

### Fonts — `[TrueType]` ×22, `[Style]` ×15

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[TrueType]` | `nickname` | scalar `string` | 21 | **21 of 22 carry one** — one of SCHEMA.md's three sometimes-nicknamed sections, and the smallest split | inferred |
| | `font` | **repeated** tuple(1/3) | 29 over 22 sections — 1 ×21, 3 ×8 | The typeface name, sometimes with two more values. Names contain spaces — `Agency FB`, `Arial Unicode MS` | guessed |
| | `fixed_height` | scalar `number` | 21 | | guessed |
| `[Style]` | `name` | scalar `string` | 15 | Identity, in `FONTS/rich_fonts.ini`. No wiki page | inferred |
| | `font` | scalar `number` | 15 | **An index into the `[TrueType]` list, not a name** | guessed |
| | `bold` / `italic` / `underline` | scalar `boolean` | 15 each | `false` throughout | inferred |
| | `color` | tuple(3) `number` | 15 | | inferred |
| | `justify` | scalar `string` | 1 | | unread |

### `[Cursor]` ×19, `[IGraph]` ×11

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Cursor]` | `nickname` | scalar `string` | 19 | Identity, in `mouse.ini` | inferred |
| | `anim` | tuple(3) `string, number, number` | 19 | A `[Shape]` and two numbers — frame count and rate | guessed |
| | `hotspot` | tuple(2) `number` | 19 | Click point within the image | inferred |
| | `blend` | scalar `number` | 19 | `4` on all 19 — a D3D blend mode | guessed |
| | `color` | tuple(4) `number` | 5 | RGBA. **Four, not three** | inferred |
| | `scale` | scalar `number` | 18 | | inferred |
| | `spin` | scalar `number` | 8 | | inferred |
| `[IGraph]` | `nickname` | scalar `string` | 11 | Identity. Named by `[LightSource] color_curve` | inferred |
| | `type` | scalar `string` | 11 | `FLOAT` \| `COLOR` — **selects the arity of `point`** | inferred |
| | `point` | **repeated** tuple(2) | 56 over 11 sections | One control point of the curve | guessed |

### The lookup tables

Three sections that are nothing but one repeated property, and between them 5,224 rows.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[KnowledgeMapTable]` ×2 | `Map` | **repeated** tuple(3) `int, string, int` | **4,752 over 2 sections** | Maps an object to what the player learns about it. The densest section in the data — 2,376 rows each | guessed |
| `[InfocardMapTable]` ×1 | `Map` | **repeated** tuple(2) `number` | 174 | Redirects one infocard id to another | inferred |
| `[RolloverTable]` ×1 | `map` | **repeated** tuple(2) | 298 | Tooltip text per element. No wiki page | guessed |

### `INTERFACE/hud.ini` — `[HUD]`, `[Receiver]`, `[Maneuvers]`, `[Steer]`, and the eight empty sections

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[HUD]` | `shapes` | scalar `string` | 1 | **Path** to the shape library the HUD draws from | inferred |
| `[Receiver]` | `shut` / `open` / `win_pos` / `speaker_rotate` / `male_speaker_offset` / `female_speaker_offset` | tuple(3) `number` | 1 each | The comm window's geometry, open and closed | guessed |
| | `win_size` / `btn_pos` | tuple(2) `number` | 1 each | | guessed |
| | `action`, `backdrop`, `object` | scalar `string` | 1 each | | guessed |
| | `delay`, `fly_time`, `static`, `video_fovx`, `tool_tip_id` | scalar `number` | 1 each | | guessed |
| `[Maneuvers]` | `maneuver` | **repeated** list | 4 | A manoeuvre, two numbers, and **two paths** to its active and inactive icons | guessed |
| `[Steer]` | `radius`, `range`, `size` | scalar `number` | 1 each | The steering reticle | guessed |
| | `color` | tuple(4) `number` | 1 | RGBA | inferred |
| `[Waypoint]`, `[Status]`, `[Target]`, `[Core]`, `[ContactList]`, `[Targetable_Objects]`, `[DamageIndicator]`, `[CruiseProgress]` | — | — | 1 each | **No properties.** Present as markers | unread |

### `INTERFACE/optlist.ini` — `[interface]` ×1, `[Audio]` ×1, `[video]` ×1 — no wiki pages

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `option` | **repeated** list | 13 / 5 / 19 rows — arity 1, 5 and 7 | One settings-screen control. The arity says which kind — 7 for a slider, 5 for a list, 1 for a separator, on the shape alone | guessed |

Note `[interface]` and `[video]` are lowercase and `[Audio]` is not, in the same file.

### `INTERFACE/BASESIDE/navbar.ini` — `[BaseFrame]`, `[NavBar]`, and the twelve numbered controls — no wiki pages

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[BaseFrame]` | `behavior` / `mesh` | **flag** | 1 each | **Zero-value here and valued on `[RoomControl*]`** — the same name in both forms, one file apart | unread |
| | `offset` / `mouse_size` / `mouse_offset` | tuple(3) `number` | 1 each | | guessed |
| | `subcontrol` | **repeated** `string` | 12 | Names the twelve `[RoomControl*]` / `[ButtonControl*]` sections. **This is what makes them a family rather than twelve singletons** | guessed |
| | `no_z_enable`, `z_order`, `tooltip` | scalar | 1 each | | guessed |
| `[NavBar]` | 26 properties named for rooms and `IDS_*` symbols | scalar | 1 each | The property *name* is a room or a string id and the value is its button. No schema to write | unread |
| `[RoomControl1..7]`, `[ButtonControl1..5]` | `class_name`, `mesh`, `offset`, `hardpoint`, `mouse_size`, `action_button`, `no_color_change`, `no_z_enable`, `tooltip`, `event`, `button_sound` | | 1 each, ×12 | Identical eleven-property shape in all twelve. `hardpoint` and `event` are **zero-value flags** | guessed |

### `[Montage]` ×4, `[Images]` ×1

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Montage]` | `size` / `num_pages` | scalar `number` | 4 each | Cell size and page count of the atlas | guessed |
| | 53 properties named for `.3db` paths | tuple(2) `number` | 1 each | **The name is the source file and the value is its cell.** Read as pairs, not as fields | guessed |
| | 20 properties named for HUD elements — `CurrentTargetArrow`, `LootArrow`, `PlayerTalking`, … | scalar | 1 each | The same pattern in the second montage file | guessed |
| | `texture` | scalar `string` | 2 | | guessed |
| `[Images]` | `TgaPath`, `ScreenType`, `ScreenExit`, `ScreenReset` | scalar `string` | 1 each | **Paths**, in `INTERFACE/intro.ini` — the launcher screens | inferred |
| | `bDrawScripts` | scalar `boolean` | 1 | The one Hungarian-notation name in the data | inferred |

---

## `./characters`

**12 sections, 32 pairs, wiki reaches 27 (84%).** The smallest module after `./constants`, and it
pairs directly with [DEFORMABLE.md](DEFORMABLE.md): every `mesh` here is a **path to a `.dfm`** and
every `anim` a **path to an `.anm`**.

### `CHARACTERS/bodyparts.ini`

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Accessory]` ×106 | `nickname` | scalar `string` | 106 | Identity | inferred |
| | `mesh` | scalar `string` | 106 | **Path** to the `.dfm` | inferred |
| | `hardpoint` | scalar `string` | 106 | Hardpoint on the accessory. `hp_hat` ×76, `hp_eyewear` ×30 | inferred |
| | `body_hardpoint` | scalar `string` | 106 | The matching hardpoint on the head. Same two values, which is how a hat knows where to sit | inferred |
| `[Head]` ×104, `[Body]` ×88, `[RightHand]` ×6, `[LeftHand]` ×6 | `nickname` | scalar `string` | | Identity | inferred |
| | `mesh` | scalar `string` | | **Path** to the `.dfm` | inferred |
| `[Skeleton]` ×7 | `sex` | scalar `string` | 7 | `male` \| `female` \| `none`. **Positional** — it applies to the parts that follow it in the file, which makes this a fifth run-owning structure | guessed |
| `[Animations]` ×1 | `anim` | **repeated** `string` | 11 | **Paths** to the eleven `.anm` files that drive every character in the game | inferred |
| `[PetalAnimations]` ×7 | `anim` | **repeated** `string` | 17 over 7 sections | The same, for the base-side prop animations | inferred |
| `[DetailSwitchTable]` ×7 | `switch` | **repeated** tuple(2) `number` | 42 over 7 sections | A distance and the detail level above it. Six rows each | guessed |

The wiki documents `[Head]`, `[Body]`, `[RightHand]` and `[LeftHand]` under one fence header,
`[Body|Head|RightHand|LeftHand]`, which is why an extractor must split on `|`. It also lists a
property called `nickname - string`, which is a transcription slip, not a field.

### `CHARACTERS/costumes.ini`

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 154 | Identity | inferred |
| `body` | scalar `string` | 154 | → `[Body]` | inferred |
| `head` | **repeated** `string` | 149 over 148 sections | → `[Head]`. One costume carries it twice | inferred |
| `righthand` / `lefthand` | scalar `string` | 153 each | → `[RightHand]` / `[LeftHand]` | inferred |

### `CHARACTERS/newcharacter.ini` — `[Pilot]`, `[Package]`, `[Faction]`

The new-character record. `[Pilot]` here is **the second shape of a section name `./ai` owns** — see
[the split table](#one-section-two-shapes-split-by-file).

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Pilot]` | `nickname` | scalar `string` | 1 | Identity | inferred |
| | `body` | scalar `string` | 1 | → `[Costume]`. A male costume, because the skeletons differ | inferred |
| | `body.anim` | scalar `string` | 1 | An animation set. **A property name containing a dot** | inferred |
| | `comm` / `comm.anim` | scalar `string` / tuple(2) `string` | 1 each | The comm-window costume and its animation | inferred |
| | `voice` | scalar `string` | 1 | → `[Voice]` | inferred |
| | `thumb` | scalar `string` | 1 | **Path** to the portrait | inferred |
| `[Package]` | `nickname` | scalar `string` | 1 | Identity | inferred |
| | `ship` | scalar `string` | 1 | → `[Ship]` | inferred |
| | `loadout` | scalar `string` | 1 | → `[Loadout]`, which must fit that ship's hardpoints | inferred |
| | `money` | scalar `number` | 1 | Starting credits | inferred |
| | `strid_name` / `strid_desc` | scalar `number` | 1 each | | inferred |
| `[Faction]` | `nickname` | scalar `string` | 1 | Identity | inferred |
| | `rep_group` | scalar `string` | 1 | → `[Group]`, whose standings the player starts with | inferred |
| | `base` | scalar `string` | 1 | → `[Base]` the player starts at | inferred |
| | `Package` / `Pilot` | scalar `string` | 1 each | → the two sections above, by nickname | inferred |

---

## `./constants`

**5 sections, 21 pairs, wiki reaches 21 — the only module the wiki covers completely.** Every value
in `constants.ini` is documented with its retail default, which is more than the sweep can say.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[PhySysConsts]` ×1 | `MATERIAL_FRICTION` | scalar `number` | 1 | `0.1` | inferred |
| | `MATERIAL_ELASTICITY` | scalar `number` | 1 | `0.9` | inferred |
| | `DEFAULT_LINEAR_DAMPING` | scalar `number` | 1 | `0.5` | inferred |
| | `DEFAULT_ANGULAR_DAMPING` | tuple(3) `number` | 1 | `0.2` per axis | inferred |
| `[CommConsts]` ×1 | `COMM_PLAYER_FAR_DIST` / `_ATTEN` | scalar `number` | 1 each | Range at which a player counts as far for comms, and the trim applied | inferred |
| | `CHATTER_MAX_DIST` / `_ATTEN` / `CHATTER_START_ATTEN` | scalar `number` | 1 each | NPC chatter audibility | inferred |
| | `WALLA_MAX_DIST` / `_ATTEN` / `WALLA_START_ATTEN` / `WALLA_PRIORITY_CUTOFF` | scalar `number` | 1 each | Background crowd noise. "Walla" is the film-sound term | inferred |
| | `COMM_CONFLICT_PRIORITY_CUTOFF` | scalar `number` | 1 | `-3` | inferred |
| `[AsteroidConsts]` ×1 | `MAX_ASTEROID_LOOT_DAMAGE` | scalar `number` | 1 | `20000` | inferred |
| | `MAX_LOOT_PER_ASTEROID` | scalar `number` | 1 | `3` | inferred |
| `[ConcaveObject]` ×23 | `filename` | scalar `string` | 23 | **Path** to the `.cmp` or `.3db` treated as concave for collision | inferred |
| | `part` | **repeated** `string` | 25 over 11 sections | Which sub-parts are concave. Absent on 12 — the whole model, then | inferred |
| `[ObjectTable]` ×1 | `room` / `prop` / `cart` | **repeated** tuple(2/3) `string, string` | 121 / **392** / 18 | `petaldb.ini`: a nickname and a **path** to the prop model. One row carries a third value | inferred |

The wiki documents **28 `[PhySysConsts]` properties retail does not carry** — the `golem_*` ragdoll
constants, the `rmgr_look_ahead_*` family, `physical_sim_rate` and more. They are real engine
constants the retail file leaves at their compiled defaults, so a reader must accept them.

---

## `./randommissions`

**10 sections, 44 pairs, wiki reaches 0 — the wiki has seven pages for `RANDOMMISSIONS` and all
seven are empty stubs.** Everything below is read from the sweep and from the file it lives in.

`[DataNode]` and `[DecisionNode]` form the vignette generator's decision tree, joined by `node_id` /
`child_node`, which makes this a graph over a node table rather than a set of records.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[DataNode]` ×140 | `node_id` | scalar `number` | 140 | Identity, numeric | inferred |
| | `child_node` | scalar `number` | 131 | → the next node | inferred |
| | `offer_text` | **repeated** list | **181 over 61 sections, arity 2 to 17** | The mission offer, assembled from ids and literals. The widest arity spread in the module | unread |
| | `objective_text` | **repeated** list | 33 over 12 sections, arity 2 to 4 | The objective line, same shape | unread |
| | `comm_sequence` | **repeated** list | 38 over 24 sections — 7 ×36, 9 ×2 | Voice line, costume and timing for the offer dialogue | unread |
| | `Offer_group` | list `string` | 66 — 1 ×6, 11 ×20, 19 ×20, 22 ×20 | Factions that may offer it. `all` on the six one-value rows | guessed |
| | `Hostile_group` | scalar `string` | 6 | `all` on all 6 | guessed |
| | `Allowable_zone_types` | tuple(2) `string` | 3 | | guessed |
| | `Difficulty` | tuple(2) `number` | 6 | Min and max | guessed |
| | `Weight` | scalar `number` | 6 | Selection weight | guessed |
| | `Implemented` | scalar `boolean` | 4 | `false` on all 4 — four nodes switched off in the shipped game | inferred |
| | `Failure_text` / `Reward_text` | tuple(2) | 1 each | | unread |
| `[DecisionNode]` ×79 | `node_id` | scalar `number` | 79 | Identity | inferred |
| | `nickname` | scalar `string` | 79 | Identity again, by name | inferred |
| | `child_node` | **repeated** `number` | 158 over 79 sections | **Exactly two children each** — the tree is binary | inferred |
| `[DocumentationNode]` ×20 | `node_id`, `child_node` | scalar `number` | 20 each | | inferred |
| | `documentation` | scalar `string` | 20 | A comment node in the tree | inferred |
| `[KillableSolar]` ×126 | `nickname` | scalar `string` | 126 | Identity | inferred |
| | `solar_type` | scalar `string` | 126 | `Big_Solar` ×70 \| `Defensive_Solar` ×56 | inferred |
| | `archetype` | scalar `string` | 126 | → `[Solar]` | inferred |
| | `loadout` | scalar `string` | 126 | → `[Loadout]` | inferred |
| | `faction` | list `string` | 126 — 1, 2, 3, 17 and 23 values | Factions it can belong to | inferred |
| | `hitpoints` | tuple(2) `number` | 126 | Min and max | guessed |
| | `difficulty` | tuple(2) `number` | 126 | Min and max | guessed |
| | `pilot_choices` | scalar `number` | 126 | How many pilot types may crew it | guessed |
| | `string_id` | scalar `number` | 126 | Small integers `0`–`11`, not a resource id | unread |
| | `only_allowed_in_zone_type` | tuple(1/2/3) `string` | 32 | | guessed |
| `[RMBonusLoot]` ×143 | `archetype` | scalar `string` | 143 | → an equipment archetype | inferred |
| | `num_to_drop` | tuple(1/2) `number` | 143 — 1 ×103, 2 ×40 | A count, or a min and max | inferred |
| | `faction` | list `string` | 143 — **1 to 25 values** | Who drops it | inferred |
| | `difficulty_range` | tuple(2) `number` | 143 | | inferred |
| | `weight` | scalar `number` | 143 | | inferred |
| `[SolarFormation]` ×11 | `nickname` | scalar `string` | 11 | Identity | inferred |
| | `type` | scalar `string` | 11 | `Big_Solar_Formation` \| `Defensive_Outpost_Formation` | inferred |
| | `pos` | **repeated** list, arity 9 | 71 over 11 sections | One solar's placement within the formation | unread |
| `[Critical_Loot]` ×62 | `faction`, `archetype`, `type`, `name` | | 62 each | `type` is `destroy` ×31 \| `tractor` ×30 \| `return` ×1 | guessed |
| `[Global]` ×1 | `BonusLootDropChance` | scalar `number` | 1 | | inferred |
| `[Diff2Money]` ×1 | `Diff2Money` | **repeated** tuple(2) | 23 | Difficulty → payout curve. **Property named for its section** | inferred |
| `[RankAndFormationSizeToDifficulty]` ×1 | `NpcRank` | **repeated** list | 25 — arity 2 to 9 | A rank and the difficulty per formation size. The row is as wide as the formation | guessed |

---

## `./missions`

**36 sections, 340 pairs, wiki reaches 290 (85%).** Built last, because it references nearly
everything else: `[Trigger]` alone names ships, solars, bases, systems, effects, sounds, fuses,
scenes and RTC files.

**`[Trigger]` is a second grammar, not a record.** Its 123 properties are all of the form
`Cnd_Something` or `Act_Something`, and **the value list encodes a command's arguments** — arity,
type and meaning all vary per command. There is no schema for `[Trigger]` in the sense the rest of
this document uses. The reading taken: **read them as named value lists, one entry per occurrence,
and decode the commands separately.** Anything else invents structure the data does not have.

### `[Trigger]` — 2,984, in the story mission files

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 2,984 | Identity | inferred |
| `system` | **repeated** `string` | 1,646 — **arity 0 ×2** | Which system the trigger is armed in. Two carry it with no value | inferred |
| `InitState` | scalar `string` | 16 | Whether the trigger starts active | guessed |
| `repeatable` | scalar `boolean` | 35 | Whether it fires more than once | inferred |
| `system St02` | **flag** | 1 | A property name with a space and a value baked in. Residue | unread |
| **`Cnd_*`** — 44 distinct | list | The condition. `Cnd_CommComplete` ×611, `Cnd_True` ×569, `Cnd_Timer` ×401, `Cnd_Destroyed` ×310, `Cnd_DistShip` ×209, `Cnd_DistVec` ×159, then a long tail | Every arity from 1 to 10 occurs, and it depends on the command | unread |
| **`Act_*`** — 77 distinct | **repeated** list | The actions. `Act_ActTrig` ×3,246, `Act_GiveObjList` ×1,017, `Act_DeactTrig` ×1,109, `Act_SetVibeLblToShip` ×686, `Act_SetVibe` ×577, `Act_SetNNObj` ×565, `Act_SendComm` ×512 | Repeated — one trigger fires many actions, in order | unread |

Three `Act_*` are **cross-file references** and are worth naming even though the rest are unread:

| Property | Retail | Points at | Status |
| --- | --- | --- | --- |
| `Act_AddRTC` / `Act_RemoveRTC` | 68 / 31 | **Path** to an RTC `.ini`, which in turn names a `.thn` | inferred |
| `Act_CallThorn` | 70 — 1 ×7, 2 ×63 | **Path** to a `.thn` scene, optionally with a target | inferred |
| `Act_LightFuse` | 138 over 89 sections | A ship and a `[fuse]` name — the mission-side edge into `./fx` | inferred |

Wiki-only: nine `cnd_`/`act_` commands retail never uses — `cnd_jumpgateact`, `cnd_rumorheard`,
`act_relocateform`, `act_spawnshiprel`, `act_setflee`, `act_repchangerequest`, `act_pilotparams`,
`act_playnn`, `act_playerform`. Real commands the shipped missions do not exercise.

### `[ObjList]` — 672

The same situation one level down: an order list for a mission ship, where each property is a command.

| Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- |
| `nickname` | scalar `string` | 672 | Identity, named by `Act_GiveObjList` | inferred |
| `system` | scalar `string` | 247 | | inferred |
| `GotoVec` | **repeated** list | 293 over 192 sections — arity 6, 7, 10, 11 | Fly to a point | unread |
| `GotoShip` | **repeated** list | 197 over 195 sections — 4 ×100, 5 ×97 | Fly to a ship | unread |
| `GotoSpline` | **repeated** list | 34 over 8 sections — **arity 15 and 16** | Fly a curve. The widest tuple in the data | unread |
| `StayInRange` / `StayOutofRange` | list | 150 / 16 | | unread |
| `Follow` / `FollowPlayer` | list | 89 / 16 | | unread |
| `MakeNewFormation` | list | 86 — arity 1 to 7 | | unread |
| `BreakFormation` | scalar | 156 — **arity 0 ×6** | Six carry no value | unread |
| `Dock` | **repeated** list | 55 over 51 sections | | unread |
| `SetPriority`, `SetLifetime`, `Delay`, `Idle`, `Avoidance` | | 108, 35, 88, 14, 70 | | unread |

### `MISSIONS/mbases.ini` — `[MBase]` ×194, `[MVendor]` ×194, `[BaseFaction]` ×609, `[MRoom]` ×412, `[GF_NPC]` ×1,642

Who is on a base, what they say, and what they offer. One `[MBase]` opens a run and the rest belong
to it — a **sixth run-owning structure**, and the largest.

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[MBase]` | `nickname` | scalar `string` | 194 | → `[Base]` | inferred |
| | `local_faction` | scalar `string` | 194 | → `[Group]` | inferred |
| | `diff` | scalar `number` | 194 | Mission difficulty offered here | guessed |
| | `msg_id_prefix` | scalar `string` | 177 | Voice prefix | guessed |
| `[MVendor]` | `num_offers` | tuple(2) `number` | 194 | Min and max missions on the board | inferred |
| `[BaseFaction]` | `faction` | scalar `string` | 609 | → `[Group]` | inferred |
| | `weight` | scalar `number` | 609 | Share of the base's population | inferred |
| | `offers_missions` | **flag** | 241 | Zero-value throughout | inferred |
| | `mission_type` | tuple(4) | 241 | Mission class, and three numbers bounding it | guessed |
| | `npc` | **repeated** `string` | 1,081 over 578 sections | → `[GF_NPC]` | inferred |
| `[MRoom]` | `nickname` | scalar `string` | 412 | → `[Room]` | inferred |
| | `character_density` | scalar `number` | 406 | How many extras stand around | inferred |
| | `fixture` | **repeated** tuple(4) `string, string, string, string` | 559 over 390 sections | An NPC, **two paths** to marker and animation scripts, and a role — how a named character is placed in a room | guessed |
| `[GF_NPC]` | `nickname` | scalar `string` | 1,642 | Identity | inferred |
| | `body` / `head` / `lefthand` / `righthand` | scalar `string` | 1,573 each | → `[Body]`, `[Head]`, `[LeftHand]`, `[RightHand]` | inferred |
| | `accessory` | scalar `string` | 232 | → `[Accessory]` | inferred |
| | `individual_name` | scalar `number` | 1,642 | A resource id, not text | inferred |
| | `affiliation` | scalar `string` | 1,642 | → `[Group]` | inferred |
| | `voice` | scalar `string` | 1,642 | → `[Voice]` | inferred |
| | `room` | scalar `string` | 1,083 | → `[MRoom]` | inferred |
| | `base_appr` | scalar `string` | 69 | Which stance script they stand in | guessed |
| | `rumor` | **repeated** tuple(4) | **7,803 over 1,154 sections** | A rumour and the conditions under which it is told. Fourth-most repeated property in the data | guessed |
| | `rumor_type2` | **repeated** tuple(4) | 7,324 over 774 sections | A second rumour channel, same shape | guessed |
| | `bribe` | **repeated** tuple(3) | 2,386 over 610 sections | Faction, price and reputation gain | guessed |
| | `know` | **repeated** tuple(4) `number` | 538 over 346 sections | What they can be asked about | guessed |
| | `knowdb` | **repeated** tuple(1/3) | 538 over 346 sections | The same, by name | guessed |
| | `rumorknowdb` | **repeated** list | 564 over 267 sections, arity 1 to 6 | | unread |
| | `misn` | tuple(3) | 643 | | unread |

### The mission-file object tables

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[MsnShip]` ×1,010 | `nickname` | scalar `string` | 1,010 | Identity | inferred |
| | `NPC` | scalar `string` | 1,010 | → `[NPC]` | inferred |
| | `label` | **repeated** `string` | 1,994 over 996 sections | Tags a trigger can address the ship by. **This is how `Act_SetVibeLbl` finds its target** | inferred |
| | `position` / `rel_pos` | tuple(3) `number` | 227 / 37 | Absolute, or relative to another object | inferred |
| | `orientation` | tuple(4) `number` | 109 | A quaternion | inferred |
| | `radius` | scalar `number` | 370 | Scatter radius around the position | guessed |
| | `random_name` | scalar `boolean` | 574 | Generate a name from the faction's tables | inferred |
| | `jumper` | scalar `boolean` | 106 | Arrives by jump | guessed |
| | `init_objectives` | scalar `string` | 33 | → `[ObjList]` | inferred |
| | `cargo` | **repeated** tuple(2) | 17 over 9 sections | | inferred |
| | `arrival_obj` | tuple(1/2) `string` | 29 | | guessed |
| | `system` | scalar `string` | 12 | | inferred |
| `[MsnSolar]` ×116 | `nickname`, `system`, `faction`, `archetype`, `loadout`, `position`, `orientation`, `label`, `radius`, `base`, `voice`, `pilot`, `costume`, `string_id`, `visit` | | | The same idea for a placed solar, and it reuses `[Object]`'s vocabulary | inferred |
| `[MsnFormation]` ×188 | `nickname`, `formation`, `position`, `orientation`, `rel_pos`, `label` | | | | inferred |
| | `ship` | **repeated** `string` | 748 over 188 sections | → `[MsnShip]`, in formation order | inferred |
| `[MsnLoot]` ×4 | `nickname`, `archetype`, `string_id`, `position`, `velocity`, `equip_amount`, `health`, `can_jettison`, `rel_pos_obj`, `rel_pos_offset` | | 4 each | | inferred |
| `[MsnRandEnc]` ×7 | `nickname`, `encounter_type`, `attacker_rep_name`, `target_ship_name`, `activation_type`, `formation`, `num_forms`, `label` | | 7 each | | guessed |
| `[Mission]` ×14 | `npc_ship_file` | scalar `string` | 14 | **Path** to the mission's own ship table | inferred |
| | `mission_title` / `mission_offer` / `reward` | scalar `number` | 4 / 4 / 1 | | inferred |
| `[NNObjective]` ×395 | `nickname` | scalar `string` | 395 | Identity | inferred |
| | `state` | scalar `string` | 395 | | guessed |
| | `type` | list | 395 — arity 2, 3, 7, 8 | The objective's kind and its arguments. A third small command grammar | unread |
| `[Dialog]` ×231 | `nickname` / `system` | scalar `string` | 231 each | Identity | inferred |
| | `line` | **repeated** list | 733 over 231 sections — 3 ×618, 5 ×112 | Speaker, listener, and a `[Sound]`, sometimes with timing | guessed |
| `[Char]` ×84, `[CharacterEncounter]` ×68, `[Reserve]` ×22 | | | | The base-side story scenes. **No wiki pages.** `[CharacterEncounter]` carries the offer/accept/decline/reject dialogue ids | guessed |

### The faction and NPC tables

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[NPCShipArch]` ×660 | `nickname`, `loadout`, `ship_archetype`, `pilot`, `state_graph`, `level` | scalar `string` | 660 each | An NPC ship type: hull, loadout, `[Pilot]`, and a behaviour graph in `AI/state_graph.db` | inferred |
| | `npc_class` | list `string` | 659 — **arity 1 to 21** | Tags encounters select on. The widest list in the data | inferred |
| `[NPC]` ×443 | `nickname`, `individual_name`, `affiliation`, `voice`, `npc_ship_arch`, `base_appr` | | | A named character | inferred |
| | `space_costume` | tuple(2/3) `string` | 270 — 3 ×239 | Head, body, accessory | inferred |
| `[FactionProps]` ×55 | `affiliation` | scalar `string` | 55 | → `[Group]`. Positional identity | inferred |
| | `legality` | scalar `string` | 55 | Lawful or not | inferred |
| | `npc_ship` | **repeated** `string` | 695 over 47 sections | → `[NPCShipArch]` the faction flies | inferred |
| | `voice` | **repeated** `string` | 126 over 54 sections | → `[Voice]` | inferred |
| | `space_costume` | **repeated** list | 445 over 54 sections | The faction's pilots' appearances | inferred |
| | `mc_costume` | scalar `string` | 55 | → `[Costume]` for the mission-computer face | inferred |
| | `firstname_male` / `firstname_female` / `lastname` | tuple(2) `number` | 54 / 23 / 55 | **A resource id range** — first and last id of the name pool the generator draws from | guessed |
| | `rank_desig` | list `number` | 55, arity 5 | Ids for the five rank titles | guessed |
| | `formation_desig` / `large_ship_desig` / `large_ship_names` | | 55 / 26 / 26 | | guessed |
| | `formation` | **repeated** tuple(2) `string` | 158 over 55 sections | → `[Formation]`, by role | inferred |
| | `scan_for_cargo` | **repeated** tuple(2) | 222 over 25 sections | Contraband this faction stops you for | inferred |
| | `scan_chance` / `scan_announce` | | 25 each | | inferred |
| | `msg_id_prefix`, `jump_preference`, `nickname_plurality` | scalar `string` | 55 each | | guessed |
| `[RepChangeEffects]` ×55 | `group` | scalar `string` | 55 | → `[Group]` | inferred |
| | `event` | **repeated** tuple(2) | 220 over 55 sections | An action and what it costs you with this faction | inferred |
| | `empathy_rate` | **repeated** tuple(2) | **2,970 over 55 sections** | How much a change here moves every other faction. 55 × 54 is the whole matrix | inferred |
| `[ShipClass]` ×78 | `nickname` | scalar `string` | 78 | Identity | inferred |
| | `member` | **repeated** `string` | 110 over 78 sections | → `[NPCShipArch]` | inferred |
| `[Formation]` ×93 | `nickname` | scalar `string` | 93 | Identity | inferred |
| | `pos` | **repeated** tuple(3/4) | 591 over 93 sections | One slot's offset. One row carries a fourth value | inferred |
| | `pl_pos` | tuple(3) `number` | 86 | The player's slot | inferred |

### Encounters and loot

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[EncounterFormation]` ×57 | `ship_by_class` | **repeated** tuple(3/4) | 128 over 56 sections | Count range and a `[ShipClass]` | inferred |
| | `ship_by_npc_arch` | **repeated** tuple(3) | 2 | The same by `[NPCShipArch]` | inferred |
| | `pilot_job` | **repeated** `string` | 128 over 56 sections | → `[JobBlock]`, paired with each `ship_by_class` row | inferred |
| | `formation_by_class` / `formation` | scalar `string` | 55 / 2 | → `[Formation]` | inferred |
| | `behavior` | scalar `string` | 57 | | guessed |
| | `arrival` | list `string` | 57 | How they enter — jump, cruise, or already present | guessed |
| | `make_class` | **repeated** `string` | 49 over 39 sections | **What `[Zone] density_restriction` caps** | inferred |
| | `times_to_create`, `allow_simultaneous_creation`, `zone_creation_distance`, `longevity`, `explicit_group`, `feeling_to_formation` | | | | guessed |
| `[Creation]` ×42 | `permutation` | **repeated** tuple(2/3) | 56 over 42 sections | | unread |
| `[mLootProps]` ×434 | `nickname` | scalar `string` | 434 | → an equipment archetype | inferred |
| | `drop_properties` | list, arity 6 | 434 | A chance and five counts. Every row the same width | guessed |
| `[PhantomLoot]` ×124 | `nickname`, `toughness_range`, `percent_chance`, `num_to_drop` | | 124 each | Loot from something with no cargo hold | inferred |
| `[NewsItem]` ×403 | `rank` | tuple(2) `string` | 403 | Rank range that sees it | guessed |
| | `base` | **repeated** `string` | **5,041 over 382 sections** | → `[Base]` where it runs. Third-most repeated property in the data | inferred |
| | `category` / `headline` / `text` | scalar `number` | 403 each | Resource ids | inferred |
| | `icon` / `logo` | scalar `string` | 403 each | | inferred |
| | `audio` / `autoselect` | **flag** | 231 / 28 | Zero-value | inferred |

### Singletons and script tables

| Section | Property | Kind | Retail | Reading | Status |
| --- | --- | --- | --- | --- | --- |
| `[Constants]` ×2 | `COLLISION_DAMAGE_FACTOR`, `MUSIC_CROSS_FADE_DELAY`, `MUZZLE_CONE_ANGLE`, `PLAYER_COLLISION_GROUP_HIT_PTS_SCALE`, `PLAYER_ATTACHED_EQUIP_HIT_PTS_SCALE` | scalar `number` | 1 each | In `constants.ini`, and the section name repeats in `MISSIONS/M04/m04.ini` | inferred |
| `[PlayerToughnessScale]` ×1 | `ptough_graph_pt` | **repeated** tuple(2) | 39 | Net worth → toughness curve | inferred |
| `[RankDiffDB]` ×1 | `rank_diff` | **repeated** tuple(2) | 9 | Rank → difficulty | inferred |
| `[mShipProps]` ×28 | `archetype_id` / `prop` | scalar | 28 each | No wiki page | unread |
| `[RTCSlider]` ×1 | `set` / `set_less` | **repeated** tuple(2) | 38 / 4 | `SCRIPTS/rtcslider.ini`. No wiki page | unread |
| `[GenericScripts]` ×1 | `script` | **repeated** `string` | **617** | Base-side idle animations | guessed |
| | `set_segment` / `set_gender` / `set_posture` | **repeated** `string` | 65 / 115 / 228 | Selectors the `script` rows below them apply to — positional within the section | guessed |
| `[GCS_Exclusions]` ×1 | `voice` / `script` | **repeated** `string` | 13 / 126 | Which generic scripts a voice must not use | guessed |

Wiki-only on `[Constants]`: `max_player_ammo`, `fire_failed_delay`, `fire_failed_sound`,
`snd_cargo_jettisoned`, `jettisoned_cargo_velocity`, `loot_unseen_radius`, `loot_unseen_life_time`,
`loot_owner_safe_time` — eight engine constants left at their compiled defaults.

---

## TODO

Questions this document raises that only observation in the running game can close. Indexed by
[RETAIL.md](RETAIL.md#todo--what-is-pending-in-the-game) with the rest.

| Question | Reading taken | Experiment |
| --- | --- | --- |
| Whether `[Group]`, `[Pilot]` and `[Sound]`'s two shapes are one section the game disambiguates by file, or two sections sharing a name | **Two sections.** `[Group]` and `[Pilot]` share no property but `nickname`, which a leniently-read single shape cannot explain | Move a `keylist.ini` `[Group]` into `initialworld.ini` and see whether either loads |
| What `[BaseGood] MarketGood`'s eight positions mean, and what the optional eighth does | Keep as read; decode nothing. 12,865 rows carry seven and 1,829 carry eight | Add an eighth value to a seven-value row and watch the market |
| Whether `[LOD]`, `[Layer]`, `[CollisionGroup]`, `[Skeleton]` and `MISSIONS/mbases.ini`'s runs are owned by position the way `[fuse]`'s are | **Owned by position**, on file layout alone | Move a `[LOD]` above its `[Gun]` and see which weapon it applies to |
| Whether `[Zone] toughness` and `sort` are read at all, as the wiki says they are not | Report both; substitute neither | Change `toughness` on a zone with no `encounter` difficulty and watch what spawns |
| Whether a `[Trigger]`'s `Act_*` order is the firing order | Preserve the order; assume nothing | Give one trigger two ordered actions with observable effects |
| Whether `[Zone] faction` binds to the `encounter` preceding it at all | **It binds.** 4,297 of 5,425 encounters are followed by exactly one `faction`. But `UNIVERSE/SYSTEMS/INTRO/intro.ini` writes 497 factions before any encounter in 300 zones and the game loads it, so a leading member is kept rather than refused | Give one zone two encounters with disjoint faction weights and observe who spawns for each |

---

[MODULES.md](MODULES.md) · [SCHEMA.md](SCHEMA.md) · [RETAIL.md](RETAIL.md) · [INI.md](INI.md) · [FX.md](FX.md)
