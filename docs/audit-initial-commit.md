# Interlock Ergo — Audit of the first commit (historical)

> This review was written against the very first commit `d775957`. It is kept for
> the record and is **not** a description of the current tree. See
> [production-readiness-audit.md](production-readiness-audit.md) for the current
> state.

**Date:** 2026-11-05
**Auditor role:** Lead engineer, adversarial review
**Commit audited:** `d775957` (single initial commit, clean tree)
**Repository size:** 23 files, 891 lines total
**Method:** static review of every file + independent verification (OpenSCAD 2021.01
compile/export, mesh topology analysis, ZMK `main` source inspection, geometry
arithmetic harness, mutation testing of the test suite)

---

## 0. Verdict

**This is not a product. It is a well-written pitch deck with a placeholder CAD sketch
and firmware that cannot work.**

Three of the four advertised pillars are non-functional or do not exist:

| Pillar | Claimed | Actual state | Blocking? |
|---|---|---|---|
| 6-Y-H-N split layout | Works | ✅ Firmware matrix + keymap are internally consistent (tested) | — |
| Interlocking mechanical case | "Precision dovetail tabs + N52 magnets lock into a rigid unibody" | ❌ No switch cutouts, no plate, no PCB mounts, no bottom, magnets misaligned by 2.5 mm, dovetail cannot be slid together | **YES** |
| 2.4 GHz USB dongle | "Both halves connect wire-free to a dongle" | ❌ `CONFIG_ZMK_SPLIT` is never enabled → halves are standalone keyboards, dongle receives nothing | **YES** |
| Manufacturable PCB | Implied by pinout doc | ❌ Zero PCB files. Pinout documentation is wrong on 12 of 16 pins and contains a duplicated pin | **YES** |

**Readiness estimate:** ~15 % of the work required to produce a working, shippable
unit. Roughly 4–6 weeks of focused engineering (CAD rewrite, PCB design + 1–2
spins, firmware fix + bring-up, 2–3 print iterations). Not "days".

**The single most damaging finding:** the firmware enables no split transport at
all (`ZMK_SPLIT` is never set), so the flagship dongle feature is 100 % dead on
arrival. See §3.1.

---

## Severity legend

| Level | Meaning |
|---|---|
| **CRITICAL** | Product does not function, or hardware would be destroyed/unsafe, or money spent on fabrication is wasted. Must fix before any spend. |
| **MAJOR** | Will cause a failed build, an unusable part, a support burden, or a false marketing claim. Fix before shipping. |
| **MINOR** | Inconsistency, dead code, polish, or maintainability. Fix opportunistically. |

---

# 1. CAD & 3D Printing

## 1.1 What actually compiles

All three models compile cleanly under OpenSCAD 2021.01 (CGAL) and export STL
without warnings:

```
dongle_case.scad    : Simple: yes, Vertices: 156, Volumes: 2
interlock_dock.scad : Simple: yes, Vertices:  60, Volumes: 2
interlock_case.scad : Simple: yes, Vertices: 484, Volumes: 4
```

Edge-topology analysis of every exported mesh (boundary edges, edges shared by
>2 triangles, zero-area triangles):

| Mesh | Triangles | Boundary edges | Non-manifold edges | Degenerate tris |
|---|---|---|---|---|
| `left.stl` | 736 | 0 | 0 | 0 |
| `right.stl` | 592 | 0 | 0 | 0 |
| `dongle.stl` | 316 | 0 | 0 | 0 |
| `dock.stl` | 120 | 0 | 0 | 0 |
| `case_assembly.stl` | 964 | 0 | 0 | 0 |

**So: the meshes are watertight and edge-manifold. That is the only good news in
this section, and it is irrelevant, because the geometry is wrong.**

Do not be reassured by "Simple: yes". CGAL reporting a clean polyhedron says
nothing about whether the part is a keyboard case. It says nothing about the
2.5 mm magnet misalignment, the missing switch holes, or the parts that exceed the
printer bed.

---

## 1.2 Measured geometry (verified numerically, not eyeballed)

Emitted from an instrumented copy of the model's own constants:

```
box_wL                       140.35    (7u + 2*3.5)
box_wR                       178.45    (9u + 2*3.5)
box_h                        102.25    (5u + 2*3.5)
assembly dx                  139.85    (7u + 7 - 0.5)
left right-edge              140.35    -> bodies OVERLAP by 0.5 mm
MAGNET centre L              138.85
MAGNET centre R (assembled)  141.35    -> MISALIGNMENT 2.50 mm
pocket length                3.2
  L pocket spans             137.25 .. 140.45
  R pocket spans             139.75 .. 142.95   -> pockets OVERLAP by 0.70 mm
L pocket breach past face    0.10 mm
R pocket breach past face    0.10 mm
male tab protrusion          5.50 mm past the outer face
female socket cut depth      6.20 mm into a 5.50 mm wall
cavity z                     2.0 .. 14.0  (case top = 12.0)
encoder hole z               -12.0 .. +12.0  (vertical shaft through the floor)
dock overall bounding box    346.92 x 127.15 x 14.00 mm
dock cradle wall             2.0 mm, height above floor 10.0 mm vs case 12.0 mm
```

---

## 1.3 CRITICAL: there is no switch plate and no switch cutouts

`cad/interlock_case.scad:27` defines:

```openscad
module mx_switch_hole() {
    cube([switch_cutout, switch_cutout, plate_thickness + 2], center = true);
}
```

**`mx_switch_hole()` is never instantiated anywhere in the repository.** Neither
`left_half_case()` nor `right_half_case()` calls it. The `switch_cutout` and
`plate_thickness` constants are dead.

The consequence is total: the "case" is an open-topped tray, `2 mm` of floor plus
`3.5 mm` of perimeter wall. There is **nothing for a switch to clip into**. A
Kailh Choc or MX switch requires a plate with a 13.8 mm (Choc) / 14.0 mm (MX)
square aperture at 19.05 mm pitch, on a 1.2 mm (Choc) / 1.5 mm (MX) plate, at a
precise height above the PCB.

Also absent, and each individually blocking:

- **No PCB standoffs / mounting bosses / screw holes.** `grep -n "screw\|insert\|standoff\|boss" cad/*.scad` → zero hits. A PCB has nowhere to attach.
- **No bottom cover.** The cavity (`translate([wall,wall,2.0]) cube([...,case_depth])`) runs from z=2 to z=14 while the body ends at z=12, so the top is fully open and the underside is a bare 2 mm floor.
- **No controller bay.** No pocket sized for a nice!nano (17.8 × 33.0 mm) or an XIAO BLE (21 × 17.5 mm).
- **No battery pocket.** The architecture doc specifies a 500–800 mAh 503040 (≈30 × 40 × 5 mm). Nothing in the model accommodates it.
- **No plate-to-case registration** (no lip, no dowels, no ledge for the plate to sit on).
- **No reset-button access, no USB-C alignment feature** beyond an arbitrary 12.5 × 7 mm slot.

**This is a design sketch, not a case.** It cannot be printed into a keyboard.

**Remediation:** rebuild the case as a proper 4-part assembly — switch plate,
top frame (plate retention + switch apertures + controller bay), bottom shell
(PCB standoffs, battery pocket, JST relief, reset access), and the seam interface.
Keep the parametric constants; the scaffold is reusable.

---

## 1.4 CRITICAL: magnet pockets are misaligned by 2.5 mm and pierce the outer wall

Left half pocket centre: `box_wL - 1.5 = 138.85`.
Right half pocket centre in assembly coords: `139.85 + 1.5 = 141.35`.

**Δ = 2.50 mm.** Each pocket is only 3.2 mm long, so the two 3 mm magnets would
have to occupy overlapping space — they physically clash. The pockets overlap
each other by 0.7 mm. When the halves are docked, the magnets do not face each
other; they sit side-by-side and produce almost no axial attraction. The claimed
"pull together strongly" behaviour does not exist.

Two further defects in the same feature:

1. **Both pockets pierce the outer face by 0.10 mm** (`137.25…140.45` vs face at
   `140.35`; `-0.10…3.10` vs face at `0.0`). The result is a visible 6.2 mm
   circular witness mark on the outside of the case, and an escape path for CA
   glue and for the magnet itself under shock.
2. **No polarity keying, no glue relief, no press-fit interference.** A 6.2 mm
   pocket for a 6.0 mm magnet is 0.1 mm radial clearance — that is a *slip* fit,
   not a press fit (PETG, the recommended filament, needs ≈0.15–0.25 mm
   interference for a magnet to stay put). The assembly README then instructs the
   user to glue them in, which contradicts the "press-fit" instruction two lines
   above it.

**Remediation:**

- Derive the pocket X from the *assembly* datum, not from each half's own origin: `pocket_x_left = box_wL - 2.0`, `pocket_x_right = -2.0 + 2.0` expressed against the same seam plane.
- Add a mirrored `assembly_offset` constant and assert `|pocket_L_abs - pocket_R_abs| == 0` in an OpenSCAD `assert()`.
- Stop the pocket 0.6 mm short of the outer face (`2.4 mm` deep in a 3.0 mm wall + 0.6 mm skin).
- Pocket Ø 6.05 mm for a nominal 6.0 mm magnet (or Ø 6.15 for an easy fit + glue), with a 0.4 mm chamfer for lead-in.
- Add a small half-moon "polarity dot" emboss next to each pocket so the assembler cannot get N/S wrong (the current README relies on the user's memory).
- Use **2 magnets per seam minimum, preferably 4**, and place them *between* the dovetails, not in line with them.

---

## 1.5 MAJOR: the dovetail is an anti-dovetail, and it slides vertically, not horizontally

The male profile (`cad/interlock_case.scad:33`):

```openscad
polygon(points = [[0,-6],[6,-4],[6,4],[0,6]]);
```

Width at the base (x=0) is **12 mm**; width at the tip (x=6) is **8 mm**. A
dovetail must be *narrower at the base and wider at the tip* (an undercut) so the
joint resists separation. This is the inverse — a tapered tenon. Under any tensile
load along X it pulls straight out with no mechanical resistance whatsoever. The
only thing holding the halves together is friction and the (misaligned) magnets.

The female socket is the **same polygon uniformly offset by `interlock_tol`**:

```openscad
polygon(points = [[-0.1,-6-tol],[6+tol,-4-tol],[6+tol,4+tol],[-0.1,6+tol]]);
```

An offset copy of a tapered tenon is a tapered mortise. It has clearance on every
face simultaneously, so the joint has **0.2 mm of slop in every direction** and
neither a locating nor a retaining function. There is no interference in the
sliding direction, no lead-in chamfer, and no taper compensation between the two
halves' print shrinkage.

**And the extrusion axis is wrong.** `linear_extrude(height = case_depth - 2)`
extrudes the XY profile along **Z**. That means the dovetail can only be engaged by
**lifting one half 10 mm into the air and lowering it vertically** onto the other.
The README, the architecture doc, and the product pitch all say the halves "slide
together along the staggered seam". They cannot be slid together: the tab's 12 mm
base cannot pass through the socket's 8.4 mm waist in X. On a desk, in a lap, on a
tray table, the user must lift and drop.

**Also:** the seam is a straight vertical line. The file header claims it "Follows
row-stagger seam between 5-T-G-B and 6-Y-H-N" — but that split *is* a straight
vertical column boundary, so there is no stagger to follow. That is fine for the
keymap; it just means the header comment is misleading about a feature that
doesn't exist. A straight seam must resist bending and torsional moment on its
own, and this joint cannot.

**Remediation:**

- Invert the profile: `[[0,-5.0],[8,-6.0],[8,6.0],[0,5.0]]` — narrow throat, wide head.
- Extrude along **Y** (`rotate([90,0,0]) linear_extrude(...)`) so the halves slide together horizontally along the seam.
- Apply clearance on the **flanks only** (asymmetric offset), leaving the load-bearing faces with a light 0.05 mm interference and the sliding faces with 0.15 mm.
- Add a 0.5 mm × 45° lead-in chamfer on both tab and socket entry.
- Use **two tabs per half at 1/3 and 2/3 of the seam height**, not at 25 % / 75 % of the *box height* (which puts them asymmetrically relative to the key field and at the same Y as nothing in particular).
- Add a vertical locating pin/socket pair to kill the Z-slide degree of freedom that the current design leaves unconstrained.
- Print the sliding faces vertically (seam face parallel to the build plate) so layer adhesion is not the shear plane.

---

## 1.6 MAJOR: the female socket is a through-window in the seam wall

`interlock_female_socket()` cuts from x = −0.1 to x = 6.2, and the right half's
solid wall on the left edge is `0 … 5.5 mm` (wall 3.5 + the 2.0 mm inset added by
the cavity's `+ 2` term). **6.2 > 5.5**, so the socket cuts *entirely through* the
wall and 0.7 mm past the inner face.

Result: the right half has two ≈12 × 11 mm **holes** in its seam wall (the cut
spans y = ±6.2 and z = 1…12). Looking into the open top of the case you can see
straight out through the seam. When not docked, the electronics are open to the
outside. Structurally the seam wall is reduced to a pair of frames around two
large apertures.

The mirror-image defect on the left half is a **printability** one: the male tab
only overlaps the case footprint by 0.5 mm (`base x = box_wL − 0.5` vs wall face
`box_wL`) and the extrusion starts at `z = 1`. Printed upright on the bed, the
first 5.5 mm of the tab's footprint is a layer at z = 1.0 **floating above the
build plate**, attached to the part by a 0.5 mm sliver. That is a 10 mm-tall
unsupported overhang; it will sag, string, or detach. Either start the tab at
`z = 0` (so half of it is supported) or, better, redesign the joint as
recommended below.

**Remediation:** the socket must be a *blind* pocket. Either thicken the seam wall
to ≥ 9 mm locally, or shorten the tab to 3.0 mm engagement and keep the pocket
2.4 mm deep with a solid 1 mm back wall.

---

## 1.7 MAJOR: `case_depth = 12.0` is not derived from any switch or PCB stackup

The comment says the 12 mm internal depth is for "hot-swap sockets & battery".
Check:

| Stack (below top surface) | Choc v1 + hotswap | MX + hotswap |
|---|---|---|
| Plate | 1.2 | 1.5 |
| Plate→PCB gap (switch body) | 3.5 | 5.0 |
| PCB | 1.6 | 1.6 |
| Hotswap socket | 2.5 | 4.0 |
| Clearance for SMD diodes | 0.6 | 0.6 |
| **Subtotal** | **9.4** | **12.7** |
| Battery (503040, 5 mm) | — (no space) | — (no space) |
| Controller (nice!nano ~3.5 mm over PCB) | — | — |

12 mm is *just* enough for an MX hotswap stack with zero margin, and leaves no
volume for a battery or controller *below the PCB*. The design has no stackup
model, no `z` constants, and no interference check. The number 12.0 is arbitrary.

**Additionally:** the case has **no tilt/tenting**, no recessed underside, no
rubber feet pads, and no cable/antenna relief. The "5° tenting" claimed in
`interlock_dock.scad`'s header comment **does not exist in the geometry** — the
dock's cradles are flat-bottomed at z=0.

**Remediation:** define explicit stackup constants (`plate_t`, `plate_pcb_gap`,
`pcb_t`, `socket_t`, `battery_t`) and build the case from their sum plus a named
clearance. Add `assert(NO_BATTERY_CLASH)`.

---

## 1.8 MAJOR: the switch platform is left undecided, and the two options are not interchangeable

**First, a correction to my own initial read: `switch_cutout = 14.0` is correct for *both*
families, not MX-only.** Kailh's PG1350 drawing marks the plate aperture
**13.8 mm ± 0.2**, so the safe cutout is the *upper bound*, **14.0 × 14.0** — which
is exactly what ai03's plate generator emits (`SwitchChocCPG1350` hard-codes
`width = 14, height = 14`, with the reasoning written in its source). 13.8 is the
nominal/community figure and is tight against a max-tolerance switch. So the
constant is fine and I withdraw that part of the criticism.

The real problems in this section are different:

- **`plate_thickness = 1.5` *is* MX-only, and the failure is not cosmetic.** Choc v1's operative plate thickness is **1.2 mm**. Kailh's Choc stabilisers *only clip into a 1.2 mm plate* — Keebio: *"your plate must be 1.2mm thick so that the Choc stabilizers can clip into the plate properly. The stabilizers will not clip into thicker plates."* Every 2u key on this board depends on that. A 1.5 mm Choc plate silently produces rattling/loose stabilisers on the two space bars.
- **The retention features differ and both must be cut.** Choc v1: 3.45 mm centre post, two 1.9 mm side posts at ±5.5 mm, 1.2 mm pin drills at 5.42 mm diagonal spacing (pad 1 at `(0,−5.9)`, pad 2 at `(5.0,−3.8)`). MX: 4.0 mm centre post, 1.5 mm side posts, 1.5 mm plate. A 14.0 mm square hole is necessary but nowhere near sufficient for either.
- `architecture.md` BOM says "Kailh Choc v1 low profile **OR** Cherry MX / Gateron style switches". These are **mutually exclusive** choices that change plate thickness, post cutouts, PCB footprint, hotswap part number, stabiliser standard, case depth, and keycap vendor. The repository does not pick one, so no PCB or plate can be designed.

**Remediation:** pick one and delete the other from the BOM.

- **Kailh Choc v1** — lowest stack (~9.4 mm), best for travel, 1.2 mm plate, Choc-specific stabs. Constraint: 2.75u keycaps do not appear to exist (see §4.4).
- **Cherry MX** — everything fits, all keycap sizes exist, but the stack grows to ~12.7 mm and you must add MX plate-mount stab cutouts (11.938 mm cross spacing, Ø3.99 + Ø3.05 holes).
- **Kailh Choc v2 (PG1353)** — worth serious consideration and absent from the docs: identical electrical pin positions to v1, but **MX cross stem** and the **MX 14 × 14 mm / 1.5 mm plate standard**, so it takes any MX keycap at Choc spacing. Costs you a 5.05 mm centre hole and V2-only stabilisers. This is the option that resolves the wide-key/keycap problem in §4.4 without growing the stack.

Introduce `switch_spec = "choc_v1" | "choc_v2" | "mx"` and derive `switch_cutout`,
`plate_thickness`, `post_holes`, and `socket_clearance` from it. Note that **2u+
keys need stabiliser geometry** — there is none anywhere in the CAD, and a Choc
stab needs *both* a plate cutout *and* a PCB cutout.

---

## 1.9 MAJOR: the dock is 347 mm wide and cannot be printed on the target printer

Measured bounding box: **346.92 × 127.15 × 14.00 mm**, 171,083 mm³ of solid.

The README's recommended printer is an "Elegoo Centauri Carbon" — a **256 × 256 mm**
bed. The dock is 91 mm too wide. It also exceeds a Bambu A1 (256³), a Voron 0
(120²), and an Ender 3 (220 × 220). Only a 350 mm-class machine prints it.

Other defects in the same 39-line file:

- The "center bridge with wrist rest extension" (`translate([-30,-70,0]) cube([60,20,8])`) is a **separate, un-unioned solid**. In a slicer it becomes a disconnected body floating in space, not a bridge.
- The bridge sits at y = −70…−50 while the cradles are at y = −50…+57; they only touch along a plane, with no overlap. It is not attached.
- `dock_cradle_half()` walls are **2 mm** thick and only **10 mm** tall (`14 − 4`), while the keyboard case is **12 mm** tall — the case sits on the cradle floor and rises 2 mm *above* the retaining walls. There is no retention at all.
- No cutout for the interlock tabs (which protrude 5.5 mm), so the two halves cannot both be seated.
- Cradles are rotated ±6° with no corresponding change to the key field, so the two halves' rows are no longer aligned — the "Alice-style" splay is applied to the *receptacle* but the *keycaps* keep the grid spacing.
- No tenting, no rubber feet, no cable relief, no wrist rest, despite the header comment claiming tenting and a wrist rest.

**Remediation:** split into 4 printable parts (2 cradles + 2 bridge segments) with
dovetail or M3-screw joins; raise the retaining lip to 14 mm; add tab relief;
either model the tenting or delete the claim from the comment.

---

## 1.10 CRITICAL: the dongle case is an open corner shell, not an enclosure

`cad/dongle_case.scad` is 43 lines and only ever calls `dongle_bottom()`. There is
**no lid**, although `lid_h = 3.0` is declared at line 13 and the header comment
promises a "Snap-Fit Enclosure".

Worse, the PCB pocket is placed at negative coordinates:

```openscad
translate([wall - 2, wall - 2, wall])   // = (-0.4, -0.4, 1.6)
    cube([pcb_l, pcb_w, case_h]);       // 22 x 18.5 x 7.1
```

With `wall = 1.6`, that starts 0.4 mm *outside* the body on both X and Y, and
extends `case_h` from z=1.6 — i.e. through the entire top. Net effect:

- the **left wall is completely removed**,
- the **front wall is completely removed**,
- the **top is completely removed**.

What remains is an L-shaped corner of two walls plus a floor. It is not an
enclosure; it is a partial cradle.

Other defects:

- **Lanyard hole axis is wrong.** `cylinder(d=3.0, h=case_h*2, center=true)` at z=0 cuts a **vertical** through-hole — a 3 mm hole drilled straight down through the top. A lanyard needs a horizontal hole through the rear wall.
- **No snap-fit geometry.** No cantilever, no detent, no lip, no screw bosses. Zero of the promised feature.
- **No reset-button access** (required for double-tap UF2 entry), no vent, no chamfered USB-C lead-in.
- **PCB envelope is sized for one board only** (`pcb_l=22, pcb_w=18.5` ≈ XIAO BLE 21 × 17.5), yet `config/build.yaml` builds dongle firmware for **three** different boards: `seeeduino_xiao_ble` (21 × 17.5, USB-C), `nice_nano_v2` (17.8 × 33.0, USB-C on a different edge), and `nrf52840dongle_nrf52840` (**~12.6 × 41 mm, USB-A plug**). One case cannot hold all three, and a USB-C case cannot accept a USB-A dongle at all.

**Remediation:** delete the case or rewrite it as a proper two-part (base + snap
lid) enclosure for the **one** chosen dongle board. Parameterise `pcb_l/pcb_w`
and generate one file per board. Add a lid with a 0.4 mm snap bead, a reset pin
hole, and a USB-C overmould relief.

---

## 1.11 MINOR: CAD hygiene

- `$fn = 40` on a 6.2 mm cylinder is 40 segments on a 19 mm circle — over-tessellated for a 0.4 mm nozzle. Use `$fa = 2; $fs = 0.4;` for adaptive tessellation; the file is ~30 % larger than necessary.
- `rounded_cube()` rounds only the vertical edges (hull of 4 full-height cylinders). The part therefore has sharp top and bottom perimeters — exactly where a case wants a fillet.
- `interlock_tol` is applied to the *polygon vertices* by extending each point outward along both axes, so the actual clearance is not uniform (it is ~0.2 mm on the flanks but ~0.1 mm at the corners). It is not a geometric offset.
- `mode = "assembly"` is hard-coded at line 148 with no `-D` default documented; the README says "set mode" without saying how.
- No `.zmk.yml`-equivalent metadata, no version/revision constant, no `assert()` guards, no parameter validation block.
- `.gitignore` excludes `*.stl`, `*.3mf`, `*.gcode` — so no render artifacts are ever published for review. For an open-source hardware project, releasing the printable STLs as release artifacts is table stakes.

---

# 2. PCB & Electrical

## 2.1 Current state: nothing exists

`find` for PCB artifacts returns only YAML/CI files:

```
./config/build.yaml
./config/west.yml
./.github/workflows/build-zmk.yml
```

**There is no KiCad project, no `.kicad_sch`, no `.kicad_pcb`, no Ergogen YAML,
no netlist, no gerber, no BOM, no drill file, no STEP model, no footprint
library, no assembly drawing.** Zero of thirteen artifacts required to place a
PCB order.

The only electrical specification that exists is `docs/matrix_and_pinout.md` — and
it is wrong (§2.2).

## 2.2 CRITICAL: the pinout document is wrong on 12 of 16 pins and duplicates one pin

Verified against ZMK `main`:
`app/module/boards/nicekeyboards/nice_nano/arduino_pro_micro_pins.dtsi`

Ground truth:

| `&pro_micro` | nRF pin | | `&pro_micro` | nRF pin |
|---|---|---|---|---|
| 0 | P0.08 | | 14 | P1.11 |
| 1 | P0.06 | | 15 | P1.13 |
| 2 | P0.17 | | 16 | P0.10 |
| 3 | P0.20 | | 18 | P1.15 |
| 4 | P0.22 | | 19 | P0.02 |
| 5 | P0.24 | | 20 | P0.29 |
| 6 | P1.00 | | 21 | P0.31 |
| 7 | P0.11 | | | |
| 8 | P1.04 | | | |
| 9 | P1.06 | | | |
| 10 | P0.09 | | | |

Documented vs actual:

| Signal | Doc says | Actual | |
|---|---|---|---|
| Row 0 (`pm 4`) | P0.17 | **P0.22** | ✗ |
| Row 1 (`pm 5`) | P0.20 | **P0.24** | ✗ |
| Row 2 (`pm 6`) | P0.22 | **P1.00** | ✗ |
| Row 3 (`pm 7`) | P0.24 | **P0.11** | ✗ |
| Row 4 (`pm 8`) | P1.00 | **P1.04** | ✗ |
| Col 0 (`pm 18`) | P0.31 | **P1.15** | ✗ |
| Col 1 (`pm 15`) | P1.13 | P1.13 | ✓ |
| Col 2 (`pm 14`) | P1.11 | P1.11 | ✓ |
| Col 3 (`pm 16`) | P0.10 | P0.10 | ✓ |
| Col 4 (`pm 10`) | P0.09 | P0.09 | ✓ |
| Col 5 (`pm 1`) | P0.02 | **P0.06** | ✗ |
| Col 6 (`pm 0`) | P1.15 | **P0.08** | ✗ |
| Enc A (`pm 21`) | P0.29 | **P0.31** | ✗ |
| Enc B (`pm 20`) | "P0.02 / P0.26" | **P0.29** | ✗ |
| Right Col 14 (`pm 2`) | P0.06 | **P0.17** | ✗ |
| Right Col 15 (`pm 3`) | P0.08 | **P0.20** | ✗ |

**12 of 16 mappings are wrong.** The encoder-B line literally offers two
alternatives ("P0.02 / P0.26"), which is not a specification.

**Reserved-function collisions in the chosen pin set** (from `nice_nano-pinctrl.dtsi`):

| Pins used by the matrix | Board function | Conflict |
|---|---|---|
| `&pro_micro 0` (P0.08) | **uart0 RX** | USB logging, wired-split serial, `studio-rpc-usb-uart` snippet |
| `&pro_micro 1` (P0.06) | **uart0 TX** | same |
| `&pro_micro 2` (P0.17) | **i2c0 SDA** | any I²C device (OLED display, RTC sensor) |
| `&pro_micro 3` (P0.20) | **i2c0 SCL** | same |
| `&pro_micro 14/15/16` | spi1 MISO/SCK/MOSI | any SPI device |
| `&pro_micro 20/21` (P0.29/P0.31) | A2/A3, free | — |
| `&pro_micro 4–10` | free | — |

No battery-ADC conflict exists: nice!nano v2 measures the cell through **VDDH**
(`zmk,battery-nrf-vddh`, zero properties), not an ADC pin. The 11/12/13/17
gpio-map entries do not exist on a Pro Micro and are not used here — good.

So nothing is broken *today*, but the matrix has consumed the UART and I²C pin
pairs, which forecloses an OLED and collides with the Studio snippet shipped in
`build.yaml`. Free alternatives remain: `&pro_micro 9` (P1.06), `&pro_micro 19`
(P0.02). Decide before the PCB is routed, not after.

Why this is CRITICAL rather than cosmetic: **the `.overlay` files are electrically
correct because they use the `&pro_micro` alias.** Nobody would notice the error
until the PCB exists. Since this document is the *sole* wiring specification for
the PCB designer, anyone who lays out a board from it produces a board whose
netlist disagrees with the firmware on 12 of 16 nets. That board is scrap.

**Remediation:** regenerate the document *from* the DT source. Do not hand-write
it. Add a CI check that resolves `&pro_micro N` → `Px.yy` from the ZMK board DTS
and diffs it against the doc. Better: delete the prose table and ship a machine-
readable `docs/pinout.json` generated by a script.

## 2.3 CRITICAL: the two halves are asymmetric, so a reversible PCB is impossible

Left: 7 columns × 5 rows (34 keys) + EC11 encoder.
Right: 9 columns × 5 rows (42 keys).

A "reversible" (single-design, flip-to-use) split PCB works by making the two
halves **geometric mirrors with identical footprints**, so the same board can be
populated on either side. It requires:

1. Identical key count and positions on both halves (mirrored),
2. All footprints on one copper side with mirrored pads so the board works face-up or face-down,
3. Identical controller orientation.

The 34-vs-42 asymmetry and the left-only encoder break condition 1. **A
reversible PCB is not achievable for this design.** Two dedicated PCB designs are
required (or one 9-column design with the left half depopulated and 2 columns
unused — which wastes board area and forces the encoder onto both halves).

**Remediation:** commit to two dedicated boards, `pcb/left/` and `pcb/right/`.
This is not a compromise; it is the only correct answer for an asymmetric split.

## 2.4 MAJOR: the matrix does not match the advertised physical layout

`docs/kle_layout.json` encodes wide keys — 1.25u mods, 1.5u Tab, 1.75u Caps,
2.25u Enter, 2.25u Shift, **2.25u Space**, **2.75u Space** — but the CAD is a
uniform 19.05 mm grid, and the matrix transform has exactly **one** position per
wide key.

Consequences:

- A uniform 19.05 mm PCB cannot place a switch at the centre of a 2.25u key without breaking the grid: the switch position of a wide key is offset from its "cell". The PCB and plate must therefore be designed from the **actual key geometry**, not from a `7 × 5` grid.
- **Every key ≥ 2u needs a stabiliser.** MX 2u keys need PCB-mount or plate-mount stabs with holes at 11.938 mm centre spacing. There is no stabiliser geometry in the CAD, no stab cutouts in any plate, and no mention anywhere in the docs.
- **`docs/kle_layout.json` also inserts a 1u spacer at the seam on every row** (`{"x": 1}` between `5` and `6`). The CAD places the halves **0.5 mm overlapped**, i.e. no gap at all. Physical widths disagree by 19.05 mm: KLE implies 323.85 mm, CAD assembly is 318.30 mm. Neither document is authoritative.
- The README's ASCII diagram and the KLE agree with each other but not with the CAD.

**Remediation:** promote one machine-readable layout file (KLE JSON or a
`layout.yaml`) to be the single source of truth, and *generate* the matrix
transform, the plate cutouts, and the case layout from it. Add a CI job that
renders the KLE and diffs it against the CAD's key positions.

## 2.5 MAJOR: no power, battery, or protection design exists

`docs/architecture.md` BOM lists batteries and switches but nothing is specified:

- **No power switch circuit.** The case models a 9 × 4 mm hole for an "MSK-12D19 SPDT", but there is no schematic. The switch must sit between cell `+` and the controller's `BAT+` pad. On a nice!nano v2 this is mandatory — there is no on-board switch.
- **No battery connector choice, and my first pass got this wrong too.** The **nice!nano v2 has no JST connector at all** — the cell solders to two bare castellations at the top edge labelled **B+ / B−**. Only the XIAO BLE (also bare `BAT+/-` pads) and most off-the-shelf protected pouches come with JST-PH pigtails. So you must decide: (a) solder the cell's pigtail leads straight to B+/B− (simplest, but the cell becomes non-serviceable and the wires are a fatigue point), or (b) put a **JST PH 2.0 on the PCB** and wire it to B+/B− (serviceable, recommended). "JST" alone is ambiguous (PH 2.0 vs 1.25 vs 1.0) and the wrong choice means the cell will not plug in.
- **Charge rate is fixed at 100 mA on nice!nano** (≈85 mA actual) with a solder-jumper "boost" to ≈500 mA. A 500 mAh cell at 100 mA is C/5 — fine. Do not enable boost for a 500 mAh cell; it is only appropriate for ≥1500 mAh.
- **No protection circuit (PCM).** A raw LiPo pouch must not be discharged below ~2.75 V or charged without termination. Nice!nano's MCP73831 handles *charging* only; it provides no over-discharge or over-current protection. The cell must therefore be a **protected** cell (integrated PCM/DW01) or the board must carry a protection IC. The docs say nothing. Shipping an unprotected 500 mAh pouch inside a sealed PETG case that a user charges unattended is a **fire hazard**.
- **Battery reporting itself is fine — I initially flagged this incorrectly and corrected it.** nice!nano v2 measures the cell internally through VDDH: `app/boards/nicekeyboards/nice_nano/nice_nano_nrf52840_zmk_2_0_0.overlay` defines `chosen { zmk,battery = &vbatt; }` and `vbatt { compatible = "zmk,battery-nrf-vddh"; }` (no ADC pin, so no conflict with the matrix). `CONFIG_ZMK_BATTERY_REPORTING` is `imply`-ed under `ZMK_BLE` (`app/Kconfig:173`), so **each half reports its own level with no shield changes**. What is still broken is the *proxy*: `…_BATTERY_LEVEL_FETCHING` / `…_PROXY` only exist inside `if ZMK_SPLIT_ROLE_CENTRAL`, so §3.1 disables them and the dongle will never show the halves' levels. That is a consequence of §3.1, not a missing divider.
- **The matrix occupies the board's UART and I2C pins.** `&pro_micro 0` = P0.08 = **uart0 RX** and `&pro_micro 1` = P0.06 = **uart0 TX**; the left half uses both for columns 6 and 5. `&pro_micro 2` = P0.17 = **i2c0 SDA** and `&pro_micro 3` = P0.20 = **i2c0 SCL**; the right half uses both for columns 14 and 15. Nothing breaks today, but it makes two future features impossible: a status OLED (needs `&pro_micro_i2c`, i.e. pins 2/3 — already consumed by Backspace/Backslash/Del and PgUp/PgDn on the right half) and USB logging / wired-split serial (needs pins 0/1). And it *directly collides* with the `studio-rpc-usb-uart` snippet applied to the left half in `build.yaml`. If you ever want a display, remap the right half's two outermost columns to the free pins `&pro_micro 9` (P1.06) and `&pro_micro 19` (P0.02) **now**, before the PCB exists.
- **No decoupling, no ESD, no reset/bootloader button, no SWD pads** (needed for recovery if the UF2 bootloader is bricked).
- **No antenna keepout.** The nice!nano's 2.4 GHz antenna is at one end; the case wall and any copper/plate must be kept ≥5 mm clear. Nothing in the CAD or docs accounts for this, and a full aluminium or copper-clad plate would detune the antenna.

**Remediation:** add `docs/electrical-requirements.md` with the power tree
(cell → PCM → SPDT switch → controller BAT), connector MPNs, the divider values
(e.g. 1 MΩ / 1 MΩ into an ADC pin), and the antenna keepout as a hard constraint
in the case and plate models.

---

# 3. Firmware & ZMK Integration

## 3.1 CRITICAL: `CONFIG_ZMK_SPLIT` is never enabled — the entire split feature is off

`app/src/split/Kconfig`:

```
menuconfig ZMK_SPLIT
    bool "Split keyboard support"
```

**No default.** It must be enabled explicitly by a board/shield defconfig. Every
upstream split shield does exactly that:

```
app/boards/shields/kyria/Kconfig.defconfig:13:config ZMK_SPLIT
app/boards/shields/corne/Kconfig.defconfig:13:config ZMK_SPLIT
app/boards/shields/lily58/Kconfig.defconfig:14:config ZMK_SPLIT
app/boards/shields/sofle/Kconfig.defconfig:16:config ZMK_SPLIT
```

`config/boards/shields/interlock_ergo/Kconfig.defconfig` sets
`ZMK_KEYBOARD_NAME`, `ZMK_SPLIT_BLE_ROLE_PERIPHERAL`, `ZMK_SPLIT_BLE_ROLE_CENTRAL`,
`ZMK_SPLIT_BLE_CENTRAL_PERIPHERALS`, `ZMK_USB`, `ZMK_BLE` — **but never
`ZMK_SPLIT`.**

Knock-on effects, all verified in source:

1. `app/src/split/bluetooth/Kconfig` is wrapped in `if ZMK_SPLIT && ZMK_SPLIT_BLE`. With `ZMK_SPLIT=n`, `ZMK_SPLIT_BLE_ROLE_CENTRAL`, `ZMK_SPLIT_ROLE_CENTRAL`, and `ZMK_SPLIT_BLE_CENTRAL_PERIPHERALS` **do not exist as symbols**. Every assignment to them (in `Kconfig.defconfig` *and* in `interlock_ergo_dongle.conf`) is a Kconfig "undefined symbol" warning and is silently discarded.
2. The halves build as **two standalone BLE keyboards**. Each advertises itself to the host separately. Pressing `A` on the left and `B` on the right produces two interleaved HID streams — from the host's perspective, two keyboards.
3. The dongle builds as a **standalone keyless keyboard** with a mock kscan, a 16 × 5 transform, and no radio link to anything. It will enumerate as a USB HID device and type nothing, forever.
4. `CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_FETCHING` / `_PROXY` are also inside `if ZMK_SPLIT_ROLE_CENTRAL` → dropped.

The project's headline feature — "both halves connect wire-free over low-latency
2.4 GHz RF to a miniature USB dongle" — has **zero** implementation support in
the committed configuration. The GitHub Actions build will very likely go green,
which makes this worse: a green CI badge certifying firmware that cannot work.

**Fix (verified against upstream):**

```kconfig
# Kconfig.defconfig
if SHIELD_INTERLOCK_ERGO_LEFT || SHIELD_INTERLOCK_ERGO_RIGHT
config ZMK_SPLIT
    default y
config ZMK_KEYBOARD_NAME
    default "Interlock Ergo"
endif

if SHIELD_INTERLOCK_ERGO_DONGLE
config ZMK_SPLIT
    default y
config ZMK_SPLIT_ROLE_CENTRAL          # modern symbol; ZMK_SPLIT_BLE_ROLE_CENTRAL is legacy
    default y
config ZMK_SPLIT_BLE_CENTRAL_PERIPHERALS
    default 2
config ZMK_KEYBOARD_NAME
    default "Interlock Ergo"
endif
```

Note that `ZMK_SPLIT_BLE_ROLE_PERIPHERAL` **does not exist** in ZMK at all
(`grep` across `zmk-src` finds no such symbol). It appears to have been invented.
Peripheral is the default role; no symbol is needed. Likewise
`ZMK_SPLIT_BLE_ROLE_CENTRAL` still works but only as a legacy alias that
`select`s `ZMK_SPLIT_ROLE_CENTRAL` — use the modern name.

## 3.2 CRITICAL: `col-offset` is on the wrong node — the right half types left-half keys

`config/boards/shields/interlock_ergo/interlock_ergo_right.overlay`:

```dts
kscan0: kscan {
    compatible = "zmk,kscan-gpio-matrix";
    diode-direction = "col2row";
    col-offset = <7>;          /* <-- NOT A PROPERTY OF THIS BINDING */
    ...
};
```

The binding `app/dts/bindings/kscan/zmk,kscan-gpio-matrix.yaml` declares
`row-gpios`, `col-gpios`, `debounce-*`, `poll-period-ms`, `diode-direction`.
**There is no `col-offset`.** `col-offset` is a property of
`compatible = "zmk,matrix-transform"` (`app/dts/bindings/zmk,matrix-transform.yaml:13`)
and is consumed by `app/src/matrix_transform.c:78` (`column += mt->col_offset`).

Upstream Corne does it correctly — `app/boards/shields/corne/corne_right.overlay`:

```dts
&default_transform {
    col-offset = <6>;
};
```

Consequence in this repo: the right half's transform keeps `col_offset = 0`, so
the peripheral resolves its own physical (row, col) straight into the shared
16-column map. Its column 0 becomes `RC(r,0)` — the **left half's macro column**.
Its column 8 becomes `RC(r,8)`. Every key on the right half resolves to a
left-half key. Pressing `6` would emit `C_MUTE`; the number row would emit
`M1..M5`; etc.

(If your toolchain has `edtlib` warnings promoted to errors, this fails the build
outright instead — either way it is broken.)

**Fix:**

```dts
/* interlock_ergo_right.overlay */
#include "interlock_ergo.dtsi"

&default_transform {
    col-offset = <7>;
};

/ {
    kscan0: kscan { /* no col-offset here */ ... };
};
```

Also note the `&default_transform { ... }` form requires `default_transform` to be
a plain label reference — works, but the cleaner upstream pattern is to put the
shared transform in the `.dtsi` (already the case) and modify it by label.

## 3.3 CRITICAL: `interlock_ergo.conf` is never loaded

Zephyr applies exactly one shield Kconfig fragment, named after the shield:
`cmake/modules/shields.cmake:111`

```cmake
if(EXISTS ${SHIELD_DIR_${s}}/${s}.conf)
  list(APPEND shield_conf_files ${SHIELD_DIR_${s}}/${s}.conf)
```

For `SHIELD=interlock_ergo_left`, it looks for `interlock_ergo_left.conf`. The repo
has only `interlock_ergo.conf`. **The file is dead.** (This also explains the
legacy `corne.conf` in ZMK — it is dead there too; the real per-half files are
`corne_left.conf` / `corne_right.conf`.)

Therefore none of these apply to either half:

- `CONFIG_ZMK_SLEEP=y`
- `CONFIG_ZMK_IDLE_SLEEP_TIMEOUT=900000`
- `CONFIG_BT_CTLR_TX_PWR_PLUS_8=y`
- the split battery fetching/proxy settings

Result: halves never deep-sleep (≈10× worse battery life than advertised) and run
at default TX power. (`CONFIG_ZMK_BATTERY_REPORTING` itself survives because it is
`imply`-ed under `ZMK_BLE`, so battery percentage still works — see §2.5.)

**Fix:** create `interlock_ergo_left.conf` and `interlock_ergo_right.conf` with the
shared content (or a `boards/` per-board variant). `interlock_ergo_dongle.conf` is
already correctly named and *is* applied — but its contents are mostly dropped
because of §3.1.

## 3.4 MINOR: the dongle overlay duplicates `chosen` and uses `events = <0>`

```dts
mock_kscan: kscan_0 {
    compatible = "zmk,kscan-mock";
    columns = <0>;
    rows = <0>;
    events = <0>;
};
```

**This is largely correct and I initially over-flagged it.** It matches the
pattern in ZMK's own dongle documentation almost exactly
(`zmk.dev/docs/hardware-integration/dongle`), and `ZMK_KSCAN_MOCK_DRIVER` is
auto-enabled from devicetree `default $(dt_compat_enabled, …)`
(`app/module/drivers/kscan/Kconfig:99`), so no `.conf` line is needed. Using
`zmk,kscan-mock` is the *right* approach for a keyless central, because
`app/include/zmk/matrix.h` unconditionally requires `DT_CHOSEN(zmk_kscan)`.

Remaining nits, both cosmetic:

- `events = <0>` is a one-element array holding 0, which decodes via
  `dt-bindings/zmk/kscan_mock.h` as `ZMK_MOCK_RELEASE(0, 0, 0)` — a single
  release-no-press at boot. Harmless (ZMK ignores an unmatched release), but an
  empty array `<>` (as in `app/boards/shields/settings_reset/settings_reset.overlay`)
  expresses the intent better and avoids a zero-length-dimension mismatch.
- `interlock_ergo.dtsi` already sets `chosen { zmk,kscan = &kscan0; zmk,matrix_transform = &default_transform; }`
  and the dongle overlay re-assigns both. It works (dtc merges nodes and the last
  property assignment wins; the stale `&kscan0` phandle is discarded before fixup)
  but it is opaque — a reader cannot tell which `chosen` is live without knowing
  dtc merge semantics. Drop the `zmk,matrix_transform` re-assignment; the dtsi's
  is already correct.

## 3.5 MINOR: `sensor-bindings` on the right half and dongle is inert (fine)

The shared keymap declares `sensor-bindings` on all three layers, but only
`interlock_ergo_left.overlay` defines `zmk,keymap-sensors`. Verified benign:
`app/src/keymap.c` gates all sensor-bindings code on `ZMK_KEYMAP_HAS_SENSORS`,
and `CONFIG_ZMK_KEYMAP_SENSORS` is `depends on DT_HAS_ZMK_KEYMAP_SENSORS_ENABLED`,
so on the right half and dongle the code is compiled out with no warning. No
build failure, no action needed.

## 3.6 MINOR: dongle is one BLE connection short

`app/src/split/bluetooth/Kconfig.defaults` gives a split central
`BT_MAX_CONN = 6` and `BT_MAX_PAIRED = 6`. With two peripherals that leaves
**4** host profiles, not the 5 ZMK normally offers. The ZMK dongle docs
explicitly recommend `BT_MAX_CONN` / `BT_MAX_PAIRED` = peripherals + 5 = **7**.

```kconfig
config BT_MAX_CONN
    default 7
config BT_MAX_PAIRED
    default 7
```

## 3.7 MAJOR: no `settings_reset` shield, no recovery path

`grep -rn settings_reset config/` → nothing. `build.yaml` builds only the three
product shields.

When BLE split bonds go stale (extremely common: reflash one half, change
`ZMK_KEYBOARD_NAME`, move the dongle), the halves will refuse to connect and the
board appears bricked. The only recovery is a `settings_reset` firmware image,
which does not exist here. Every mature ZMK config builds one per board.

**Fix:** add to `config/build.yaml`:

```yaml
  - board: nice_nano_v2
    shield: settings_reset
```

## 3.8 MAJOR: CI never runs the only test, and fires on the wrong paths

`.github/workflows/build-zmk.yml`:

```yaml
on:
  push:
    paths:
      - ".github/workflows/**"
      - "config/**"
```

- `tests/test_matrix.js` is **never executed in CI**. `grep -n "node\|npm" .github/workflows/build-zmk.yml` → nothing. The one piece of verification in the repo is manual-only.
- Changes to `cad/**` or `tests/**` do not trigger any CI.
- There is no OpenSCAD compile check, no STL artifact publication, no gerber diff.

## 3.9 MAJOR: the test suite gives false confidence

`node tests/test_matrix.js` passes:

```
Found 76 matrix positions in default_transform.
Left half matrix keys: 34, Right half matrix keys: 42
Layer 'default_layer': 76 keybindings parsed.
✓ All matrix, keymap, and 6-Y-H-N assertions passed successfully!
```

But mutation testing shows it will not catch the failures that matter. I applied
each mutation to a copy of the repo and re-ran the suite:

| Mutation | Real-world impact | Test result |
|---|---|---|
| Swap `RC(0,6)` and `RC(0,7)` in the transform | `6` moves to the **left** half — destroys the core product thesis | ✅ **still passes** |
| Replace `RC(3,15)` with a duplicate `RC(3,14)` | Two keys share one matrix position; one switch dead | ✅ **still passes** |
| Delete a keybinding from the default layer | 75 keys for 76 positions | ❌ correctly fails |

So it catches only binding-count drift. Why the others pass:

- The test extracts positions with `rcMatches` (`RC(0,0)`, …) but never checks **uniqueness** or **monotonicity** — hence the duplicate slips through.
- The 6/Y/H/N assertions read `tokens[7]`, `tokens[23]`, `tokens[39]`, `tokens[53]` — **hard-coded indices** that assume the exact current row lengths. They compare keymap tokens against keymap tokens; the transform's column assignment is never consulted. Changing which physical position feeds which token is invisible to the test.
- It validates the *keymap file*, not the *firmware*. It cannot see `ZMK_SPLIT`, `col-offset`, or `.conf` naming. Every CRITICAL bug in §3.1–§3.3 passes this suite.

**Fix:** rewrite the validator to (a) parse the transform map into a `Map<position, key>` and assert no duplicate positions, (b) parse the overlays for `row-gpios`/`col-gpios` counts and assert `cols × rows` covers the transform, (c) assert `<shield>.conf` exists for every shield in `Kconfig.shield`, (d) assert `ZMK_SPLIT` is set in `Kconfig.defconfig`, (e) assert each `.overlay`'s `col-offset` is on a transform node. All of those are cheap string checks that would have caught four CRITICALs.

## 3.10 MINOR: documentation inaccuracies

- `architecture.md` claims "3 to 6 months per charge with deep sleep" from a 500 mAh cell. A connected nRF52840 peripheral with a 15-min idle sleep draws roughly 0.5–1.5 mA average, and `CONFIG_BT_CTLR_TX_PWR_PLUS_8=y` raises peak TX current to ~14.8 mA. 500 mAh ÷ 1 mA ≈ 500 h ≈ **3 weeks**. The claim is off by roughly 4–8×. Delete it or measure it.
- The README calls the macro column "M1–M4" but the keymap binds `C_PLAY_PAUSE`, `PSCRN`, `C_AL_CALC` — no macros anywhere.
- `docs/architecture.md` says the `6`-on-the-left problem is endemic to split boards. It is not: Corne, Lily58, Sofle, Iris, Kyria and the Alice family all place `6` on the right half. The market gap this project claims to fill is already occupied by the best-selling boards in the category. This does not break the build; it does undermine the pitch and should be corrected before any public launch.
- `CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_FETCHING` is a `menuconfig` — valid, but it only matters once §3.1 is fixed.
- `ZMK_KEYBOARD_NAME` set per half is meaningless in a split (only the central's name is advertised). Harmless.
- `snippet: studio-rpc-usb-uart` is applied to the **left half**, which is a peripheral. ZMK Studio's RPC requires `CONFIG_ZMK_STUDIO` (not set anywhere) and, for split, that the RPC run on the **central** (`app/src/studio/Kconfig:6`: `select ZMK_STUDIO_RPC if !ZMK_SPLIT || ZMK_SPLIT_ROLE_CENTRAL`). As written, the snippet adds a USB CDC-ACM UART to the peripheral for no reason and consumes flash/RAM. Remove it from the left half and add `CONFIG_ZMK_STUDIO=y` to the **dongle** config if Studio support is wanted.

---

# 4. Manufacturing & Sourcing Roadmap

## 4.1 What must exist before spending a cent

Order of operations matters — each step gates the next:

```
1. Fix firmware (ZMK_SPLIT, col-offset, .conf names)     ~1 day
2. Choose switch platform (Choc v1 vs MX) — final        ~1 hour
3. Fix pinout doc from DT source                         ~2 hours
4. Freeze the physical layout (one machine-readable file) ~1 day
5. Design PCB L + PCB R in KiCad 8 (or Ergogen + KiCad)   ~1 week
6. Design plate L + plate R                               ~2 days
7. Rewrite case as plate/frame/shell assembly             ~1 week
8. Print case v1, dry-fit switches + PCB (no electronics) ~3 days
9. Order PCB rev A, populate 1 half, bring-up             ~2 weeks lead
10. Iterate case v2, order PCB rev B if needed            ~2 weeks
11. Assembly + QA on 1 unit, then batch                   —
```

Steps 1–3 cost nothing and unblock everything. **Do not order PCBs before step 4**
— an unfrozen layout means a $0 PCB is actually a $60 re-spin plus three weeks.

## 4.2 PCB fabrication — JLCPCB

Two orders (left and right), 2-layer, since reversibility is impossible (§2.3).

| Parameter | Left | Right |
|---|---|---|
| Board outline | ~143 × 105 mm | ~181 × 105 mm |
| Layers | 2 | 2 |
| Thickness | 1.6 mm (do **not** use 1.2 — hotswap sockets rely on 1.6 mm retention) | 1.6 mm |
| Copper | 1 oz | 1 oz |
| Surface finish | ENIG (HASL is fine if cost-driven; ENIG is better for the fine-pitch hotswap pads) | ENIG |
| Min trace/space | 0.15 / 0.15 mm (well inside JLCPCB's 0.127 mm capability) | same |
| Min drill | 0.3 mm | same |
| Soldermask | any (matte black looks premium, no functional difference) | same |
| Silkscreen | key legends + pinout labels + revision | same |
| Mounting holes | 4 × M2.2 plated, at the case bosses | same |
| Fiducials | 3 × 1 mm on the bottom side if using PCBA | same |
| Panelisation | single design, 5 pcs minimum | single design |

**PCBA (SMT assembly) — and why you should skip it for rev A.**

JLCPCB's *Economic* PCBA is **single-sided placement, 2–50 pcs, 0.8–1.6 mm
thickness, standard stack-up, no fiducials or rails required**. Published fees
(Oct 2026 table):

| Fee | Amount |
|---|---|
| Setup | $8.18 per order |
| Stencil | $1.53 per order |
| SMT | $0.0016 per joint |
| Pre-reflow soldering | $0.016 per joint (for parts that need it) |
| Feeder loading | $3.07 per *extended* part |
| Hand-solder labour | $3.58 per order |
| Panel fee | $8.18 × (designs − 1) |
| **Large-size surcharge** | **$57.46 when total order area > 650 cm²** |

That last line is the killer and it is easy to miss. One 175 × 95 mm board is
**166 cm²**; five of them is **830 cm²**, well past the threshold. Because this
project needs **two different designs** (§2.3), you pay the surcharge **twice**:
**$114.92 of pure overhead** on a 5-set order.

Two consequences worth acting on:

1. **Order 3 pcs, not 5, when you use PCBA.** 3 × 166 = 498 cm² — under the 650 cm² line. Three boards is plenty for a first article.
2. **For rev A, skip PCBA entirely and hand-solder.** Every part on this board is hand-solderable: SOD-123 diodes, hotswap sockets, 2.54 mm headers, a slide switch and a JST. 76 diodes + 76 sockets ≈ 2.5 h per half. That is cheaper than $115 of surcharge plus setup, stencil and feeder fees.

**Correction to my first pass: the Kailh Choc hotswap socket *is* a JLCPCB
catalogue part.** `CPG135001S30` is stocked as **C5333465 at ~$0.21**, so "you
can't get sockets assembled" is not true — the argument against PCBA is purely
the surcharge arithmetic above, not parts availability. (MX `CPG151101S11` is
also library-stocked.)

Parts to place, whichever route you take: **76 × hotswap socket**, **76 × 1N4148W
SOD-123**, 1 × JST-PH 2.0 (or none — see §2.5), 1 × SPDT slide switch, 2 × 12-pin
2.54 mm female header (or castellate the controller), 1 × tact switch (reset),
2 × 100 nF. All SMD parts go on the **bottom** side, opposite the switches.

**Cost, 5 complete keyboards (5 left + 5 right), indicative — run a live quote:**

| Item | 5 sets, ENIG | Notes |
|---|---|---|
| Bare PCB × 2 designs | $40–64 | $20–32 each; HASL is $8–14 each |
| **Hand-solder route — total** | **≈ $200–230** | ≈ **$40–46/set**; PCB + parts + shipping, no PCBA overhead |
| **PCBA route — overhead alone** | **$159** | 2 × (setup 8.18 + stencil 1.53 + feeder 12.28 + surcharge 57.46) |
| PCBA route — total | ≈ $355–390 | ≈ **$71–78/set** |

So: **hand-solder rev A, re-evaluate PCBA at 10+ sets** where the two $57.46
surcharges amortise (10 × 166 = 1660 cm², so the surcharge does not scale down —
it becomes ~$11/board, at which point PCBA wins on labour).

## 4.3 Switch plate — pick one of three

| Option | Thickness | Pros | Cons | Cost for a pair |
|---|---|---|---|---|
| **3D printed (PETG/PLA)** | 1.2 (Choc) / 1.5 (MX) | Free, iterate in hours, integrated with the case, matches the case colour | Switch fit tolerance varies with extrusion; 19.05 mm pitch over 181 mm = 0.1 % accuracy needed; PETG creeps under switch retention force | $0.50–1.50 filament |
| **Laser-cut POM (Delrin) / acrylic** | 1.2 for Choc, 1.5 for MX | Dimensionally exact, best switch feel, no creep, classic keyboard-plate material | Needs a laser vendor (SendCutSend, Ponoko, local maker space), ±0.1 mm kerf to design around, 2–3 day turnaround, no integrated features | $25–45 per pair (SendCutSend 1.2/1.5 mm POM) |
| **FR4 from JLCPCB** | **1.2 for Choc, 1.6 for MX** (**1.5 is not stocked** — JLCPCB lists 0.4/0.6/0.8/1.0/1.2/1.6/2.0/2.5/3.0) | Cheapest "exact" option, can double as the plate *and* carry legends/masking, arrives with the PCBs | Brittle in thin webs (5.05 mm webs are OK), no copper needed so order it as a bare board; 1.6 is 0.1 mm over the MX 1.5 spec | $8–15 for 5 pcs |

**Recommendation:** ship the model with a **3D-printed plate** — but note the
constraint that follows from §1.8: if you go Choc, the printed plate must be
**1.2 mm**, not the 1.5 mm the model currently assumes, or the stabilisers will
not clip. Offer **1.2 mm FR4** as the premium Choc option and **1.6 mm FR4** for
MX. Use POM only for a group buy.

If you go FR4: order it as a standard 2-layer board, 1.2 mm, **no copper pour, no
soldermask on the switch apertures** (mask in the holes makes switches tight), and
add the case mounting holes to the same order.

## 4.4 Switches, keycaps, and the wide-key problem

**Choc v1 (recommended for travel):**

- Switches: Kailh Choc v1 PG1350 — Red (linear, 50 gf), Brown (tactile, 45 gf), White (clicky). ~$0.35–0.50 each in 100s. Sources: Kailh direct, KPrepublic, NovelKeys, Mechbox, splitkb.com.
- Hotswap: Kailh CPG135001S30, ~$0.30 each.
- Keycaps: **1u, 1.5u, 1.75u, 2u and 2.25u all exist in Choc v1** — I initially claimed 1.75u/2.25u were unobtainable and that was wrong. MBK Convex covers 1U/1.25U/1.5U/1.75U/2U/2.25U; MBK blanks cover 1u/1.5u/2u (17.5/26.5/35.5 × 16.5 mm) with *"stabilizer support: as per Kailh's specifications (2u only)"*. **The one genuine gap is 2.75u** — no Choc-v1 vendor was found selling it, and that is exactly the right-hand space bar in the KLE. 2.75u is the single keycap blocking the advertised layout.
- **Choc stabilisers are Kailh's own, not MX.** They mount *between the PCB and the plate*, need a PCB cutout, and *require* a 1.2 mm plate (*"will not stay in place if either the PCB or the plate is missing"*). Kit spacing: 6.25u at 100 mm cross-centre, 2u at 25 mm. None of this geometry exists in the CAD or docs.
- **This is why Choc v2 is worth considering** (§1.8): MX cross stem ⇒ any MX keycap including 2.75u, still Choc spacing, still low profile.

**MX (only if the wide keys are non-negotiable):**

- Switches: Gateron Oil King / Milky Yellow / Boba U4T, $0.30–0.60.
- Hotswap: Kailh CPG151101S11.
- Keycaps: every size exists (GMK, ePBT, Akko, clones). 2u+ needs **PCB-mount stabilisers** — add stab holes to the PCB and plate.

**Remediation:** either (a) normalise the layout so no key exceeds **2.25u** (then all Choc sizes exist), (b) switch to **Choc v2** for MX keycaps at Choc spacing, or (c) commit to MX and accept a 12.7 mm stack plus stab cutouts. Do not ship a layout whose right space bar is a size nobody sells.

## 4.5 Battery

- Chemistry: 3.7 V Li-ion pouch, **with integrated PCM protection** (over-charge, over-discharge, over-current, short). Do not buy bare cells. Adafruit sells protected cells with a JST-PH plug; generic protected 503040 cells are common on AliExpress but QA is a lottery — for a first article, buy from Adafruit/SparkFun/Pimoroni.
- Capacity target: **400–600 mAh**. **503035** (5.0 × 30.5 × 35 mm, 500 mAh, **supplied with PCM**) is the sweet spot and is what Adafruit sells as PID 1578 for **$7.95** — its datasheet specifies a **3.0 V** protection cut-out. Caveat: 30.5 mm is 0.5 mm wider than a strict 30 mm pocket, so model the pocket at 31 × 36 × 5.5 mm. If that will not fit, **402030** (4 × 20 × 30 mm, 200–420 mAh with PCM) is the safe fallback and still gives ~2–3 weeks.
- Connector: **the nice!nano has no JST** — it has bare **B+ / B−** pads. Either solder the cell's pigtail leads straight on (non-serviceable) or, better, fit a **JST PH 2.0 on the PCB** and wire it to B+/B−. The XIAO BLE is the same story (`BAT+/-` castellations on the back).
- Charge rate: nice!nano charges at **100 mA fixed** (≈85 mA actual), with a solder-jumper boost to ≈500 mA. A 500 mAh cell at 100 mA is C/5 — correct. **Do not enable the boost** below ~1500 mAh.
- **Add a physical barrier:** a 0.5 mm PETG or fishpaper sheet between the cell and the PCB. A punctured pouch inside a printed case is the classic DIY-keyboard fire.
- **No divider needed with nice!nano.** It measures the cell through VDDH (`zmk,battery-nrf-vddh`), so battery percentage works out of the box. If you swap to a controller without internal sensing, you must add `chosen { zmk,battery = &vbatt; }` plus a `zmk,battery-voltage-divider` node with two 1 MΩ resistors from BAT+ to GND and the midpoint on an ADC pin. Do **not** copy that divider onto a nice!nano build — it would double-count.

## 4.6 Ergogen vs KiCad 8

| | Ergogen | KiCad 8 |
|---|---|---|
| Input | YAML points/outlines/PCBs | Schematic + layout |
| Strength | Rapid, parametric, matrix/diode routing generated for you, ideal for split keyboards | Full control, DRC, 3D, real library management, better for a non-grid layout with wide keys and stabs |
| Weakness | Its output is a generated, **unrouted** `kicad_pcb` you then finish in KiCad anyway; weak support for stabilisers and asymmetric per-half outlines | Slow to author from scratch, easy to make a matrix wiring error |
| Maintenance | Actively maintained — canonical repo is now **`ergogen/ergogen`** (MrZealot's has moved), last push Nov 2025; ships both `kicad5` and **`kicad8`** templates; needs **v4.1.0+** with `ceoloide/ergogen-footprints` for KiCad 8 | — |
| Verdict for this board | Good for the ≤19.05 mm grid part; its built-in `choc` footprint supports `hotswap: true` **and** `reverse: true` simultaneously | **Required** for the wide keys, stabilisers, encoder placement, and two asymmetric outlines |

**Recommendation:** use **KiCad 8** as the source of truth. Use Ergogen only as a
throwaway generator if you want a first-pass matrix to copy. Rationale: the layout
is not a pure grid (wide keys, encoder, asymmetric halves), and Ergogen has no
first-class concept of stabilisers or per-half outlines.

Author the footprints from a maintained library rather than hand-drawing:
`marbastlib` (KiCad 7/8 keyboard footprints, includes Choc hotswap, MX hotswap,
nice!nano, stabilisers, and reversible variants) is the pragmatic choice.

## 4.7 Gerber release checklist

1. `pcb/left/interlock_left.kicad_pro`, `pcb/right/interlock_right.kicad_pro` under version control.
2. Run DRC with the JLCPCB rule set (0.15 mm trace/space, 0.3 mm drill, 0.5 mm annular ring) — zero errors, zero unconnected.
3. Plot: `F.Cu B.Cu F.Paste B.Paste F.SilkS B.SilkS F.Mask B.Mask Edge.Cuts` + Excellon drill + `.gbrjob`. **Verify `Edge.Cuts` is a single closed polyline.**
4. JLCPCB gerber viewer: upload, confirm no "board outline not closed" and no "drill outside board".
5. BOM (`bom.csv`) and CPL (`positions.csv`) in JLCPCB format: `Comment, Designator, Footprint, LCSC` and `Designator, Mid X, Mid Y, Layer, Rotation`.
6. Tag the release, attach gerbers + STLs + plate DXF + BOM + assembly drawing.
7. Order **5 pcs rev A. Populate one half by hand. Do not order 50.**

## 4.8 Summary BOM with indicative pricing (one complete keyboard)

| Item | Qty | Unit | Total |
|---|---|---|---|
| PCB L + R (amortised from a 5-set order) | 1 set | $8–13 | $8–13 |
| Plates (3D printed) | 1 pair | $1 | $1 |
| Case (3D printed, PETG, ~120 g) | 1 set | $3 | $3 |
| Kailh Choc v1 switches | 76 | $0.40 | $30 |
| Kailh Choc hotswap sockets | 76 | **$0.21** | $16 |
| 1N4148W SOD-123 | 76 | $0.02 | $1.50 |
| nice!nano v2 | 2 | $25 | $50 |
| Dongle controller (XIAO BLE) | 1 | $12 | $12 |
| Protected LiPo **503035** ~500 mAh with PCM | 2 | **$7.95** | $16 |
| SPDT slide switch | 2 | $0.60 | $1.20 |
| EC11 encoder | 1 | $2 | $2 |
| JST PH 2.0 (PCB-mounted) | 2 | $0.50 | $1 |
| M2 screws + heat-set inserts | 8 | $0.10 | $0.80 |
| 6×3 mm N52 magnets | 4 | $0.25 | $1 |
| Keycaps (MBK Convex, 1u/1.5u/1.75u/2u/2.25u — **no 2.75u exists**) | 1 set | $50 | $50 |
| **Total, one unit, single quantity** | | | **≈ $195–205** |
| **At a 10-unit batch** | | | **≈ $165–175/unit** |

The controllers are **38 %** of unit cost and do not scale. There is no way to
reach the README's implied "cheaper than $250 boutique boards" positioning with
this BOM without either (a) using a bare nRF52840 module instead of nice!nano, or
(b) selling kits.

This undercuts the README's implied positioning against "$250+ boutique boards"
by only a small margin, and it is *before* assembly labour. The pricing story is
weaker than the README implies.

---

## 4.9 Vendor sourcing

All prices are indicative, single-unit, and should be re-quoted. Links are
starting points, not endorsements.

**Electronics**

| Part | Where | Indicative |
|---|---|---|
| nice!nano v2 | typeractive.xyz, splitkb.com, keycapsss.com, mechboards.co.uk | $25 |
| Seeed XIAO nRF52840 (BLE) | seeedstudio.com, Digi-Key, Mouser | $12–15 |
| Nordic nRF52840 Dongle PCA10059 | Digi-Key, Mouser, nordicsemi.com | $10–15 |
| Kailh Choc v1 PG1350 (Red/Brown/White) | splitkb.com, typeractive.xyz, lowprokb.ca, NovelKeys, KPrepublic | $0.35–0.50 |
| Kailh Choc hotswap socket CPG135001S30 | **JLCPCB catalogue C5333465**, or splitkb.com / keycapsss.com / typeractive.xyz / lowprokb.ca | **$0.21** |
| Kailh MX hotswap CPG151101S11 (if MX) | splitkb.com, NovelKeys, LCSC | $0.20–0.30 |
| 1N4148W SOD-123 | LCSC (JLCPCB library), Digi-Key, Mouser | $0.01–0.03 |
| JST PH 2.0 2-pin (SMT or TH) | LCSC, Adafruit, Digi-Key | $0.20–0.60 |
| SPDT slide switch (MSK-12D19 or EG1218) | LCSC, AliExpress; EG1218 at Digi-Key | $0.40–1.50 |
| EC11 encoder, 20 detent, push switch | Bourns PEC11R at Digi-Key/Mouser; generic EC11 on AliExpress/LCSC | $1.50–4.00 |
| 2.54 mm 1×12 female header (socket the controller) | LCSC, Digi-Key | $0.30 |
| Protected LiPo **503035** ~500 mAh with PCM | **adafruit.com PID 1578** ($7.95, 3.0 V cut-out), sparkfun.com, pimoroni.com | $8–12 |
| 6 × 3 mm N52 disc magnets | kjmagnetics.com (US), supermagnete.de (EU) | $0.15–0.30 |
| M2 × 6 screws + M2 heat-set inserts | CNC Kitchen / Ruthex (EU), Amazon, AliExpress | $0.10/set |

**Fabrication**

| Service | Where | Notes |
|---|---|---|
| PCB fab + SMT assembly | jlcpcb.com | 2 orders (L + R); 1.6 mm, 2-layer; economic PCBA is single-sided, 5 pcs min |
| 1.2 mm FR4 plates | jlcpcb.com | order as a normal bare PCB; 1.5 mm is not offered |
| Laser-cut 1.5 mm POM plates | sendcutsend.com (US), ponoko.com, local makerspace | needs a DXF with kerf compensation |
| Choc keycaps 1u/1.5u/2u | lowprokb.ca (MBK Legend), asymplex.xyz, splitkb.com | **no 1.75u/2.25u/2.75u exists** |
| MX keycaps (if MX) | NovelKeys, Mekibo, KBDFans, Akko | all wide sizes available; add stabs |

**Open-source tooling**

| Tool | Where | Use |
|---|---|---|
| KiCad 8 | kicad.org | PCB + schematic source of truth |
| marbastlib (KiCad keyboard footprints) | github.com/ebastler/marbastlib | Choc/MX hotswap, nice!nano, stabilisers, reversible variants — don't hand-draw these |
| Ergogen | github.com/ergogen/ergogen, plus the `ceoloide` fork | optional matrix generator |
| ZMK | github.com/zmkfirmware/zmk | firmware |
| OpenSCAD | openscad.org | parametric case |

---

# 5. Remediation plan

## P0 — blocking, do first (≈ 3 days, $0)

| # | Action | File |
|---|---|---|
| 1 | Add `config ZMK_SPLIT default y` for all three shields; switch to `ZMK_SPLIT_ROLE_CENTRAL`; delete the non-existent `ZMK_SPLIT_BLE_ROLE_PERIPHERAL` | `Kconfig.defconfig` |
| 2 | Move `col-offset = <7>` from `kscan0` to `&default_transform` | `interlock_ergo_right.overlay` |
| 3 | Create `interlock_ergo_left.conf` and `interlock_ergo_right.conf` | `config/boards/shields/interlock_ergo/` |
| 4 | Regenerate `matrix_and_pinout.md` from the ZMK board DTS; remove the duplicate pin | `docs/matrix_and_pinout.md` |
| 5 | Add a `settings_reset` entry to the build matrix | `config/build.yaml` |
| 6 | Add `BT_MAX_CONN` / `BT_MAX_PAIRED` = 7 on the dongle; remap the right half's outer two columns off i2c0 (pins 2/3) if a display is ever wanted | dongle `.conf`, `interlock_ergo_right.overlay` |
| 7 | Choose Choc v1 **or** MX and delete the other from the BOM | `docs/architecture.md` |
| 8 | Freeze the physical layout into one machine-readable file | `docs/layout.yaml` |

## P1 — blocking for manufacture (≈ 3 weeks)

| # | Action |
|---|---|
| 10 | Rewrite the case: plate + frame + bottom shell; real dovetail (under-cut, Y-extruded, flank clearance); magnets on a shared assembly datum; M2 heat-set bosses; controller bay; battery pocket; antenna keepout |
| 11 | Design PCB L and PCB R in KiCad 8 with marbastlib footprints; 1.6 mm, 2-layer; hotswap + SOD-123 diodes; power switch; JST; SWD pads; reset button |
| 12 | Design plates (13.8 mm Choc / 14.0 mm MX apertures, stab cutouts if any key ≥ 2u) |
| 13 | Resolve the wide-key problem: normalise to 1u/1.5u/2u, or commit to MX |
| 14 | Rewrite `tests/test_matrix.js` (uniqueness, gpio counts, conf-file existence, `ZMK_SPLIT` presence) and wire it into CI |
| 15 | Add build artifacts: STL/3MF release, gerber release, plate DXF |
| 16 | Print and dry-fit a case with a bare PCB before any electronics |

## P2 — quality (≈ 1 week)

| # | Action |
|---|---|
| 17 | Rewrite `dongle_case.scad` as a real two-part enclosure for one board; fix the lanyard axis |
| 18 | Split the dock into ≤ 250 mm printable parts; fix retention; model or delete the tenting claim |
| 19 | Correct the battery-life figure and the "split boards put 6 on the left" claim |
| 20 | Add `assert()` guards to all OpenSCAD parameters; switch to `$fa/$fs`; round top/bottom edges |
| 21 | Add `<shield>.zmk.yml` metadata for ZMK's hardware index |
| 22 | Add `CONFIG_ZMK_STUDIO=y` on the dongle and remove the studio snippet from the peripheral |
| 23 | Tidy the dongle overlay: `events = <>` instead of `<0>`, drop the redundant `chosen` re-assignment (§3.4) |

---

# 6. Appendix — reproducible verification

```bash
# 1. Meshes are watertight (they are)
openscad -o /tmp/left.stl -D mode=\"left\" cad/interlock_case.scad
# analyse boundary/non-manifold edges with any STL topology checker

# 2. The committed test passes — and is insensitive to real bugs
node tests/test_matrix.js

# 3. Mutation test: this should fail the suite, and does not
sed -i 's/RC(0,6)     RC(0,7)/RC(0,7)     RC(0,6)/' \
  config/boards/shields/interlock_ergo/interlock_ergo.dtsi
node tests/test_matrix.js          # => passes

# 4. ZMK ground truth used for this audit (ZMK main @ 2026-11)
grep -n "ZMK_SPLIT" app/src/split/Kconfig            # menuconfig, no default
grep -n "ZMK_SPLIT" app/boards/shields/*/Kconfig.defconfig   # every split shield sets it
cat app/boards/shields/corne/corne_right.overlay      # col-offset goes on the transform
sed -n '111,116p' cmake/modules/shields.cmake         # only <shield>.conf is loaded
cat app/module/boards/nicekeyboards/nice_nano/arduino_pro_micro_pins.dtsi
cat app/boards/shields/settings_reset/settings_reset.overlay
```

**Claimed vs verified — final tally**

| Claim in repo | Verified? |
|---|---|
| "6, Y, H, N strictly on the right half" | ✅ matrix + keymap agree (tested) |
| "76-key 5×16 matrix" | ✅ 34 left + 42 right |
| "Interlocking dovetail" | ❌ anti-dovetail, vertical insertion, 0.2 mm omnidirectional slop |
| "N52 magnets pull the halves together" | ❌ 2.5 mm misalignment, pockets overlap |
| "Rigid unibody, pick it up with one hand" | ❌ no plate, no PCB mounts, no bottom |
| "2.4 GHz dongle, both halves wireless" | ❌ `ZMK_SPLIT` not enabled |
| "Instant switch to Bluetooth without the dongle" | ❌ with a dongle-central architecture the halves cannot run standalone without reflashing |
| "3–6 months battery life" | ❌ ~3 weeks, and sleep config is never applied |
| "Battery reporting over BLE" | ⚠️ halves report their own level (nice!nano VDDH); the dongle never proxies them because §3.1 |
| "GitHub Actions cloud firmware compilation" | ✅ workflow is valid and will run |
| "CI-verified matrix" | ❌ tests are never run in CI |
| "Pinout reference for PCB design" | ❌ 12 of 16 pins wrong, one pin duplicated |
| Printable on a 256 mm bed | ❌ dock is 347 mm |
| Contributes a PCB | ❌ no PCB of any kind |

---

## 6.1 Claims I withdrew after verification

Listed for honesty, because a reviewer should be able to check my work rather than
trust it:

| Initial claim | Verdict |
|---|---|
| "`switch_cutout = 14.0` is MX-only; Choc needs 13.8" | **Wrong.** Kailh's drawing is 13.8 **±0.2**, so 14.0 is the correct safe cutout for *both*. The constant is right. |
| "Choc 1.75u / 2.25u keycaps are unobtainable" | **Wrong.** MBK Convex sells 1U/1.25U/1.5U/1.75U/2U/2.25U. Only **2.75u** is genuinely unavailable. |
| "nice!nano uses a JST PH 2.0" | **Wrong.** It has bare **B+ / B−** pads; no connector at all. |
| "Hotswap sockets are not in JLCPCB's parts library" | **Wrong.** `CPG135001S30` is catalogue part **C5333465** at ~$0.21. |
| "Battery reporting is dead — no `zmk,battery` node on nice!nano" | **Wrong.** `nice_nano_nrf52840_zmk_2_0_0.overlay` defines `zmk,battery = &vbatt` with `compatible = "zmk,battery-nrf-vddh"`. |
| "The dongle's mock kscan is malformed" | **Overstated.** It matches ZMK's official dongle docs. Downgraded to MINOR. |
| "Ergogen is lightly maintained" | **Wrong.** `ergogen/ergogen` is active (last push Nov 2025) and ships a KiCad 8 template. |

Every remaining CRITICAL finding survived independent verification against upstream
source, and the two that matter most (`ZMK_SPLIT` never set, `col-offset` on the
wrong node) were confirmed by two independent passes.

**Still unverified and worth measuring before you commit money:** the nRF52840
Dongle's physical dimensions (Nordic publishes no fetchable figure), the nice!nano's
exact L×W (only "3.2 mm thick" is official; 33.0 × 17.8 mm is inferred from the
0.1" Pro Micro grid — **measure one**), the live JLCPCB quote at 175 × 95 mm, and
the 1N4148W's exact LCSC part number.
