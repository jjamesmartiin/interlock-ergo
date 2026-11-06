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
switch side.

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

## Known fit issues to check on your own hardware

These are called out because they depend on the exact part you buy, and the model
assumes a typical part:

- **Slide switch.** The case has a through-slot plus a finger recess in the outer
  side wall, and the PCB places the switch 2.05 mm from the outer board edge so
  its actuator sits inside the wall thickness. Measure your switch: body height
  and actuator travel vary between MSK-12D19 clones. If your part is taller, edit
  `sw_y_pcb` in `cad/interlock_case.scad` and the matching `swX/swY` in
  `pcb/generate_pcb.js`, and re-print.
- **Controller height.** The controller bay is open at the top, so a socketed
  nice!nano with headers fits; a castellated one sits lower.
- **Cell thickness.** `battery_t = 4.0` in `cad/interlock_params.scad`. A 5 mm
  pouch does not fit under the PCB in this case - it needs `standoff_h` raised and
  a re-print of both halves.
