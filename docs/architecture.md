# System Architecture

## 1. Layout and why the columns are where they are

68 keys, all 1u. No stabilisers, no wide keys: every keycap is a size any Choc or
MX set already contains, which removes the single most annoying sourcing problem in
small-batch keyboard building.

The ANSI feel comes from the row stagger, not from wide modifiers. Each whole row is
shifted by 0 / 0.5 / 0.75 / 1.25 / 0.25 u so that every letter column lands on its
GH60 column position, so touch typists keep their muscle memory. The offsets are
GH60's exactly (0 / 0.5 / 0.75 / 1.25 u against GH60's 1 / 1.5 / 1.75 / 2.25 u
letters) and the split is a DZ60 split down the middle: 6 left + 8 right (14 columns total),
with a standard inverted-T arrow cluster on the bottom right. That is
why there is no function column and no rotary encoder - both lived in a seventh
left column, and dropping it is what buys the parity. The price is that the
stagger needs 22.5 mm of horizontal shear, which a straight seam converts into dead
case width at each half's seam edge — see the README's note on the 69 mm centre gap.

**One band stack, three materials.** The board is a stack of full-width horizontal
bands — the controller bay, one band per key row, the bottom margin — and each band's
outer edge sits `pcb_margin_x` outside that row's outermost key. That one definition
builds the PCB's `Edge.Cuts` polygon, the plate outline and the case walls, in two
languages: `pcb/generate_pcb.js` for the board and `cad/interlock_params.scad` for
the printed parts, with `tests/test_alignment.js` sampling the exported meshes to
confirm the two agree. The seam face is deliberately *not* part of the silhouette:
it is a joint, and the dovetail and magnets need a straight plane, which is why the
dead strip along the seam is unavoidable and the stagger shows up as the 69 mm docked
gap rather than as a shape.

`6`, `Y`, `H` and `N` are on the right half. That matches the convention of every
6-column split (Lily58, Sofle, Iris, Kyria) and of ANSI, so it is a correctness
property rather than a market gap. The differentiator of this board is the
interlocking dock, not the 6 key.

## 2. Firmware: ZMK, and why a dongle

| | ZMK | QMK |
|---|---|---|
| Wireless | designed for BLE and low power on nRF52840 | wired-first, wireless is third-party |
| Split over BLE | native, with a `central` role that can also be a USB device | needs a custom bridge |
| Host compatibility | the central enumerates as an ordinary USB HID keyboard | n/a |

The dongle is a ZMK split **central** with a mock key scanner, so it forwards both
peripherals' key events over USB HID. Compared with pairing each half as a separate
Bluetooth keyboard this gives:

- one keyboard identity on the host, with no pairing and no driver;
- works in BIOS/UEFI and in OS installers;
- works on machines where Bluetooth is disabled by policy.

The halves are BLE **peripherals** and do not need to know the host exists.
Bluetooth profiles remain available by switching the dongle's output
(`&out OUT_BLE`), so the same board pairs with a phone or tablet.

Battery cost of the topology: each peripheral holds one BLE link to the central.
With `CONFIG_ZMK_IDLE_SLEEP_TIMEOUT=900000` (15 min) and a ~200 mAh protected
LP402030 pack, expect **1–2 weeks** between charges, not months. The case cannot take a thicker
cell without raising `standoff_h` and re-printing both halves.

## 3. The interlock

**Docked.** The left half carries two dovetail tabs on its seam face; the right half
has the matching blind sockets, 3.2 mm deep in a 6 mm seam wall. The profile is an
undercut — a 6 mm throat opening to a 9 mm head — so once the halves are together
they cannot be pulled apart along X, and the angled flanks also take out Z and roll.
The joint is a **vertical drop-in**: lower one half onto the other. There is no
sliding direction, which is what makes it printable with no support under the tab.

**Held shut.** Four 6 × 3 mm N52 discs, two per half, sit flush in the seam faces so
each magnet faces its opposite pole across a 0.4 mm gap. They hold the joint closed
along Y, the one axis the dovetail leaves free. Polarity dimples are modelled beside
each pocket, because a reversed pair turns the joint into a repulsion problem.

**Separated.** Lift one half; nothing latches and nothing slides. Each half is
independently usable, and the case is a tray with no bottom cover — the switch plate
is the lid, and the switches hold the plate.

## 4. Switching and the plate

The plate is the only part that retains a switch, so its two dimensions matter:
aperture and thickness. Both apertures are 14.0 mm square (Kailh's Choc drawing is
13.8 ± 0.2, so the upper bound is the safe cutout, and MX uses the same number), and
the thickness is 1.2 mm for Choc and 1.5 mm for MX. Choc retention barbs only latch
in a 1.2 mm plate; 1.5 mm is an MX number and gives loose Choc switches.

The plate drops into a rebate so its top is flush with the case rim, and rests on a
ledge 3.5 mm (Choc) / 5.0 mm (MX) above the PCB — exactly the depth of the switch
body below the plate. That gap is asserted in `cad/interlock_params.scad` and
re-checked by `tests/test_models.js`.

## 5. Power

Cell → JST-PH on the PCB → slide switch → nice!nano `RAW` (its battery/charger
node, also the `B+` pad). Ground returns directly. The switch is therefore inside
the charge path as well as the discharge path: **the cell charges only while the
switch is ON**. `J_BAT` pin 1 is BAT+ and both pins are marked on the front silk.
The cell must be a protected pouch: the nice!nano's charger handles charging only
and provides no over-discharge or over-current protection. Charge current is fixed
at 100 mA, so a ~200 mAh pack sits at C/2 and the boost jumper must stay open.

The nice!nano measures its own cell through VDDH (`zmk,battery-nrf-vddh`), so no
divider and no ADC pin are involved. The dongle proxies each peripheral's level to
the host.

**RF keep-out.** The nice!nano's antenna is the end away from its USB socket, which
sits under the open controller bay. Nothing metal may come within ~5 mm of it: no
metal plate, no foil lining, no copper pour. 2.4 GHz range is the first thing that
suffers, and it does so silently.

## 6. Mechanical stackup

One chain of constants in `cad/interlock_params.scad` drives everything:

```
plate top    = case_depth                      (flush with the case rim)
plate bottom = case_depth - plate_thickness    <- the ledge the plate sits on
PCB top      = plate bottom - plate_gap        (switch body)
PCB bottom   = PCB top - pcb_thickness         (on four M2 bosses)
floor top    = PCB bottom - standoff_h         (cell + socket clearance)
```

Choc: 1.2 + 3.5 + 1.6 + 5.5 + 2.4 = **14.2 mm**. MX: 1.5 + 5.0 + 1.6 + 5.5 + 2.4 =
**16.0 mm**. Of those five numbers the 3.5 mm Choc plate gap is the only one that is
inferred rather than read off a drawing - see [part-dimensions.md](part-dimensions.md)
and the tolerance procedure in [assembly.md](assembly.md). Changing any one of these
re-derives the case, and
`tests/test_models.js` fails if an exported part disagrees with the sum.
