# ENGINE — the vocabularies the executables hardcode

[INI.md](INI.md) describes both encodings and the document they share, and stops there deliberately: to
this library `[Solar]` is a section name and `type` is a property name. **This document records what the
engine does with them** — not because the library will start modelling it, but because the meaning is
measurable and losing it would be a waste.

It is the same case [RDL.md](RDL.md) and [AUDIO.md](AUDIO.md) make. **There is no module here and there
will not be one.** A consumer deciding what a `[Ship]`'s `type` means is exactly the policy
[CLAUDE.md](../CLAUDE.md)'s scope rule assigns to the consumer; this is the reference it can be written
against.

## Where these live, and why they are readable

Freelancer resolves an INI keyword to a number in one of two ways, and **only one of them leaves a
table**:

- **`EXE/common.dll` uses `{ const char *name; int value }` tables.** Contiguous, 8 bytes an entry, in
  `.data`. Every enum below comes from one, read directly.
- **`DLLS/BIN/content.dll` uses `strcmp` chains.** No table survives compilation, so the vocabulary is
  recoverable — MSVC emits a function's string literals in reverse order of first use, so a run of value
  names sits immediately before the key that consumes them — but the **values are not**.

That asymmetry is why the enum half of this document is lopsided: `common.dll`'s enums are given with
numbers, `content.dll`'s with names only. **A name list from `content.dll` is not evidence of a value**,
and none is guessed below. It does not apply to the *keys* — those are recovered from call sites in
every binary, and [Property names](#property-names) sets out how.

File offsets are also RVAs in both DLLs — sections are laid out one-to-one. Image bases are
`0x06260000` for `common.dll` and `0x06f90000` for `content.dll`.

## Object types

**`common.dll` `.data:18b810`, 29 entries.**

One bitfield shared by `[Solar] type`, `[Ship] type` and the targeting and nav-map filters. The warning
string beside it names the field — `*** WARNING: unknown OBJECT_TYPE = '%s'`, from
`E:\FL\Scratch\Source\Common\Archetype.cpp`.

| Bit      | Name                | Bit          | Name        |
| -------- | ------------------- | ------------ | ----------- |
| —        | `NONE` = 0          | `0x10000`    | `FIGHTER`   |
| `0x1`    | `MOON`              | `0x20000`    | `FREIGHTER` |
| `0x2`    | `PLANET`            | `0x40000`    | `GUNBOAT`   |
| `0x4`    | `SUN`               | `0x80000`    | `CRUISER`   |
| `0x8`    | `BLACKHOLE`         | `0x100000`   | `TRANSPORT` |
| `0x10`   | `SATELLITE`         | `0x200000`   | `CAPITAL`   |
| `0x20`   | `DOCKING_RING`      | `0x400000`   | `MINING`    |
| `0x40`   | `JUMP_GATE`         | `0x1000000`  | `GUIDED`    |
| `0x80`   | `TRADELANE_RING`    | `0x2000000`  | `BULLET`    |
| `0x100`  | `STATION`           | `0x4000000`  | `MINE`      |
| `0x200`  | `WAYPOINT`          | `0x10000000` | `LOOT`      |
| `0x400`  | `AIRLOCK_GATE`      | `0x20000000` | `ASTEROID`  |
| `0x800`  | `JUMP_HOLE`         |              |             |
| `0x1000` | `WEAPONS_PLATFORM`  |              |             |
| `0x2000` | `DESTROYABLE_DEPOT` |              |             |
| `0x4000` | `NON_TARGETABLE`    |              |             |
| `0x8000` | `MISSION_SATELLITE` |              |             |

**`0x800000` and `0x8000000` are unclaimed.** Twenty-eight bits are named out of a possible thirty.

**Table order is declaration order, not value order** — `ASTEROID` is the fifth entry and holds bit 29.
Nothing here may be derived from position, which is the same trap [THORN.md](THORN.md) documents for the
event enum.

`MOON`, `BLACKHOLE`, `ASTEROID`, `GUIDED`, `BULLET`, `MINE` and `LOOT` are **named and never set by any
retail archetype** — they classify objects the engine creates rather than ones the data declares.

## The three tables next to it

`0x18b810`–`0x18bc38` is one uninterrupted run of 133 entries. **Five separate enums, adjacent by link
order rather than by meaning, and numerically overlapping** — `weapon` and `TRADELANE_RING` are both
`0x80`. They are different fields; nothing may be resolved across them.

**Equipment class** (`0x18b8f8`, 14 flags): `light` `0x1`, `attached_fx` `0x2`, `weapon` `0x80`,
`shield` `0x100`, `thruster` `0x400`, `cloaking_device` `0x1000`, `engine` `0x20000`, `power` `0x40000`,
`scanner` `0x80000`, `tractor` `0x100000`, `repairdroid` `0x200000`, `internal_fx` `0x400000`,
`tradelane` `0x800000`, `armor` `0x1000000`.

**`[CollisionGroup] type`** (`0x18b968`, 19 flags, bits 1 through 19): `Fin` `0x2`, `Top_Fin` `0x4`,
`Port_Fin` `0x8`, `Starboard_Fin` `0x10`, `Port_Wing` `0x20`, `Starboard_Wing` `0x40`, `Middle_Wing`
`0x80`, `Engine` `0x100`, `Port_Engine` `0x200`, `Middle_Engine` `0x400`, `Starboard_Engine` `0x800`,
`Top_Engine` `0x1000`, `Bottom_Engine` `0x2000`, `Spoiler` `0x4000`, `Tail` `0x8000`, `Port_Side_Panel`
`0x10000`, `Starboard_Side_Panel` `0x20000`, `Port_Arm` `0x40000`, `Starboard_Arm` `0x80000`.

**Dock hardpoint** (`0x18ba00`, an enum rather than flags): `berth` 1, `moor_small` 3, `moor_medium` 4,
`moor_large` 5, `ring` 6, `pad` 6, `jump` 7, `airlock` 8. **`ring` and `pad` are the same value**, and 0
and 2 are unnamed — so this is a genuine enum with a deliberate alias, not a mis-read table.

## Hardpoint types

**`common.dll` `.data:18ba40`, 63 entries — the `HpAttachmentType` enum.**

What `hp_type` and `hp_gun_type` name. Values 4 through 66; **0 through 3 are unnamed** and no string
reaches them.

| Value | Name                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------- |
| 4     | `hp_gun`                                                                                                |
| 5–8   | `hp_shield_generator`, `hp_fighter_…`, `hp_elite_…`, `hp_freighter_shield_generator`                    |
| 9–14  | `hp_thruster`, `hp_torpedo`, `hp_mine_dropper`, `hp_countermeasure_dropper`, `hp_turret`, `hp_cargo_pod` |
| 15–24 | `hp_gun_special_1` … `_10`                                                                              |
| 25–34 | `hp_turret_special_1` … `_10`                                                                           |
| 35–36 | `hp_torpedo_special_2`, `hp_torpedo_special_1` — **inverted**                                           |
| 37–46 | `hp_fighter_shield_special_1` … `_10`                                                                   |
| 47–56 | `hp_elite_shield_special_1` … `_10`                                                                     |
| 57–66 | `hp_freighter_shield_special_1` … `_10`                                                                 |

`hp_torpedo_special_1` = 36 and `_2` = 35 is the one place the ordinal in the name disagrees with the
value. **It is not a transcription slip** — the string block, the table and the default-list arrays below
all agree, and retail sets `hp_torpedo_special_2` ×27 against `_1` ×16.

### The default lists

Two `int[]` immediately after the table, read by the exported `Archetype::Gun::get_hp_type_by_index` and
`Archetype::ShieldGenerator::get_hp_type_by_index`:

| Offset     | Count | Contents                                                                           |
| ---------- | ----- | ------------------------------------------------------------------------------------ |
| `0x18bc38` | 23    | `hp_gun`, the ten `hp_gun_special_*`, the ten `hp_turret_special_*`, both torpedoes |
| `0x18bc98` | 34    | the four generators, then all thirty `*_shield_special_*`                          |

Both getters check a per-archetype vector first and fall back to these only when it is empty, so **this
is the list an archetype gets when the INI declares no `hp_gun_type`** — not a constraint on what it may
declare.

**Both bounds checks are off by one.** Gun compares against `0x17` over 23 entries, so index 23 reads the
trailing `0`; ShieldGenerator compares against `0x22` over 34, so index 34 reads `0xFFFFFFFF`. Neither is
reachable through the data, since the count comes from the same arrays, but a consumer reimplementing the
lookup should not reproduce it.

## Zone shapes

**`common.dll` `.data:18cb80`.** `sphere` 1, `ellipsoid` 2, `BOX` 3, `CYLINDER` 4, `RING` 5, `MESH` 6.
The mixed casing in the table is another sign the compare folds case.

**Beware the key**: `shape` is set 6,270 times overall and only 5,761 of those are zones. The balance
belongs to other sections entirely — asteroid and nebula exclusion shapes, lens-flare shapes — where the
value is a model or effect nickname, not one of these six.

## Zone property flags

**The one vocabulary here with no table and no literal.** `[Zone] property_flags` is a bitfield the file
writes as a number, so the engine tests bits rather than resolving a name — there is no `{ name, value }`
run to read and nothing to look a string up in. Searching the whole install for any name below returns
nothing, in either ASCII or UTF-16, in `common.dll`, `content.dll`, the executable or the data. **These
names are not recovered from a binary; they are the community reading**, and the only thing this document
can add is what the corpus does and does not corroborate.

| Bit        | Name                     | Bit        | Name                     |
| ---------- | ------------------------ | ---------- | ------------------------ |
| `0x1`      | `OBJECT_DENSITY_LOW`     | `0x2000`   | `BADLAND_DANGER_OBJECTS` |
| `0x2`      | `OBJECT_DENSITY_MED`     | `0x4000`   | `GAS_DANGER_OBJECTS`     |
| `0x4`      | `OBJECT_DENSITY_HIGH`    | `0x8000`   | `NEBULA`                 |
| `0x8`      | `DANGER_DENSITY_LOW`     | `0x10000`  | `EXCLUSION`              |
| `0x10`     | `DANGER_DENSITY_MED`     | `0x20000`  | `EXCLUSION2`             |
| `0x20`     | `DANGER_DENSITY_HIGH`    | `0x40000`  | `DAMAGING`               |
| `0x40`     | `ROCK_OBJECTS`           | `0x80000`  | `DRAG_MOD`               |
| `0x80`     | `DEBRIS_OBJECTS`         | `0x100000` | `SCANNER_MOD`            |
| `0x100`    | `ICE_OBJECTS`            | `0x200000` | `DUST`                   |
| `0x200`    | `LAVA_OBJECTS`           | `0x400000` | `MUSIC`                  |
| `0x400`    | `NOMAD_OBJECTS`          |            |                          |
| `0x800`    | `CRYSTAL_OBJECTS`        |            |                          |
| `0x1000`   | `MINE_DANGER_OBJECTS`    |            |                          |

**What the corpus corroborates is the extent, not the names** — see
[Corpus](#zone-property-flags-1).

## Two smaller tables

**Good category** (`0x1896c0`): `Commodity` 0, `Equipment` 1, `ShipHull` 2, `Ship` 3. Retail authors them
lowercase.

**Base-room hotspots** (`0x189bc8`): `ExitDoor` 1, `NewsVendor` 2, `MissionVendor` 3, `Launch` 4,
`StartDealer` 5, `FrontDesk` 6, `StartShipDealer` 7, `StartEquipDealer` 8, `MoveRight` 9, `MoveLeft` 10,
`VirtualRoom` 11, `Repair` 12. Note **6 and 7 are out of table order** — `StartShipDealer` precedes
`FrontDesk` in memory.

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

| Key                                         | Values                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `evade_dodge_style_weight`                  | `CORKSCREW`, `SLIDE`, `WAGGLE_RANDOM`, `WAGGLE`                                 |
| `evade_dodge_direction_weight`              | `DOWN`, `UP`, `LEFT`, `RIGHT`                                                   |
| `evade_dodge_corkscrew_roll_flip_direction` | `TRUE`, `FALSE`                                                                 |
| `evade_break_style_weight`                  | `REVERSE`, `OUTRUN`, `SIDEWAYS`                                                 |
| `buzz_pass_by_style_weight`                 | `ENGINE_KILL`, `STRAIGHT_BY`, `BREAK_AWAY`                                      |
| `buzz_head_toward_style_weight`             | `STRAIGHT_TO`, …                                                                |
| `fire_style`                                | `SINGLE`, `MULTIPLE`                                                            |
| `formation_exit_mode`                       | `BRAKE_REVERSE`, `BREAK_AWAY_FROM_CENTER`, `BREAK_AWAY_FROM_CENTER_AFTERBURNER` |
| `field_targeting`                           | `ALWAYS`, `HIGH_DENSITY`, `LOW_DENSITY`, `NEVER`                                |
| `loot_flee_threshold`                       | `EASIEST`, `EASY`, `EQUAL`, `HARD`, `HARDEST`                                   |
| `loot_preference`                           | `LT_ALL`, `LT_NONE`, `LT_COMMODITIES`, `LT_EQUIPMENT`, `LT_POTIONS`             |

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

- **Story rank** (`.data:12d5d0`, 42): `base_0_rank` 0, then `mission_01a_loaded`,
  `mission_01a_accepted`, `mission_01b_*`, `freetime_01_02` … through `mission_end` 41.
- **Formation and solar roles** (`.data:12d720`, 8): `big_solar_formation` 0 … `loot_group_formation` 3;
  `big_solar` 0, `defensive_solar` 1, `killable_neutral` 2, `background_solar` 3.
- **NPC battle state** (`.data:12d778`, 44): three enums — a mission-progress set (`IN_SPACE_IN_SYSTEM`,
  `GLOBAL_SUCCESS`, `GLOBAL_FAIL_COMBAT_RANGE`, …), a target set (`BASE`, `BIG_SOLAR`, `BIG_SHIP`,
  `DEFENSIVE_SHIP`, `FRIENDLY_SHIP`, `PLAYER`, `ALL_PLAYERS`, `PLAYERS_IN_RANGE`, …), and a
  format-string parameter set (`FSTRING_PARAM_NONE`, `OFFER_GROUP`, `REWARD_MONEY`, `FACTION_HIT`,
  `TARGET_SYSTEM`, …).

### The export table names the reader

**`common.dll` exports `INI_Reader` in full** — 3,856 exports, among them `get_value_int`,
`get_value_float`, `get_value_bool`, `get_value_string`, `get_indexed_value`, `is_number`,
`is_value_empty`, `is_value`, `is_header`, `find_header`, `read_value`, `read_header`, `set_state`,
`reset` — plus `CacheString`, `FmtStr` and `ID_String`. `content.dll`, `server.dll` and the executable
all **import** it from there; `content.dll` itself exports only seven symbols.

That is the class [INI.md](INI.md)'s coercion rules are modelled on, and the accessor list is the direct
evidence for the rule stated there: **there is no accessor asking what type a value is, only accessors
asking for the type you want.** It is also what makes the next section possible.

## Property names

The vocabulary above is enum *values*. This section is the other half — **the keys**, and which of them
the engine actually matches. Two methods, and the difference between them is the point.

### Method 1 — look for the literal

Every key the engine matches by name has to exist in some binary as a NUL-terminated string. Take the
names retail data actually uses and look each one up. Cheap, works on every binary, and gives an **upper
bound**: a literal being present does not prove it is used as an INI key.

Two traps, both of which cost a wrong answer before they were spotted:

- **Literals are frequently preceded by printable data bytes.** `[Good] price` sits at `139e6d` as
  `?33s?price` — the five bytes ahead of it are a float, not text. Splitting the string region on
  printable runs rejects it and concludes the game does not read `price`, which is plainly false.
- **The reverse case is real too.** `comment` occurs only inside `Expecting end of comment`, and `flag`
  only inside `original_jump_flag`. Those are not keys.

**No mechanical rule separates the two** — `Erelief_time` is a data byte plus a key, `spacedust` is a
word containing `pacedust`, and both look identical to a one-byte lookback. The 23 ambiguous names were
classified by eye; 14 are keys, 9 are not.

### Method 2 — disassemble the call sites

`INI_Reader::is_value(const char *)` is exported from `common.dll` and imported by everything else, so
**the key is the argument pushed before the call.** Find every `call is_value` / `call is_header` /
`call find_header`, walk back for the `push imm32` or `mov reg, imm32` that supplies it, and resolve the
pointer. This gives a **lower bound**, and — unlike method 1 — it says *which reader* wants the key.

> **The retail `Freelancer.exe` cannot be read this way.** Its `.text` has entropy 7.98 and contains
> **zero** `push ebp; mov ebp, esp` prologues, against 6.46 and normal prologues in the DLLs, and it
> carries two extra sections named `stxt774` and `stxt371` — **it is SecuROM-wrapped**, and no string in
> it has a single code reference. The figures below are from an **unprotected build of the same
> executable**; its `.rdata` is byte-identical in layout and it imports 29 `INI_Reader` entry points from
> `common.dll`. Method 1 works on the retail executable regardless, because `.rdata` is in the clear
> either way.

### Value shapes

The same call sites say what *shape* a property's value has, because `INI_Reader` has no accessor that
asks what type a value is. So the code after a matched key names both the position and the type:
`push 2; call get_value_float` is "read index 2 as a float". Bounding each block by its `test al,al`/`jz`
**and by the next call site**, and reading the index off the `push imm8`/`push imm32` that precedes each
accessor, recovers a shape.

`pos` comes out `float float float`, `rotate` and `color` the same, `nickname` a string,
`num_exhaust_nozzles` an `int`, `dispersion_angle` a `float`. **`is_value_empty(i)` probes appear too and
mark an optional position** — which is how `[Zone] size` reads: one value for a sphere, two for a
cylinder, three for a box, with the probe deciding.

**The declared shape and the written value are different things**, and conflating them is the trap here.
[INI.md](INI.md#how-the-game-reads-a-value) says the reader coerces, so a `[Light] color` of
`255, 255, 255` is recorded integer-typed and read with `get_value_float`.

**A declared shape is a lower bound**: `hp_type` reads index 0 as a string and the hardpoint names after
it come from a loop the scan does not follow, so its arity runs to 7 in retail.

**A shape is per name, and a name is occasionally per section.** The clearest genuine cases are not type
slips but different fields wearing one name: `[CollisionConsts] damage` takes a name and an amount where
`[Zone] damage` takes a number, `[Zone] faction` is a weight where `content.dll`'s is a name and a
weight, and `[MsnSolar] visit` is a string where every `common.dll` reader treats `visit` as an int.

The full table is in [SECTIONS.md](SECTIONS.md#declared-value-shapes).

### Attribution

`common.dll` exports 3,856 symbols, so the nearest preceding export names the function a call site sits
in — a real attribution:

```
Archetype::Ship::read
    bay_door_anim, HP_bay_surface, HP_bay_external, HP_tractor_source, num_exhaust_nozzles,
    hold_size, linear_drag, angular_drag, steering_torque, nudge_force, strafe_force,
    strafe_power_usage, ids_info1, ids_info2, ids_info3, ship_class, nanobot_limit,
    shield_battery_limit, max_bank_angle, hp_type
```

The same works for `Archetype::Solar::read`, `Archetype::Gun::read`, `Archetype::Munition::read`,
`GoodInfoList::read_Good_block`, `CSolar::ReadObj`, `RoomData::read_*_block`,
`CmnAsteroid::CAsteroidField::load`, `Universe::Startup` (49 keys over `[Time]`, `[System]`, `[Zone]`,
`[Music]`, `[Object]`, `[Base]`) and `ReadConstants` (78 keys over seven `[*Consts]` sections).

**It does not work outside `common.dll`** — `content.dll` exports seven symbols, so its sites collapse
onto four "owners" and the names are meaningless. **The grouping is still real, because a run of sites is
one function**; only the label is wrong. Those clusters are best identified by the section names they
match: one is plainly the mission-script reader (13 sections, 153 keys, every `Cnd_*` and `Act_*`),
another the pilot and faction tables (`[RandomMission]`, `[RankDiffDB]`, `[FactionProps]`).

### The enumeration

**[SECTIONS.md](SECTIONS.md) lists all 283 sections** — the section/property pairs retail data shows,
plus more recovered from the binaries: properties the engine reads in a section that no retail file sets
there. `dispersion_angle` on `[Gun]` is the case that forced them in; it works in game and a table built
from the data alone does not contain it.

Three placement rules, each carrying its own weight. Address order **within one function** and the
exported block-reader names are heuristics; the third is the **archetype class chain**, and it is exact
rather than heuristic: `common.dll` has no RTTI, but a virtual override calls its base, so scanning each
`Archetype::X::read` for calls to another `Archetype::Y::read` recovers the hierarchy outright —
`Gun → Launcher → AttachedEquipment → Equipment → Root`, which is why a `[Gun]` accepts 37 keys where
retail sets 24. SECTIONS.md lists what each class contributes, so the union is inspectable rather than
asserted — and **which class each header actually instantiates**, read off the constructor the
`Archetype::Load*` dispatcher calls. `[Ship]` is direct; `[Solar]` calls `EqObj`'s constructor, its base.

Address-order segmentation needs function boundaries, and **the export table is the wrong source for
them** — fine in `common.dll`, useless in `content.dll`, where groups ran on and gave `[NewsItem]` 134
mission-script keys and `[LOD]` 100. **Every address a direct `call` targets is a function start**, and
collecting those works in any binary regardless of what it exports.

**For 26 of the 35 matched-but-absent sections, "what are its properties?" has no answer, in two
different ways.** Ten are **obsolete** — the header is matched only to emit
`*** WARNING: [Cloud] is obsolete` (`RoomData.cpp:2046`) and then skipped, so no property is read by
design. Fifteen more are read **positionally** — their handler calls the indexed
`get_value_int(i)` / `get_value_string(i)` accessors and never `is_value`, eleven of them sharing one
function in `content.dll` that makes 50 indexed calls and zero name comparisons. **Asking what properties
`[MsnShipSave]` accepts is the wrong question: it accepts a sequence.**

Reaching those answers needed the header block bounded properly — take the `test al,al` and `jz` that
follow the header call, stop at the jump target **or at any unconditional `jmp`**. Without the `jmp`
terminator `[Lighting]` absorbs eighteen properties from the block after it.

---

## Corpus

Counts here are over **all 1,252 retail INI files under `DATA`**, read through this library's own reader
— the 1,251 BINI and `initialworld.ini` together, plus `EXE/*.ini` and the two `.fl` saves where noted.
That is a wider sweep than [RETAIL.md](RETAIL.md#what-is-in-it)'s 70,250-section figure, which is BINI
only.
Where a count is absent it is because nothing measures it, not because it was omitted.

### Object types

`[Solar] type` is set **321 times over 14 distinct spellings** — `NON_TARGETABLE` ×75,
`MISSION_SATELLITE` ×59, `PLANET` ×55, `STATION` ×45, `SATELLITE` ×37, `DESTROYABLE_DEPOT` ×26,
`WEAPONS_PLATFORM` ×9, `JUMP_HOLE` ×5, then `SUN`, `DOCKING_RING`, `JUMP_GATE`, `AIRLOCK_GATE` ×2 each
and `TRADELANE_RING` ×1. **The fourteenth is `waypoint`, lowercase, once** — which is how we know the
comparison folds case, since the table has only `WAYPOINT`.

`[Ship] type` is set **115 times over 7**: `FIGHTER` ×81, `FREIGHTER` ×9, `CAPITAL` ×8, `TRANSPORT` ×8,
`CRUISER` ×4, `GUNBOAT` ×4, **`MINING` ×1**.

`[CollisionGroup] type` is set 100 times across 13 of the 19 flags; the six engine names and `Engine`
itself go unused.

### Hardpoint types

**The vocabulary is closed the same way THORN's is.** `hp_type`/`hp_gun_type`/`hp_shield_type` are set
**1,350 times over 61 distinct names, every one of them in the table**, with nothing unregistered. The
two never used are `hp_shield_generator` and `hp_freighter_shield_generator` — both of which have a
`_special_` series that covers them.

### Zone shapes

Retail sets 5,761 — `CYLINDER` ×3,307, `SPHERE` ×1,878, `ELLIPSOID` ×361, `BOX` ×215. **`RING` and
`MESH` are never used.**

### Zone property flags

Retail sets the key **835 times**, all in `[Zone]`, all integer-typed, all one value, over 41 distinct
words — and **not one set bit falls outside the 23 named.** Twenty-three named bits with nothing above
bit 22 and nothing unnamed below it is a strong statement about where the field ends; **it says nothing
about which name belongs to which bit.**

Set counts per bit, in the order [the table above](#zone-property-flags) lists them: 69, 99, 6, 6, 22,
8, 116, 27, 34, 6, 7, 1, 5, 4, 20, 59, 164, 434, 2, **0**, 2, **0**, **0**. Six zones write `0` — three
asteroid fields in Iw05 and three in Iw06.

Four places where the data does speak to a name, and all four agree with it:

- **`NEBULA`** — all 59 zones carrying it set `property_fog_color`, and 51 set `music`.
- **`EXCLUSION`** — 125 of its 164 set `edge_fraction`, against 27 of `EXCLUSION2`'s 434.
- **`DAMAGING`** and **`SCANNER_MOD`** are the same two zones. One word, `0x148020`, written twice:
  `Zone_Li04_Pequena_Negra` and `Zone_Li04_Grande_Negra` — the two black holes in Li04, and the only two
  zones setting both `damage` and `interference`.
- **`CRYSTAL_OBJECTS`** is set once, on `zone_Li02_Tahoe_ice_crystal_field`.

**The flag is not a gate on the key.** `DRAG_MOD`, `DUST` and `MUSIC` are never set by any retail zone,
yet `drag_modifier`, `spacedust` ×270 and `music` ×166 are all authored on zones without them — so
whatever the three name, it is not permission to write the corresponding property. `damage` is the same
case from the other side: 173 zones set it and only the two above set `DAMAGING`. The one correlation
that holds in both directions is `property_fog_color`, which appears 182 times and **never on a zone
without a `property_flags` word**.

### Good categories

Retail authors them lowercase: `equipment` ×752, `commodity` ×40, `shiphull` ×32, `ship` ×31.

### Call-site resolution

| Binary           | Call sites | Resolved          |
| ---------------- | ---------- | ----------------- |
| `common.dll`     | 649        | 649               |
| `content.dll`    | 391        | 386               |
| `Freelancer.exe` | 232        | 231               |
| `server.dll`     | 37         | 37                |
| **total**        | **1,309**  | **1,303** (99.5%) |

**799 property names and 208 section names** come out of it. The 649 `common.dll` sites fall across **78
distinct owners**, about 8 apiece.

### What the two methods together say

Over **1,375 distinct property names in 515,428 uses**:

| Class                                                          | Names   | Uses            |
| -------------------------------------------------------------- | ------- | --------------- |
| **Proven read** — passed to `is_value` at a resolved call site | 619     | 316,869 (61.5%) |
| **Literal present** — matched by some other path               | 651     | 182,428 (35.4%) |
| **No literal anywhere** — not matched by name at all           | **105** | 16,131 (3.1%)   |

The middle row is not a failure. `is_value` is one of several ways a reader identifies a key —
`get_name_ptr` plus its own comparison is another — so method 2 finds a subset by construction, and **the
two bounds together are the honest answer rather than either alone.**

### The 105 keys nothing reads

This is the finding worth having, and it is the same class as
[THORN.md](THORN.md#userprops-is-not-thorns)'s `Priority`: **data the authoring pipeline emitted that the
shipped engine never looks at.**

| Key                        | Uses      | Where                                      |
| -------------------------- | --------- | ------------------------------------------ |
| `faction_weight`           | 5,611     | `[zone]`                                   |
| `pop_type`                 | 3,841     | `[zone]`                                   |
| `difficulty_level`         | 1,489     | `[Object]`                                 |
| `filename`                 | 1,186     | `[EncounterParameters]`, `[ConcaveObject]` |
| `attack_ids`               | 806       | `[zone]`                                   |
| `comment`                  | 678       | `[zone]`                                   |
| `rumorknowdb` / `knowdb`   | 564 / 538 | `[GF_NPC]`                                 |
| `flag`                     | 365       | `[properties]`                             |
| `offers_missions`          | 241       | `[BaseFaction]`                            |
| `placement_offset`         | 145       | `[DynamicAsteroids]`                       |
| `lane_id` / `tradelane_down` | 139 / 133 | `[zone]`                                 |
| `strength`                 | 86        | `[Explosion]`                              |
| `fog_enabled`              | 59        | `[Fog]`                                    |

A `[zone]` carries **both** `faction_weight` (a weighted faction list) and `faction` (per-encounter
weights). Only the second is read. Likewise the engine matches `difficulty` and not `difficulty_level`.

**Nine of the 105 are shipped typos**, and they are the best evidence the method works, since each is one
edit away from a key that *is* read: `spacedust _maxparticles` (embedded space, ×5),
`spacedust_masparticles` (×2), `spacedusr_maxparticles`, `spacedust_maxdust`, `pacedust` (×3),
`info_ids` for `ids_info`, `info_card` for `ids_info_card`, `fade_distance` for `near_fade_distance`, and
`commoditydealer`/`equipmentdealer` where the hotspot names are `CommodityDealer`-cased constants. Two
entries are not names at all — `260800`, and a run of 42 dashes that the parser read as a property.

### The 180 keys retail never sets

The other direction, available only from method 2: keys the engine matches that **no file in the install
provides**, so they take whatever default the reader leaves in place. The substantial groups are the
physics constants (`GOLEM_*` ×11, `RMGR_LOOK_AHEAD_*` ×10, `ANOM_LIMITS_*`, `PHYSICAL_SIM_RATE`,
`MIN_TIME_BETWEEN_COLLISIONS`), sound constants (`INTERIOR_SOUND_NAME`, `EXTERIOR_SOUND_NAME`,
`INSIDE_CONE_ANGLE`, `MAX_VOLUME_FORCE`), weapon fields `gun_azimuth`, `gun_elevation` and
`dispersion_angle`, docking flags `can_dock`, `can_tl`, `dock_exception` and `tlr_exception`, and
`price_variance`, `ship_repair_cost`, `linked_equip`, `tractored_explosion`.

**A handful are artefacts, not findings.** Widening the argument search to `mov reg, imm32` picks up the
occasional wrong operand, which is where `/*`, `*/`, `content.dll` and `version` in that list come from.
**The list is a lead, not a measurement**, and is marked as such.

### Declared shapes against recorded types

A shape is recovered for **542 of the 799** property names. Scored against the 495 positions where both
the declared shape and the recorded type are known:

|                                          | Positions | |
| ---------------------------------------- | --------- | --- |
| Declared type equals the recorded type   | 315       | 64% |
| Compatible under `INI_Reader`'s coercion | 176       | 36% |
| **Incompatible**                         | **4**     | 1%  |

Only four positions resist: `[Player] rank` and `location` are declared `int` and written as strings, and
`ambient[1]` and `permutation[0]` are declared string and written as integers. **They are recorded, not
explained.**

Arity agrees too — the highest index the code touches fits inside the observed value count for 401 names
and exceeds it for 7, all of which are residual block overrun.

Of the 542, twenty show more than one shape across their call sites; **nine of those differ only by being
a prefix of the longest**, which is the scan truncating rather than the engine disagreeing. **Eleven are
genuine.**

### Section coverage

| | Count |
| --- | --- |
| Sections listed in [SECTIONS.md](SECTIONS.md) | 283 |
| Section/property pairs retail data shows | 2,222, of which 110 unread |
| Pairs added from the binaries that retail never writes | 522 |
| Section names recovered from call sites | 208 |
| Archetype classes recovered from the call graph | 29 exports, 28 distinct bodies |
| Property readings across those classes | 154, one key read twice in a chain |
| Section-to-class bindings confirmed by the dispatcher | 30 of 34, 2 absent, **2 corrected** |

**Function boundaries from call targets, not exports**, lift `content.dll`'s address-order corroboration
from **31% to 94%**; within-function address order corroborates at 94% and the exported block-reader
names at 88%. The archetype class chain is exact.

Of the 35 matched-but-absent sections, **10 are obsolete** (nine from `RoomData.cpp`) and **15 are read
positionally**, 11 of those sharing one handler.

---

## TODO

Pending *observation in the running game*, in the sense [THN.md](THN.md#todo) sets out.

- **What are object-type values 0 through 3, and `HpAttachmentType` 0 through 3?** Both enums start at 4
  with nothing naming the low values. No string reaches them, so the corpus cannot help. The experiment is
  to find a code path that produces one — likelier by watching a debug build's `unknown OBJECT_TYPE` path
  than by editing data.
- **Do `RING` and `MESH` zone shapes work?** Registered, never used by retail. The experiment is to author
  a zone with each and see whether it bounds anything.
- **Do `MOON`, `BLACKHOLE` and `ASTEROID` do anything as a `[Solar] type`?** They are named and no
  archetype sets them. `ASTEROID`'s bit sits far from the other solar bits, which suggests it is assigned
  to objects the engine creates. Not evidence.
- **Which of `attack_subtarget_order` and `attack_preference` takes which values?** Emission order puts
  one run of ten names beside both. The experiment is to set an implausible value on each and watch which
  one the engine rejects.
- **Are the 105 unread keys really inert, or read through a path the scan misses?** Nothing matches them
  by name in any binary, which is strong but not conclusive — a reader could compare a constructed string.
  The experiment is to change `faction_weight` in a zone to something absurd and see whether population
  changes; it is the highest-use member of the set at 5,611.
- **What are the 651 keys matched by a path other than `is_value`?** They have literals but no resolved
  call site, so they carry no attribution. Finding the other matcher — most likely `get_name_ptr` plus a
  local comparison — would fold them into the attributed set and **is a reading problem rather than an
  in-game one**.

---

[INI.md](INI.md) · [SECTIONS.md](SECTIONS.md) · [THORN.md](THORN.md) · [RETAIL.md](RETAIL.md)
