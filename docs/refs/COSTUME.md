# Costume

A character is not one model. A body, a head and two hands are four `.dfm` files with four skeletons,
joined at hardpoints — and the join is not only placement, because a head's lowest vertices are
skinned to a bone the head's own file does not define.

**No module, and there will not be one.** Reading the four files is `deformable/`'s already; which
head goes on which body is a costume INI this library does not interpret; composing the result is a
renderer's. What is left — *what the data says about how the pieces meet* — is measurable, so it is
written down here. Same shelf as [RENDERER.md](RENDERER.md).

Everything here is measured against retail `DATA/CHARACTERS`; the totals are in
[Corpus](#corpus).

## The pieces and the seats

|          | Files | Attachment hardpoint                        | Connector                                   |
| -------- | ----- | ------------------------------------------- | ------------------------------------------- |
| `BODIES` | 88    | offers `hp_head`, `hp_left b`, `hp_right b` | offers `hp_neck`, `hp_left a`, `hp_right a` |
| `HEADS`  | 104   | carries `hp_head`                           | wants `hp_neck`                             |
| `HANDS`  | 12    | carries `hp_left b` or `hp_right b`         | wants `hp_left a` or `hp_right a`           |

**Each join is two hardpoints, not one.** The *attachment* pair shares a name on both models — a body
and a head both carry `hp_head`, and mating them is what places the head. The *connector* is offered
by the host alone and is what the seam binds to; it sits one bone further up the host's chain, on the
bone the child's edge vertices have to follow. On `br_bartender_body.dfm`, `hp_head` is on `Body_Head`
and `hp_neck` is on `Spine3`, which is what makes a chin turn with the torso instead of with the skull.

87 of the 88 bodies carry all six. The exception is `worm.dfm`, which carries none of them and is not
a costume host at all.

## The seam is a detached bone, and it names its own seat

[DEFORMABLE.md](../modules/DEFORMABLE.md#detached-bones) already describes what a detached bone is: a bone
directory no `Cmpnd` part claims, carrying exactly one fixed hardpoint and nothing else, holding a
slot in the bone table that `Bone_id_chain` still skins to. This is what those bones are *for*.

**The hardpoint on a detached bone names the host hardpoint it must be seated on.** Every one of the
104 heads carries a detached bone whose hardpoint is `hp_neck`; every hand carries one whose hardpoint
is `hp_left a` or `hp_right a`; and the body offers a hardpoint of exactly that name. Nothing has to
be hardcoded and no table has to be kept — the child states its own requirement, and a host either
offers that name or does not.

That matters beyond tidiness, because the convention is not a single pair. 14 heads carry a second
detached bone wanting `hp_upper torso`, and 13 carry a third and fourth wanting `hp_lcollarbone` and
`hp_rcollarbone` — heads modelled with shoulders, which meet the body along three more frames. A
composer that reads the name off the bone gets those for free; one that knows about necks and wrists
alone silently drops them.

## Composing: the seam is the host's, both halves of it

Write `bind(b)` for a bone's forward bind pose in its own model's root space and `local(h)` for a
hardpoint's own transform on the bone that carries it, so a hardpoint's placement is
`bind(b) · local(h)`.

**`Bone to root` is stored as the inverse bind** — read it, do not invert it — so `bind(b)` is
`inverse(asRead(b))`. That is [RENDERER.md §8](RENDERER.md), and getting it backwards is the first
thing that goes wrong here: a body's bones come out scattered rather than mirrored, because a body's
bind pose is not its constraint chain and the error has nothing symmetric to hide behind.

**Placement.** Mate the attachment hardpoints — the child's root goes where the host's hardpoint of
the same name is:

```
child.root.world = host.world · placement(host, name) · placement(child, name)⁻¹
```

Same shape as a rigid model hung off a hardpoint, and the same caution applies: `placement` is the
hardpoint's *composed* transform in its model's own space, not the `local` on its bone. A head's
`hp_head` sits on its root, so the distinction is invisible there and costs nothing to keep.

**The seam.** The skinning matrix for an ordinary table slot is `pose · inverse(bind)`, both halves the
child's own. For a seam slot **both halves are the host's**, and the child's stored detached bone is
not one of them.

Write `S` for the host's connector placement expressed in the child's frame — `T⁻¹ · placement(host,
seam)`, where `T` is the placement transform above. Capture `S` once, when the costume is assembled
and both models are at bind. Then, every frame:

```
seam slot = S(now) · S(assembled)⁻¹
```

At rest the two are the same matrix and the slot is the identity, so the seam vertices sit exactly
where the child modelled them. When the host animates, `S(now)` moves and the slot becomes the delta,
so the child's edge follows the host's bone while the rest of the child follows the child. Nothing is
notified and nothing is recomputed per vertex — one slot of the child's bone table is written from the
host's pose pass instead of its own.

**Identity at rest is the whole point of capturing `S` rather than reading it.** The child does carry a
frame for its seam, and it is nearly always the same matrix — but *nearly* is the problem, and
[the next section](#the-seam-frame-is-per-rig-family-and-that-is-why-the-bind-is-captured-not-read)
is what it costs.

**When the host does not offer the name**, there is no `S` and the slot stays the identity, which is
the same thing the rest state gives: the seam vertices stay where the child put them rather than
collapsing to the origin. That is the common case for the shoulder seams — 14 heads want
`hp_upper torso` and only 9 bodies offer it.

## The seam frame is per rig family, and that is why the bind is captured, not read

If a child's stored seam frame always agreed with the host's connector, it could be read off the child
and the capture above would be a formality. It does not agree, and the way it fails is the argument for
capturing it.

Mating each head to each body and comparing the head's seam hardpoint against the body's hardpoint of
the same name, over all 9,048 mated pairs: **4,425 agree to the bit** and 3,565 more to within `1e-3`,
but 208 are `0.1` or worse on a figure 1.6 tall. The hands are starker — 580 exact, 464 at `0.1` or
worse, and **nothing in between**.

The split is not noise. Every body seats exactly either 60 of the 104 heads or 33 of them, never a
number in between, and every hand is exact on either 60 bodies or 25:

|            | Bodies | Heads seated exactly |
| ---------- | ------ | -------------------- |
| one family | 60     | 60                   |
| the other  | 25     | 33                   |
| neither    | 3      | 0                    |

Two rig families — read as male and female from the filenames, though nothing in the data says so —
plus three bodies that match nothing: `worm.dfm`, which offers no attachment hardpoint at all, and
`br_darcy_body_torture.dfm` and `pl_male3_peasant_body_hurt.dfm`, whose seams sit `0.78` and `0.57`
from where a head expects them.

Those two are the case that settles it. A costume is free to put any head on any body, so a
composer that read the bind off the child would open the neck of a bent body by half a unit **at
rest**, before a single frame of animation. Capturing `S` from the host at assembly cannot do that: it
is compared against the configuration it was taken from, so rest is identity whatever the pairing.

**So the child's stored seam frame is a record of what it was rigged against, not an input.** It is
worth reading — it says which host frame the artist had, and its disagreements are measurable, which
is the table above — and it is not what a renderer poses with.

## What the seam actually carries

Not a decoration: **4.61% of every influence in the corpus names a detached bone, at an average weight
of 0.638** — these are dominant influences, not a fringe. 12.47% of a head's points and 7.53% of a
hand's are touched by one, and no body point is, which is the asymmetry the whole arrangement is built
on: a host is never a guest.

19 of the 156 detached bones are skinned to by nothing at all, and **none of them is a neck**: seven
`hp_lcollarbone`, seven `hp_rcollarbone`, one `hp_upper torso`, and two of each wrist. The join every
costume has is always weighted; the ones a model may declare and not use are the optional ones. So a
composer may skip an unweighted seam entirely, and will never skip one that matters.

## What Librelancer does

Librelancer renders characters in-engine, so its arrangement is the closest thing to a second opinion
about what the game does — and it is where the rule above comes from rather than from reasoning.

`DfmSkeletonManager.Connection` (`src/LibreLancer/Render/DfmSkeletonManager.cs:37`) is the seam,
constructed from three hardpoint names and nothing else:

```csharp
HeadConnection      = new(BodySkinning, HeadSkinning,      "hp_head",    "hp_head",    "hp_neck");
LeftHandConnection  = new(BodySkinning, LeftHandSkinning,  "hp_left b",  "hp_left b",  "hp_left a");
RightHandConnection = new(BodySkinning, RightHandSkinning, "hp_right b", "hp_right b", "hp_right a");
```

`Transform` is the placement — `invChild * parent` in its row-vector convention, which is
`placement(host) · placement(child)⁻¹` — and it is recomputed every frame, so the child follows the
bone its attachment hardpoint hangs off. `invBindPose` is captured **once, in the constructor**:

```csharp
invBindPose = (BoneTransform(connectionHp, connectionBone) * Transform.Inverse()).Inverse();
Bone        = invBindPose * BoneTransform(connectionHp, connectionBone) * Transform.Inverse();
```

Both lines are the host's connector expressed in the child's frame — `S` above — the first at
assembly and the second now, so `Bone` is `S(now) · S(assembled)⁻¹` and is the identity at rest. The
child's own file contributes nothing to it.

**Where it goes** is the other half, and it is blunter than the derivation:

```csharp
if (Instances[i] != null) bonesBuffer.Data<Matrix4x4>(i + offset) = Instances[i]!.BoneMatrix;
else                      bonesBuffer.Data<Matrix4x4>(i + offset) = cb.Matrix();
```

`Instances` is sized by the highest `Cmpnd` part index and filled from the parts alone, so a detached
bone leaves a hole — and **every hole in the table gets the same connection matrix**. Librelancer does
read the `.3db` directories, including the detached ones, into `Bones` by name; the skinning table is
indexed by part, so they never reach it.

That is the same blind spot MAXLancer has, arrived at differently, and it has one visible
consequence: a head with shoulder seams gets its collarbones driven by the neck (when that shows,
and why it's a fixable inference rather than a settled fact, is in
[TODO](#which-slots-a-multi-seam-head-drives--the-one-this-document-would-still-get-wrong)). Reading
the hardpoint off the detached bone — which this library already does — is what fixes it, and it is
per-seam rather than per-child.

## What MAXLancer does, and where it differs

MAXLancer assembles costumes in `DeformableCompound.BuildCostume` (`scripts/Deformable.ms:747`), and
the mechanism is the same one with two pieces missing.

It does not read detached bones. `parts[]` is filled from the compound's constraints, so a bone no
constraint names is `undefined`, and the seam is discovered instead by scanning the *meshes*:
`GetLastBoneIndex` is `amax meshes[i].boneIndexChain` (`:452`), and any slot below it that no part
filled is the seam. Importing a head on its own logs *"Bone N is undefined. Creating placeholder"*
and stubs it with a dummy at identity (`:681`). That is direct confirmation that the dangling index is
a property of the data — and it is the same bone this library reads, named and hardpointed.

Because the bone is invisible to it, MAXLancer cannot read the seat off the hardpoint either, so
`BuildCostume` hardcodes the three pairs as string literals and derives the bind from the host:

```
bindTM = GetHardpointBoneTM connectorName * inverse (inverse (child.GetHardpointBoneTM attachmentName) * GetHardpointBoneTM attachmentName)
```

which is the host's connector expressed in the child's bind space — `S(assembled)`, the same quantity
Librelancer captures, reached by a different route. Two independent tools deriving the seam's bind from
the host rather than reading it off the child is the corroboration for doing the same.

The consequence of the hardcoding is the same one: only one seam per child is ever filled, so the 13
heads with shoulder seams get one connector and three placeholders.

One thing not to copy: its deformable path places the child with
`result.transform = inverse source.transform * target.transform` (`:725`), dropping the child-root
factor its own rigid path keeps (`MAXLancer.ms:450`). That is correct only while the child's root is
at identity, which is true of every retail head and hand and would not be true of a new one.

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
than to a join.

**Detached bones**: 156, all in heads and hands. 90 heads carry one, one carries two, 13 carry four;
every hand carries exactly one; no body carries any.

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

**Alignment.** Mating the attachment hardpoint and comparing the child's seam hardpoint against the
host's of the same name, worst element of the 4×4:

| Deviation | Head × body (9,048) | Hand × body (1,044) |
| --------- | ------------------- | ------------------- |
| exact     | 4,425               | 580                 |
| `< 1e-3`  | 3,565               | 0                   |
| `< 0.01`  | 765                 | 0                   |
| `< 0.1`   | 85                  | 0                   |
| `≥ 0.1`   | 208                 | 464                 |

Worst overall: `br_darcy_body_torture.dfm` at 0.783 and `pl_male3_peasant_body_hurt.dfm` at 0.572,
both against every child. `worm.dfm` is excluded from both columns, having no attachment hardpoint.

Shoulder seams go unseated far more often than they are met: over the head × body pairs,
`hp_upper torso` is wanted and not offered 1,092 times, and each collarbone 1,014 times.

## TODO

### Which head goes on which body

Nothing in this library says. The pairing is a costume declaration in INI — `bodyparts.ini` and the
`[Costume]` entries that name a head, a body and a pair of hands — and interpreting a section's
meaning is the consumer's, so the answer belongs in whatever builds the character rather than here.
What is measurable without it, and is measured above, is which pairings the *geometry* agrees with.

### Which slots a multi-seam head drives — **the one this document would still get wrong**

Both other tools fill *every* unclaimed slot of the child's table with a single connection matrix, so
the 13 heads with shoulder seams have their collarbones driven by the neck. This library can do better
— the hardpoint on each detached bone says which host frame that slot wants — but *better* here is
inference: nothing observed says the game distinguishes them, and it may well do exactly what these
two do. At rest the difference is invisible either way, since every unseated slot is the identity. It
shows only on a head with shoulders, on a body that moves them. Needs observation in game.

*(The broader question this replaces — whether the seam is seated from the host at all rather than
from the child's stored frame — is answered: MAXLancer and Librelancer both derive it from the host,
independently, and Librelancer captures it at assembly so that rest is the identity for any pairing.)*

### What reads `HpLeftConnect` and `HpRightConnect`?

Every hand carries one and nothing here needs it: the seam is named by the detached bone and the
placement by `hp_left b`. Neither MAXLancer nor Librelancer names them anywhere. They may be the mount
for held equipment, which would make them equipment hardpoints rather than costume ones, but that is
inference.

### The 19 unweighted seams

Seven of the 13 heads with shoulder seams give each collarbone bone no weight, one head declares an
`hp_upper torso` seam it does not use, and two hands of each side do the same at the wrist. Whether
the exporter emits the bone unconditionally, or those models once had geometry there, is not decidable
from the files.

## References

- [DEFORMABLE.md](../modules/DEFORMABLE.md) — the format, and what a detached bone is
- [RENDERER.md](RENDERER.md) — §8 for the inverse bind, the bone table and the skinning matrix
- Librelancer, `src/LibreLancer/Render/DfmSkeletonManager.cs` — `Connection` (`:37`), the three
  hardpoint triples (`:448`), `Update` (`:565`); `DfmSkinning.SetBoneData` (`:142`) for where the
  matrix lands, and `Utf/Dfm/DfmFile.cs:144` for why a detached bone leaves a hole
- MAXLancer, `scripts/Deformable.ms` — `BuildCostume` (`:747`), `BuildChild` (`:712`),
  `GetLastBoneIndex` (`:452`), the placeholder path (`:681`); `scripts/MAXLancer.ms:445` for the
  rigid counterpart
