# Costume

A character is not one model. A body, a head and two hands are four `.dfm` files with four skeletons,
joined at hardpoints — and the join is not only placement, because a head's lowest vertices are
skinned to a bone the head's own file does not define.

**No module, and there will not be one.** Reading the four files is `deformable/`'s already; which
head goes on which body is a costume INI this library does not interpret (its sections are in
[SECTIONS.md](SECTIONS.md#costume)); composing the result is a renderer's. What is left — *how the
pieces meet* — is written down here. Same shelf as [RENDERER.md](RENDERER.md).

What the game does is read out of retail `EXE/deformable2.dll` (image base `0x65f0000`; no exports,
reached through the DACOM interface `IDeformable`, vtable `0x6601228`), with the engine link it calls
into in `engbase.dll` and the character's assembly in `Freelancer.exe`. Addresses are
`deformable2.dll`'s unless another binary is named. The data figures are measured against retail
`DATA/CHARACTERS`; the totals are in [Corpus](#corpus).

## The pieces and the seats

|          | Files | Shares with the body, on its root bone | Shares with the body, on a detached bone |
| -------- | ----- | --------------------------------------- | ----------------------------------------- |
| `BODIES` | 88    | —                                       | —                                         |
| `HEADS`  | 104   | `hp_head`                               | `hp_neck`; on some, `hp_upper torso`, `hp_lcollarbone`, `hp_rcollarbone` |
| `HANDS`  | 12    | `hp_left b` or `hp_right b`             | `hp_left a` or `hp_right a`               |

87 of the 88 bodies offer `hp_head`, `hp_neck` and both wrist pairs. The exception is `worm.dfm`,
which offers none of them and is not a costume host at all. On `br_bartender_body.dfm`, `hp_head` is
on `Body_Head` and `hp_neck` is on `Spine3` — one bone further down the chain, which is what makes a
chin turn with the torso instead of with the skull.

## How the game joins them: one rule, shared names

**No hardpoint name is known to any retail binary.** None of `hp_head`, `hp_neck`, `hp_left a`,
`hp_left b` or the shoulder names occurs in any file under `EXE/` — the game has no table of join
pairs, and the caller passes none. The pairing is entirely in the data.

`Freelancer.exe` builds the character as one call: it lists the parts **body first**, then head, left
hand and right hand (`0x4c9f00`, the list shifted so the body is index 0 at `0x4ca2f0`), and hands the
list to `IDeformable` `create` (`+0xc`/`+0x14`, `0x65f36c0`) — filenames and part types, no hardpoint
names. `create` loads every part, then walks **every bone of every part**, parts in list order and
bones in `.3db` order, enumerating each bone's hardpoints (`0x65f59d0`, through `IHardpoint +0x14`).
The callback (`0x65f3540`) keeps one map keyed by the name's CRC:

- the **first** bone carrying a name is recorded as its holder (`0x65f35b4`);
- **every later bone carrying the same name is connected to the first** — `IHardpoint +0x18(first,
  {name, CRC}, later, {name, CRC})` (`0x65f35fb`) — and a failed connect logs
  `cannot connect parts %s<->%s` with the hardpoint's name on both sides (`0x65f3608`).

The connect is the engine's ordinary hardpoint link (`engbase.dll` `0x6626690`), the same one THN's
`CONNECT_HARDPOINTS` uses: the later bone is parented to the first with

```
W(later) = W(first) · H(first) · H(later)⁻¹
```

where `H` is a hardpoint's own transform on the bone that carries it — the two hardpoints coincide, and
the link holds every frame, so the child follows the *animated* host bone. The engine refuses a link
whose child already has a parent (`engbase.dll` `0x6622008`, *child already has a parent*), so only a
bone with no chain parent can be joined: a part's root, or a detached bone.

**Body first is what makes the body the host.** The first holder of a name is the parent, so a head
listed before its body would try to parent the body's `Body_Head` under itself and be refused.

Over every retail pairing, every shared name lands on exactly those two kinds of bone and none is
ever refused ([Corpus](#corpus)). There are two roles, but one mechanism:

- **The attachment** — `hp_head`, `hp_left b`, `hp_right b` — is on the child's **root** bone, so the
  link places the whole child.
- **The seam** — `hp_neck`, `hp_left a`, `hp_right a`, and the shoulder names — is on a **detached
  bone** of the child, so the link places one slot of the child's bone table.

## The seam is a detached bone, linked like any other

[DEFORMABLE.md](../modules/DEFORMABLE.md#detached-bones) already describes what a detached bone is: a
bone directory no `Cmpnd` part claims, carrying exactly one fixed hardpoint and nothing else, holding a
slot in the bone table that `Bone_id_chain` still skins to. This is what those bones are *for*.

A detached bone has no `Cmpnd` part, so `create` instantiates it as a standalone engine object
(`0x65f1617`–`0x65f163d`) — a bone with no parent, which is exactly what the shared-name walk can link.
**Each seam is linked on its own, by its own name**: a head with shoulders meets the body along up to
four frames, each to the body bone carrying that name.

The skinning matrix for any slot is the bone's world times its stored `Bone to root`, relative to the
part's root (`0x65f1030`: `K = W(root)⁻¹ · W(bone) · B(bone)`; see
[DEFORMABLE.md](../modules/DEFORMABLE.md#skinning)). For a seam that gives

```
K(seam) = W(child root)⁻¹ · W(host bone) · H(host) · H(seam)⁻¹ · B(seam)
```

**The child's own stored seam frame is an input**, both halves of it: `H(seam)` places the bone against
the host's hardpoint, and `B(seam)` says where the seam vertices were modelled. Nothing is captured at
assembly. Where the child was rigged against the host's frame, the slot comes out the identity at rest
and the seam vertices sit where the child modelled them; where it was not, the gap shows **at rest**,
before any animation — which is the next section.

### A seam with no seat is destroyed

After the walk, `create` looks at every bone of every part after its root (`0x65f3d00`–`0x65f3d64`).
Any bone that still has no parent (`IEngine +0xd4` returns −1) is destroyed (`IEngine +0x60`,
`0x65f3d49`) and its handle set to −1. A detached bone whose name the host does not offer is exactly
such a bone. Its record keeps the identity it was registered with, so its skinning matrix is
`W(child root)⁻¹ · B(seam)`, and the vertices it carries render at `B(seam) · v` **in world space** —
torn from the character towards the world origin, by the weight they give that bone. That is read from
the binary and not yet observed; see [TODO](#an-unseated-seam-in-game).

It is the common case for the shoulder seams: 14 heads want `hp_upper torso` and only 9 bodies offer
it.

### The walk stops at the last compound bone

The walk, the destroy pass and skinning all stop at one cursor — the index of the last bone a `Cmpnd`
part claims, plus one (`0x65f5a52`, `0x65f3d0a`, `0x65f6d0e`) — not at the bone count. **A detached
bone listed after every compound bone is never linked, never destroyed and never skinned**: its slot
keeps the identity and its vertices ride rigidly with the root. No retail file has one; a writer must
keep detached bones ahead of the last compound bone in `.3db` order
([DEFORMABLE.md](../modules/DEFORMABLE.md#bones-are-a-table-not-just-a-tree)).

## The seam frame is per rig family, and the game shows it

Since the child's stored seam frame is what the game poses with, how well it agrees with the host's is
what a character looks like at rest. Mating each head to each body at the attachment and comparing the
head's seam hardpoint against the body's hardpoint of the same name, over all 9,048 mated pairs:
**4,425 agree to the bit** and 3,565 more to within `1e-3`, but 208 are `0.1` or worse on a figure 1.6
tall. The hands are starker — 580 exact, 464 at `0.1` or worse, and **nothing in between**.

The split is not noise. Every body seats exactly either 60 of the 104 heads or 33 of them, never a
number in between, and every hand is exact on either 60 bodies or 25:

|            | Bodies | Heads seated exactly |
| ---------- | ------ | -------------------- |
| one family | 60     | 60                   |
| the other  | 25     | 33                   |
| neither    | 3      | 0                    |

Two rig families — the two `sex` values `bodyparts.ini`'s `[Skeleton]` sections declare for the
groups the bodies are listed in ([SECTIONS.md](SECTIONS.md#skeleton)) — plus three bodies that match
nothing: `worm.dfm`, which offers no attachment hardpoint at all, and `br_darcy_body_torture.dfm` and
`pl_male3_peasant_body_hurt.dfm`, whose seams sit `0.78` and `0.57` from where a head expects them.

**Those gaps are what the game draws.** The seam slot is built from the child's own frame, so a head
on a body of the other family, or on either bent body, opens at the neck at rest. The costume
declarations are what keep it from showing, and nothing enforces them: `get_costume_gender`
(`common.dll` `0x62ffae0`) logs *inconsistent gender* for a costume whose parts disagree, and accepts
it anyway.

## What the seam actually carries

Not a decoration: **4.61% of every influence in the corpus names a detached bone, at an average weight
of 0.638** — these are dominant influences, not a fringe. 12.47% of a head's points and 7.53% of a
hand's are touched by one, and no body point is, which is the asymmetry the whole arrangement is built
on: a host is never a guest.

19 of the 156 detached bones are skinned to by nothing at all, and **none of them is a neck**: seven
`hp_lcollarbone`, seven `hp_rcollarbone`, one `hp_upper torso`, and two of each wrist. The join every
costume has is always weighted; the ones a model may declare and not use are the optional ones — and
an unweighted seam that goes unseated is destroyed with nothing to tear.

## Accessories

An accessory is a rigid `.3db` hung off a hardpoint of the character, declared in `bodyparts.ini`
`[Accessory]` with two hardpoint names ([SECTIONS.md](SECTIONS.md#accessory)): `hardpoint` is the
prop's own, `body_hardpoint` the character's (`common.dll` `get_accessory_hardpoint` `0x62b6cf0`,
`get_character_hardpoint` `0x62b6d00`). A costume carries up to eight.

`Freelancer.exe` seats one by **searching the whole character** for `body_hardpoint` — depth first from
the root object over every connected child (`0x4c9e20`, through `common.dll` `FindHardpoint`
`0x630e9c0`), the first object carrying the name winning — and connecting the prop there with the same
link as above: `W(prop) = W(owner) · H(owner) · H(prop)⁻¹`. A failure logs *Accessory - connection
failed!* (`0x4c9ed9`). Every retail accessory names `hp_hat` or `hp_eyewear` on both sides, and only
heads carry those, so the search always ends on the head.

## What a character plays

**A script is bound to the whole character, never to one part.** `Freelancer.exe` starts a script
through `IDeformable +0x1c` (`0x65f1f00`) with the character's handle, a script name and timing — no
part (`0x4522ee` for THN's `START_MOTION`, `0x4cb54b` for the comm window). Several play at once in
slots — four on a comm character, 32 on a THN actor — and each moves only the bones its maps name.
Body, facial and hand scripts are kept apart by what they name, not by where they are bound: a THN
scene starts `Sc_MLHAND_*` and `Sc_dx_*` as separate `START_MOTION`s on one actor.

## What Librelancer and MAXLancer do

Both arrive at a costume the same way, and both differ from the game in the same three places.

Librelancer's `DfmSkeletonManager.Connection` (`src/LibreLancer/Render/DfmSkeletonManager.cs:37`)
hardcodes the three joins as name triples:

```csharp
HeadConnection      = new(BodySkinning, HeadSkinning,      "hp_head",    "hp_head",    "hp_neck");
LeftHandConnection  = new(BodySkinning, LeftHandSkinning,  "hp_left b",  "hp_left b",  "hp_left a");
RightHandConnection = new(BodySkinning, RightHandSkinning, "hp_right b", "hp_right b", "hp_right a");
```

Its placement matches the game's attachment link. Its seam does not: it captures the host's connector
in the child's frame once, at assembly, and drives the slot with the change since —

```csharp
invBindPose = (BoneTransform(connectionHp, connectionBone) * Transform.Inverse()).Inverse();
Bone        = invBindPose * BoneTransform(connectionHp, connectionBone) * Transform.Inverse();
```

— which is the identity at rest for **any** pairing, so a mismatched head never opens at the neck as it
does in game. And it fills every hole the part-indexed table leaves with that one matrix, so a head
with shoulder seams gets its collarbones driven by the neck rather than each by its own name.

MAXLancer (`DeformableCompound.BuildCostume`, `scripts/Deformable.ms:747`) does not read detached bones
at all: it finds the seam as the slot no constraint filled (`GetLastBoneIndex`, `:452`), stubs it at
identity on import (`:681`), hardcodes the same three pairs, and derives the seam bind from the host —
the same capture as Librelancer by a different route, and the same single seam per child. Its
deformable path also places the child with `inverse source.transform * target.transform` (`:725`),
dropping the child-root factor its rigid path keeps (`MAXLancer.ms:450`) — correct only while the
child's root is at identity, which is true of every retail head and hand.

Neither destroys an unseated seam: Librelancer gives it the neck's matrix, MAXLancer leaves it at
identity.

## Corpus

204 models: 88 bodies, 104 heads, 12 hands.

**Hardpoints**, by how many files of that kind carry one:

| Name                                | Bodies (88) | Heads (104) | Hands (12) |
| ----------------------------------- | ----------- | ----------- | ---------- |
| `hp_head`                           | 87          | 104         | —          |
| `hp_neck`                           | 87          | 104         | —          |
| `hp_left a` / `hp_right a`          | 87          | —           | 6 / 6      |
| `hp_left b` / `hp_right b`          | 87          | —           | 6 / 6      |
| `hp_upper torso`                    | 9           | 14          | —          |
| `hp_lcollarbone` / `hp_rcollarbone` | 9 / 9       | 13 / 13     | —          |
| `hp_eyewear`                        | —           | 102         | —          |
| `hp_hat`                            | —           | 63          | —          |
| `hp_hair`                           | —           | 3           | —          |
| `HpLeftConnect` / `HpRightConnect`  | —           | —           | 6 / 6      |

`Hp_BATON EFFECT01` and `Hp_BATON EFFECT02` occur on one body each and belong to equipment rather
than to a join. **No file carries a hardpoint name twice.**

**Shared names.** Over every body × head and body × hand pairing, which bone of the child the shared
name is on — the bone the walk would link:

| Name             | Pairings | On the child's |
| ---------------- | -------- | -------------- |
| `hp_head`        | 9,048    | root           |
| `hp_neck`        | 9,048    | detached bone  |
| `hp_upper torso` | 126      | detached bone  |
| `hp_lcollarbone` | 117      | detached bone  |
| `hp_rcollarbone` | 117      | detached bone  |
| `hp_left b` / `hp_right b` | 522 / 522 | root |
| `hp_left a` / `hp_right a` | 522 / 522 | detached bone |

None is on a bone with a chain parent, so **no retail pairing has a link the engine would refuse**,
and a head shares no name with a hand.

**Detached bones**: 156, all in heads and hands. 90 heads carry one, one carries two, 13 carry four;
every hand carries exactly one; no body carries any. None is listed after the last compound bone.

| Seat named       | Bones | Skinned to |
| ---------------- | ----- | ---------- |
| `hp_neck`        | 104   | 104        |
| `hp_upper torso` | 14    | 13         |
| `hp_lcollarbone` | 13    | 6          |
| `hp_rcollarbone` | 13    | 6          |
| `hp_left a`      | 6     | 4          |
| `hp_right a`     | 6     | 4          |

**Weight.** 539,362 influences across all levels of all 204 models; 24,891 of them — 4.61% — name a
detached bone, averaging 0.638 each.

|          | Skinned points | Touching a seam |
| -------- | -------------- | --------------- |
| `HEADS`  | 195,472        | 24,375 (12.47%) |
| `HANDS`  | 5,442          | 410 (7.53%)     |
| `BODIES` | 177,753        | 0               |

**Alignment** — the gap the game shows at rest. Mating the attachment hardpoint and comparing the
child's seam hardpoint against the host's of the same name, worst element of the 4×4:

| Deviation | Head × body (9,048) | Hand × body (1,044) |
| --------- | ------------------- | ------------------- |
| exact     | 4,425               | 580                 |
| `< 1e-3`  | 3,565               | 0                   |
| `< 0.01`  | 765                 | 0                   |
| `< 0.1`   | 85                  | 0                   |
| `≥ 0.1`   | 208                 | 464                 |

Worst overall: `br_darcy_body_torture.dfm` at 0.783 and `pl_male3_peasant_body_hurt.dfm` at 0.572,
both against every child. `worm.dfm` is excluded from both columns, having no attachment hardpoint.

Shoulder seams go unseated — and so destroyed — far more often than they are met: over the head × body
pairs, `hp_upper torso` is wanted and not offered 1,092 times, and each collarbone 1,014 times.

## TODO

### An unseated seam in game

The binary destroys a seam bone the host does not seat, which leaves its slot at `W(child root)⁻¹ ·
B(seam)` and should tear the vertices it carries towards the world origin. That is the arithmetic, not
a sighting, and retail cannot show it: the two costumes that leave shoulder seams unseated
(`ore_runner_female_1` and `web_bounty_hunter`) both put `sh_female2_head_gen.dfm` on
`pl_female2_journeyman_body.dfm`, and that head gives its three shoulder seams no weight — there is
nothing to tear. **Experiment:** declare a costume putting one of the 13 heads whose `hp_upper torso`
seam is weighted on one of the 78 costume bodies that do not offer it, and look at the shoulders.

### What reads `HpLeftConnect` and `HpRightConnect`?

Every hand carries one, on its root bone, and no retail binary names either. Nothing in a costume
shares the name with the hand — the body does not offer it — so the join walk never links it. They may
be the mount for held equipment, which would make them equipment hardpoints rather than costume ones,
but that is inference.

### The 19 unweighted seams

Seven of the 13 heads with shoulder seams give each collarbone bone no weight, one head declares an
`hp_upper torso` seam it does not use, and two hands of each side do the same at the wrist. Whether
the exporter emits the bone unconditionally, or those models once had geometry there, is not decidable
from the files.

*(Closed: which slots a multi-seam head drives — each seam is linked by its own name, `0x65f59d0`. Closed:
whether the seam is seated from the host or from the child's stored frame — from the child's, with the
host's hardpoint as the anchor; nothing is captured.)*

## References

- [DEFORMABLE.md](../modules/DEFORMABLE.md) — the format, what a detached bone is, and skinning
- [RENDERER.md](RENDERER.md) — §8 for the bone table and the skinning matrix
- [SECTIONS.md](SECTIONS.md) — `[Costume]`, `[Accessory]`, `[Skeleton]` and the other `bodyparts.ini` sections
- Retail `EXE/deformable2.dll` — `create` `0x65f36c0`, the join walk `0x65f59d0` and its callback
  `0x65f3540`, the destroy pass `0x65f3d00`, the skinning matrix `0x65f1030`; `engbase.dll` `0x6626690`
  for the hardpoint link; `Freelancer.exe` `0x4c9f00` for the part order and `0x4c9e20` for accessories
- Librelancer, `src/LibreLancer/Render/DfmSkeletonManager.cs` — `Connection` (`:37`), the three
  hardpoint triples (`:448`), `Update` (`:565`); `DfmSkinning.SetBoneData` (`:142`)
- MAXLancer, `scripts/Deformable.ms` — `BuildCostume` (`:747`), `BuildChild` (`:712`),
  `GetLastBoneIndex` (`:452`), the placeholder path (`:681`); `scripts/MAXLancer.ms:445`
