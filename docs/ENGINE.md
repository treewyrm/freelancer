# ENGINE — the vocabularies the executables hardcode

[INI.md](INI.md) describes both encodings and the document they share, and stops there deliberately:
to this library `[Solar]` is a section name and `type` is a property name. **This document records
what the engine does with them** — not because the library will start modelling it, but because the
meaning is measurable and losing it would be a waste.

It is the same case [RDL.md](RDL.md) and [AUDIO.md](AUDIO.md) make. **There is no module here and
there will not be one.** A consumer deciding what a `[Ship]`'s `type` means is exactly the policy
[CLAUDE.md](../CLAUDE.md)'s scope rule assigns to the consumer; this is the reference it can be
written against.

## Where these live, and why they are readable

Freelancer resolves an INI keyword to a number in one of two ways, and only one of them leaves a
table:

- **`EXE/common.dll` uses `{ const char *name; int value }` tables.** Contiguous, 8 bytes an entry,
  in `.data`. Every enum below comes from one, read directly.
- **`DLLS/BIN/content.dll` uses `strcmp` chains.** No table survives compilation, so the vocabulary
  is recoverable — MSVC emits a function's string literals in reverse order of first use, so a run of
  value names sits immediately before the key that consumes them — but the **values are not**.

That asymmetry is the reason this document is lopsided: `common.dll`'s enums are given with numbers,
`content.dll`'s with names only. **A name list from `content.dll` is not evidence of a value**, and
none is guessed below.

File offsets are also RVAs in both DLLs — sections are laid out one-to-one. Image bases are
`0x06260000` for `common.dll` and `0x06f90000` for `content.dll`.

### The measurement corpus

Counts below are over **all 1,252 retail INI files under `DATA`**, read through this library's own
reader — the 1,251 BINI and `initialworld.ini` together, which is a wider sweep than
[RETAIL.md](RETAIL.md#what-is-in-it)'s 70,250-section figure, that one being BINI only. Where a count
is absent it is because nothing measures it, not because it was omitted.

## Object types

**`common.dll` `.data:18b810`, 29 entries.**

One bitfield shared by `[Solar] type`, `[Ship] type` and the targeting and nav-map filters. The
warning string beside it names the field — `*** WARNING: unknown OBJECT_TYPE = '%s'`, from
`E:\FL\Scratch\Source\Common\Archetype.cpp`.

| Bit         | Name                | Bit          | Name        |
| ----------- | ------------------- | ------------ | ----------- |
| —           | `NONE` = 0          | `0x10000`    | `FIGHTER`   |
| `0x1`       | `MOON`              | `0x20000`    | `FREIGHTER` |
| `0x2`       | `PLANET`            | `0x40000`    | `GUNBOAT`   |
| `0x4`       | `SUN`               | `0x80000`    | `CRUISER`   |
| `0x8`       | `BLACKHOLE`         | `0x100000`   | `TRANSPORT` |
| `0x10`      | `SATELLITE`         | `0x200000`   | `CAPITAL`   |
| `0x20`      | `DOCKING_RING`      | `0x400000`   | `MINING`    |
| `0x40`      | `JUMP_GATE`         | `0x1000000`  | `GUIDED`    |
| `0x80`      | `TRADELANE_RING`    | `0x2000000`  | `BULLET`    |
| `0x100`     | `STATION`           | `0x4000000`  | `MINE`      |
| `0x200`     | `WAYPOINT`          | `0x10000000` | `LOOT`      |
| `0x400`     | `AIRLOCK_GATE`      | `0x20000000` | `ASTEROID`  |
| `0x800`     | `JUMP_HOLE`         |              |             |
| `0x1000`    | `WEAPONS_PLATFORM`  |              |             |
| `0x2000`    | `DESTROYABLE_DEPOT` |              |             |
| `0x4000`    | `NON_TARGETABLE`    |              |             |
| `0x8000`    | `MISSION_SATELLITE` |              |             |

**`0x800000` and `0x8000000` are unclaimed.** Twenty-eight bits are named out of a possible thirty.

**Table order is declaration order, not value order** — `ASTEROID` is the fifth entry and holds bit
29. Nothing here may be derived from position, which is the same trap [THORN.md](THORN.md) documents
for the event enum.

Retail uses a strict subset. `[Solar] type` is set 321 times over 14 distinct spellings —
`NON_TARGETABLE` ×75, `MISSION_SATELLITE` ×59, `PLANET` ×55, `STATION` ×45, `SATELLITE` ×37,
`DESTROYABLE_DEPOT` ×26, `WEAPONS_PLATFORM` ×9, `JUMP_HOLE` ×5, then `SUN`, `DOCKING_RING`,
`JUMP_GATE`, `AIRLOCK_GATE` ×2 each and `TRADELANE_RING` ×1. **The fourteenth is `waypoint`,
lowercase, once** — which is how we know the comparison folds case, since the table has only
`WAYPOINT`. `[Ship] type` is set 115 times over 7: `FIGHTER` ×81, `FREIGHTER` ×9, `CAPITAL` ×8,
`TRANSPORT` ×8, `CRUISER` ×4, `GUNBOAT` ×4, **`MINING` ×1**.

`MOON`, `BLACKHOLE`, `ASTEROID`, `GUIDED`, `BULLET`, `MINE` and `LOOT` are named and never set by any
retail archetype — they classify objects the engine creates rather than ones the data declares.

## The three tables next to it

`0x18b810`–`0x18bc38` is one uninterrupted run of 133 entries. Five separate enums, adjacent by link
order rather than by meaning, and **numerically overlapping** — `weapon` and `TRADELANE_RING` are both
`0x80`. They are different fields; nothing may be resolved across them.

**Equipment class** (`0x18b8f8`, 14 flags): `light` `0x1`, `attached_fx` `0x2`, `weapon` `0x80`,
`shield` `0x100`, `thruster` `0x400`, `cloaking_device` `0x1000`, `engine` `0x20000`, `power`
`0x40000`, `scanner` `0x80000`, `tractor` `0x100000`, `repairdroid` `0x200000`, `internal_fx`
`0x400000`, `tradelane` `0x800000`, `armor` `0x1000000`.

**`[CollisionGroup] type`** (`0x18b968`, 19 flags, bits 1 through 19): `Fin` `0x2`, `Top_Fin` `0x4`,
`Port_Fin` `0x8`, `Starboard_Fin` `0x10`, `Port_Wing` `0x20`, `Starboard_Wing` `0x40`, `Middle_Wing`
`0x80`, `Engine` `0x100`, `Port_Engine` `0x200`, `Middle_Engine` `0x400`, `Starboard_Engine` `0x800`,
`Top_Engine` `0x1000`, `Bottom_Engine` `0x2000`, `Spoiler` `0x4000`, `Tail` `0x8000`,
`Port_Side_Panel` `0x10000`, `Starboard_Side_Panel` `0x20000`, `Port_Arm` `0x40000`, `Starboard_Arm`
`0x80000`. Set 100 times across 13 of the 19; the six engine names and `Engine` itself go unused.

**Dock hardpoint** (`0x18ba00`, an enum rather than flags): `berth` 1, `moor_small` 3, `moor_medium`
4, `moor_large` 5, `ring` 6, `pad` 6, `jump` 7, `airlock` 8. **`ring` and `pad` are the same value**,
and 0 and 2 are unnamed — so this is a genuine enum with a deliberate alias, not a mis-read table.

## Hardpoint types

**`common.dll` `.data:18ba40`, 63 entries — the `HpAttachmentType` enum.**

What `hp_type` and `hp_gun_type` name. Values 4 through 66; **0 through 3 are unnamed** and no string
reaches them.

| Value | Name                                                                                    |
| ----- | --------------------------------------------------------------------------------------- |
| 4     | `hp_gun`                                                                                |
| 5–8   | `hp_shield_generator`, `hp_fighter_…`, `hp_elite_…`, `hp_freighter_shield_generator`    |
| 9–14  | `hp_thruster`, `hp_torpedo`, `hp_mine_dropper`, `hp_countermeasure_dropper`, `hp_turret`, `hp_cargo_pod` |
| 15–24 | `hp_gun_special_1` … `_10`                                                              |
| 25–34 | `hp_turret_special_1` … `_10`                                                           |
| 35–36 | `hp_torpedo_special_2`, `hp_torpedo_special_1` — **inverted**                           |
| 37–46 | `hp_fighter_shield_special_1` … `_10`                                                   |
| 47–56 | `hp_elite_shield_special_1` … `_10`                                                     |
| 57–66 | `hp_freighter_shield_special_1` … `_10`                                                 |

`hp_torpedo_special_1` = 36 and `_2` = 35 is the one place the ordinal in the name disagrees with the
value. It is not a transcription slip — the string block, the table and the default-list array below
all agree, and retail sets `hp_torpedo_special_2` ×27 against `_1` ×16.

**The vocabulary is closed the same way THORN's is.** `hp_type`/`hp_gun_type`/`hp_shield_type` are set
1,350 times over **61 distinct names, every one of them in the table**, with nothing unregistered.
The two never used are `hp_shield_generator` and `hp_freighter_shield_generator` — both of which have
a `_special_` series that covers them.

### The default lists

Two `int[]` immediately after the table, read by the exported
`Archetype::Gun::get_hp_type_by_index` and `Archetype::ShieldGenerator::get_hp_type_by_index`:

| Offset     | Count | Contents                                                                     |
| ---------- | ----- | ---------------------------------------------------------------------------- |
| `0x18bc38` | 23    | `hp_gun`, the ten `hp_gun_special_*`, the ten `hp_turret_special_*`, both torpedoes |
| `0x18bc98` | 34    | the four generators, then all thirty `*_shield_special_*`                    |

Both getters check a per-archetype vector first and fall back to these only when it is empty, so
**this is the list an archetype gets when the INI declares no `hp_gun_type`** — not a constraint on
what it may declare.

**Both bounds checks are off by one.** Gun compares against `0x17` over 23 entries, so index 23 reads
the trailing `0`; ShieldGenerator compares against `0x22` over 34, so index 34 reads `0xFFFFFFFF`.
Neither is reachable through the data, since the count comes from the same arrays, but a consumer
reimplementing the lookup should not reproduce it.

## Zone shapes

**`common.dll` `.data:18cb80`.**

`sphere` 1, `ellipsoid` 2, `BOX` 3, `CYLINDER` 4, `RING` 5, `MESH` 6. Retail sets 5,761 of them —
`CYLINDER` ×3,307, `SPHERE` ×1,878, `ELLIPSOID` ×361, `BOX` ×215. **`RING` and `MESH` are never
used**, and the mixed casing in the table is another sign the compare folds case.

Beware the key: `shape` is set 6,270 times overall, and the balance belongs to other sections
entirely — asteroid and nebula exclusion shapes, lens-flare shapes — where the value is a model or
effect nickname, not one of these six.

## Two smaller tables

**Good category** (`0x1896c0`): `Commodity` 0, `Equipment` 1, `ShipHull` 2, `Ship` 3. Retail authors
them lowercase — `equipment` ×752, `commodity` ×40, `shiphull` ×32, `ship` ×31.

**Base-room hotspots** (`0x189bc8`): `ExitDoor` 1, `NewsVendor` 2, `MissionVendor` 3, `Launch` 4,
`StartDealer` 5, `FrontDesk` 6, `StartShipDealer` 7, `StartEquipDealer` 8, `MoveRight` 9, `MoveLeft`
10, `VirtualRoom` 11, `Repair` 12. Note **6 and 7 are out of table order** — `StartShipDealer`
precedes `FrontDesk` in memory.

## `content.dll` — names without values

Everything below is **names only**. `content.dll` compares with `strcmp`, so nothing here carries a
measured number and none is inferred.

### Pilot AI

`pilots_*.ini`'s sixteen blocks: `EvadeDodgeBlock`, `EvadeBreakBlock`, `BuzzHeadTowardBlock`,
`BuzzPassByBlock`, `TrailBlock`, `StrafeBlock`, `EngineKillBlock`, `RepairBlock`, `GunBlock`,
`MineBlock`, `MissileBlock`, `DamageReactionBlock`, `MissileReactionBlock`, `CountermeasureBlock`,
`FormationBlock`, `JobBlock` — plus `[Pilot]` and its `inherit`, and the `*_id` key that selects each
block.

Eleven keys take a fixed set of value names, recovered from literal-emission order:

| Key                                       | Values                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `evade_dodge_style_weight`                | `CORKSCREW`, `SLIDE`, `WAGGLE_RANDOM`, `WAGGLE`                              |
| `evade_dodge_direction_weight`            | `DOWN`, `UP`, `LEFT`, `RIGHT`                                                |
| `evade_dodge_corkscrew_roll_flip_direction` | `TRUE`, `FALSE`                                                            |
| `evade_break_style_weight`                | `REVERSE`, `OUTRUN`, `SIDEWAYS`                                              |
| `buzz_pass_by_style_weight`               | `ENGINE_KILL`, `STRAIGHT_BY`, `BREAK_AWAY`                                   |
| `buzz_head_toward_style_weight`           | `STRAIGHT_TO`, …                                                             |
| `fire_style`                              | `SINGLE`, `MULTIPLE`                                                         |
| `formation_exit_mode`                     | `BRAKE_REVERSE`, `BREAK_AWAY_FROM_CENTER`, `BREAK_AWAY_FROM_CENTER_AFTERBURNER` |
| `field_targeting`                         | `ALWAYS`, `HIGH_DENSITY`, `LOW_DENSITY`, `NEVER`                             |
| `loot_flee_threshold`                     | `EASIEST`, `EASY`, `EQUAL`, `HARD`, `HARDEST`                                |
| `loot_preference`                         | `LT_ALL`, `LT_NONE`, `LT_COMMODITIES`, `LT_EQUIPMENT`, `LT_POTIONS`          |

`TRUE`/`FALSE` are worth noticing against [INI.md](INI.md)'s finding that **no retail value is
boolean-typed**: they are compared as strings here, exactly as `INI_Reader` would.

One run is **not** confidently attributed and is recorded as such: `TURRETS`, `LAUNCHERS`, `TOWERS`,
`ENGINES`, `HULL`, `GUNS`, `GUIDED`, `UNGUIDED`, `TORPEDO`, `ANYTHING` sit beside both
`attack_subtarget_order` and `attack_preference`, and emission order does not separate them.

### Mission scripting

About a hundred `Act_*` and `Cnd_*` names at `.rdata:1139cc` — the action and condition vocabulary of
`[Trigger]` blocks. `Act_SpawnShip`, `Act_SetVibe`, `Act_PlayNN`, `Act_CallThorn`, `Cnd_WatchVibe`,
`Cnd_TLEntered` and the rest — alongside `MissionState` with `COMPLETE`/`INACTIVE`/`ACTIVE`, and
`NNObjective`, `TriggerSave`, `repeatable`.

### Story and battle enums

These *are* `{ name, int }` tables — `content.dll`'s only three:

- **Story rank** (`.data:12d5d0`, 42): `base_0_rank` 0, then `mission_01a_loaded`, `mission_01a_accepted`,
  `mission_01b_*`, `freetime_01_02` … through `mission_end` 41.
- **Formation and solar roles** (`.data:12d720`, 8): `big_solar_formation` 0 … `loot_group_formation`
  3; `big_solar` 0, `defensive_solar` 1, `killable_neutral` 2, `background_solar` 3.
- **NPC battle state** (`.data:12d778`, 44): three enums — a mission-progress set (`IN_SPACE_IN_SYSTEM`,
  `GLOBAL_SUCCESS`, `GLOBAL_FAIL_COMBAT_RANGE`, …), a target set (`BASE`, `BIG_SOLAR`, `BIG_SHIP`,
  `DEFENSIVE_SHIP`, `FRIENDLY_SHIP`, `PLAYER`, `ALL_PLAYERS`, `PLAYERS_IN_RANGE`, …), and a
  format-string parameter set (`FSTRING_PARAM_NONE`, `OFFER_GROUP`, `REWARD_MONEY`, `FACTION_HIT`,
  `TARGET_SYSTEM`, …).

### The export table names the reader

`content.dll` exports `INI_Reader` in full — `get_value_int`, `get_value_float`, `get_value_bool`,
`get_value_string`, `get_indexed_value`, `is_number`, `is_value_empty`, `is_header`, `read_value`,
`read_header`, `set_state`, `reset` — plus `CacheString`, `FmtStr` and `ID_String`. **That is the
class [INI.md](INI.md)'s coercion rules are modelled on**, and the accessor list is the direct
evidence for the rule stated there: there is no accessor asking what type a value is, only accessors
asking for the type you want.

## TODO

Pending _observation in the running game_, in the sense [THN.md](THN.md#todo) sets out.

- **What are object-type values 0 through 3, and `HpAttachmentType` 0 through 3?** Both enums start
  at 4 with nothing naming the low values. No string reaches them, so the corpus cannot help. The
  experiment is to find a code path that produces one — likelier by watching a debug build's
  `unknown OBJECT_TYPE` path than by editing data.
- **Do `RING` and `MESH` zone shapes work?** Registered, never used by retail. The experiment is to
  author a zone with each and see whether it bounds anything.
- **Do `MOON`, `BLACKHOLE` and `ASTEROID` do anything as a `[Solar] type`?** They are named and no
  archetype sets them. `ASTEROID`'s bit sits far from the other solar bits, which suggests it is
  assigned to objects the engine creates. Not evidence.
- **Which of `attack_subtarget_order` and `attack_preference` takes which values?** Emission order
  puts one run of ten names beside both. The experiment is to set an implausible value on each and
  watch which one the engine rejects.

---

[INI.md](INI.md) · [THORN.md](THORN.md) · [RETAIL.md](RETAIL.md) · [PLAN.md](PLAN.md)
