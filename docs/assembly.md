# Assembly

Read this once before you solder anything. There are three things that are hard
to undo: the magnet polarity, the switch-socket side, and the order you fit the
PCB and plate.

Tools: fine iron with a chisel tip, 0.6 mm solder, flush cutters, tweezers, M2
screwdriver, 2-part epoxy or CA glue, a multimeter.

## 1. Check the printed parts before you solder

Print `cad/dist/interlock_choc_left.stl` (or `_right`) and its plate first and
dry-fit them empty:

- The plate drops into the case rebate so its **top face is flush** with the case
  rim. There should be 0.25 mm of play, nothing more.
- The dovetail tabs on the left half enter the right half's sockets and the two
  seam faces come together with no gap. They are a **vertical drop-in** joint -
  lower one half onto the other. Do not try to slide them sideways.
- A 6 × 3 mm magnet should be a snug push fit in its pocket with about 0.1 mm of
  radial play. If it is loose, that is your printer - do not glue a sloppy magnet;
  re-print the half.
- Do **not** force anything. If the plate or a tab needs force, the mesh is right
  and the printer is not; check flow and shrinkage.

If the parts pass, print the pair and keep them.

## 2. Magnets: polarity first, glue second

Each half has two pockets in the seam wall. When the halves are docked the
magnets face each other across the seam, so **the pair must attract**.

1. Dry-stack the two halves docked, no glue.
2. Take the four magnets. Hold them in the pockets one at a time: the left half's
   magnet must attract the right half's opposite pocket, not repel it.
3. Mark every magnet's outward face with a paint pen **before** any glue.
4. Glue with 2-part epoxy or CA: a smear of glue in the pocket first, magnet in
   second, so the glue squeezes out rather than trapping an air pocket behind it.
5. Re-check attraction while the glue is still green, then leave it to cure with
   the halves apart.

Each pocket has a small dimple on the inside face marking the pocket's position
from the other side; the dimple end of the part is the top. Get this wrong and you
will have two halves that push each other apart.

## 3. PCB

The switch sockets and the diodes go on the **bottom** of the PCB, opposite the
switch side. Both are in the board's JLCPCB BOM/CPL (`pcb/dist/bom_*.csv`,
`cpl_*.csv`), so the assembler can place all 76 of each; the three 1 mm fiducials
the placement needs are on that side too, in `pcb/dist/gerbers_*/`.

1. Diodes first: 1N4148W in SOD-123, cathode (the banded end) toward the row net.
   The diode sits up-and-left of each switch, on the same side as the sockets.
   The silkscreen marks `D1..Dn` and the PCB generator emits one diode per key,
   plus one for the encoder's push switch.
2. Hotswap sockets next. Each switch footprint has two 2.6 mm round-rectangle SMD
   pads sitting **about 3.3 mm outboard of the switch pins**, and a 3.0 mm
   unplated hole at each pin. That is what a Kailh hotswap socket actually needs:
   the socket body sits in the 3.0 mm hole and its two tabs solder to the outboard
   pads. Do not expect the pads to line up with the pin holes - they are not
   supposed to.
   The pin holes are **unplated**, so this is a hotswap-only board: a switch
   cannot be soldered in directly, because there is no copper at the pin.
3. JST-PH socket for the cell, the slide switch in the controller bay, and the
   controller pads. Solder the controller **last**: socket it with 12-pin headers
   if you want to be able to replace it, or castellated-solder it if you want the
   lowest profile. Socketed is recommended.
4. Inspect every joint under magnification. On the switch sockets, a single bridged
   joint silently kills one column.

## 4. Test before you close anything

Do not fit the plate yet.

1. Plug the USB-C cable into the controller, flash the firmware, and open a text
   field.
2. Put a switch into each socket in turn - or use tweezers to short each switch's
   two pads - and confirm every key produces the character in the picture in
   `docs/images/layout.svg`.
3. Check the encoder in both directions and on the push.
4. Check the power switch actually disconnects the cell (measure the current with
   the switch off; it should read microamps).

Only carry on once every key works. Debugging a matrix with the plate on is
miserable.

## 5. Fit the PCB

1. Four M2 self-tapping screws through the PCB's corner holes into the bosses at
   3.5 mm above the floor. Do not overtighten - PETG strips easily. If a boss
   feels soft, stop and use a longer screw into a fresh hole rather than forcing.
2. Leave the cell out for now if you are still testing.

## 6. Plate, then switches, then keycaps

The plate is held down by the switches alone, so it goes in **before** the
switches and never needs screws.

1. Drop the plate into the rebate, top face flush.
2. Push each switch through the plate into its socket. It should click twice: once
   into the plate, once into the socket. A switch that will not seat is usually a
   bent socket pad - stop, do not force it.
3. Choc switches must latch into a **1.2 mm** plate. If they feel loose, the plate
   was printed at the wrong thickness. MX wants 1.5 mm.
4. Keycaps last. Every key is 1u, so any 1u Choc or MX set works.

## 7. Cell and closing up

1. Stick the protected pouch cell in the recess in the controller bay, **under**
   the PCB. Put a piece of fishpaper or a 0.5 mm printed shim between the cell and
   the PCB - the hotswap socket pins are sharp.
2. Route the cell leads away from the plate and clear of the switch pins, then
   plug into the JST.
3. The cell must be a **protected** pouch (integrated PCM). An unprotected cell
   inside a sealed plastic case that charges unattended is a fire, not a product.
4. There is no bottom cover by design: the case is a tray and the plate is the
   lid, so nothing else needs closing.

## 8. Dongle

1. `dongle_case_base.stl` + `dongle_case_lid.stl`.
2. The board rests on the ledge 2.6 mm above the floor, USB-C end at the window.
3. The lid is a light press fit. If yours is tight, sand the lip or re-slice the
   lid at 99 %; do not force it, the lip cracks before the tray does.
4. The reset pinhole in the base reaches the XIAO's back-side reset pads.

## 9. Pairing and recovery

1. Flash all three images (see README), and flash `settings_reset` on the halves
   if they have ever been paired before.
2. Plug the dongle in and power both halves on. The dongle bonds with both on
   first boot; the host sees one keyboard.
3. `&out OUT_BLE` on the adjust layer switches the dongle to a Bluetooth profile
   if you want to use it with a phone.
4. If a half stops connecting after a reflash, flash `settings_reset` on that half
   and power-cycle the dongle. That is the recovery path - there is nothing else
   to try, and no key combination to remember.
5. `&bootloader` on the adjust layer reboots **the half you press it on** (a
   peripheral boots only itself). Use the dongle's own reset pads, or the reset
   button on the nice!nano, when you need the dongle in bootloader mode.

## The one dimension to check before you trust the case

The case depth is derived from the plate-underside-to-PCB gap: 3.5 mm for Choc,
5.0 mm for MX. The MX number is well documented. The **Choc 3.5 mm is inferred**,
not read off Kailh's drawing (see docs/part-dimensions.md) - the drawing is
vector-outlined and the vertical chain could not be extracted. It is the only
number in the design with that status, and it is the one everything vertical hangs
from.

It fails in two visible ways, both cheap to fix:

| What you see on a dry fit | What it means | Fix |
|---|---|---|
| Switches do not reach the plate; the plate sits proud of the case rim | the real gap is larger than 3.5 mm | raise `choc_plate_gap` by 0.25-0.5 and re-print |
| The plate presses the switches down / the case will not close flush | the real gap is smaller | lower `choc_plate_gap` by 0.25-0.5 and re-print |

`choc_plate_gap` lives in `cad/interlock_params.scad`; `case_depth` is derived from
it, so nothing else needs editing and `tests/test_models.js` will confirm the
stackup is still self-consistent. Two 20-minute prints settle it either way, and
that is exactly why the dry fit comes before the PCB order.

## Known fit issues to check on your own hardware

- **Slide switch.** An MSK-12D19 is 9.0 x 3.5 mm with ~3.5 mm body and ~2.0 mm of
  actuator on the **top** face, travelling along its 9 mm axis. The case therefore
  has no cutout for it at all: the switch is operated from above, through the open
  controller bay, and its actuator ends up about 0.8 mm above the case rim. If your
  part is a clone with a taller body it may foul nothing but will stand proud; if
  it is shorter you may not reach it. Pin pitch is unverified - check it against
  the PCB before soldering.
- **Encoder.** The board has the two 2.8 x 1.5 mm mounting-post slots the EC11
  stands on. The plate clears a 13.5 mm square for a 12.0 x 12.2 mm body. If your
  encoder is a taller variant it may foul the plate: the body height is the one
  EC11 dimension that could not be verified.
- **Controller height.** The controller bay is open at the top, so a socketed
  nice!nano with headers fits; a castellated one sits lower. The bay is 2 mm short
  of the plate so a 33.02 mm nice!nano clears it.
- **Cell.** `battery_t = 4.5` in `cad/interlock_params.scad`, for a protected
  LP402030 pack (~34 mm long with its PCM board). A 5 mm pouch does not fit under
  the PCB - it needs `standoff_h` raised and a re-print of both halves.
- **Battery polarity & charging.** `J_BAT` pin 1 is BAT+ and pin 2 is GND, and both
  are marked `+` / `-` on the front silk next to the connector. LiPo packs are sold
  with both wire orders, so still check the harness with a multimeter before
  plugging in - reverse polarity destroys the controller. The switch sits between
  the cell and the nice!nano's battery/charger node, so the cell
  **only charges while the power switch is ON**.
- **USB-C cable clearance.** The window is 10.0 x 4.6 mm with a 13.0 x 7.2 mm
  exterior relief pocket 2.4 mm deep, so the overmold has somewhere to go; standard
  11-12.5 mm overmolds seat. The relief opens through the rim above the controller
  bay (that bay is open anyway) - that is a slot, not a printing defect. A cable
  whose overmold is thicker than ~6.5 mm may still stop a little short: test with
  the cable you intend to use.
- **Encoder knob diameter.** Maximum 16-17 mm. Anything >= 18 mm collides with the
  adjacent Esc keycap.
- **Spacebar keycap size.** Left half row 4 uses a 1u switch for Space. Do not buy
  a 2u or 2.25u keycap - its centre stem collides with Alt. A 1u gap remains
  between Space and Fn1.
- **Antenna keep-out.** The nice!nano's antenna is under the open controller bay.
  Do not put metal, foil or a copper-pour liner within ~5 mm of it, and do not
  print the case in a metal-filled filament: 2.4 GHz range is the first thing to
  go, and it goes silently.
