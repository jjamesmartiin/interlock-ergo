/*
 * Interlock Ergo USB dongle enclosure - Seeed XIAO nRF52840 (BLE).
 *
 * Two parts: a tray the board rests in and a friction-fit lid. The lid's lip is
 * sized for a light press fit in PETG; sand or re-print the lid at 99% if yours
 * comes out tight. The USB-C window is cut through both parts so the lid cannot
 * be fitted the wrong way round and jam the cable.
 *
 *   mode = "base" | "lid" | "assembly"   (assembly prints both, side by side)
 *
 * Board: 20.955 x 17.78 x 1.6 mm (Seeed's official KiCad Edge.Cuts), USB-C on the
 * short edge with its shell ~1.4mm inboard of that edge, reset button on the top
 * face. The bootloader is entered by shorting the two reset pads on the back, so
 * the base has a pinhole under them instead of a button cutout.
 *
 * Note the nRF52840 XIAO is 17.78mm deep, not the 17.5mm of the older XIAO boards:
 * a 17.5mm pocket will not take it.
 */

$fa = 2;
$fs = 0.4;

board_l   = 20.955;
board_w   = 17.78;
board_t   = 1.6;   // PCB only; the USB-C shell adds ~3.3mm above it

wall      = 1.4;
floor_t   = 1.2;
lid_t     = 1.2;
standoff  = 2.6;    // floor top -> PCB underside
headroom  = 3.9;    // PCB top -> lid lip underside (clears the USB-C shell)
fit       = 0.30;   // lid lip -> wall clearance (press fit)

usb_w     = 9.6;    // USB-C shell + overmould relief
usb_h     = 3.8;

inner_l = board_l + 1.2;
inner_w = board_w + 1.2;
outer_l = inner_l + 2 * wall;
outer_w = inner_w + 2 * wall;
base_h  = floor_t + standoff + board_t + headroom;
lip_h   = 4.0;

reset_x = outer_l / 2;
reset_y = outer_w / 2;
reset_d = 2.2;

module shell() {
    difference() {
        cube([outer_l, outer_w, base_h]);
        translate([wall, wall, floor_t])
            cube([inner_l, inner_w, base_h]);
    }
}

module base() {
    difference() {
        union() {
            shell();
            // PCB rests on this ledge, 2.6mm above the floor.
            translate([wall, wall, floor_t])
                cube([inner_l, inner_w, standoff - floor_t]);
        }
        // Board recess: keeps the PCB from sliding and takes the XIAO's back pads.
        translate([wall + (inner_l - board_l) / 2, wall + (inner_w - board_w) / 2, floor_t + standoff - 0.2])
            cube([board_l, board_w, board_t + 0.6]);
        // USB-C window through the -Y short wall, centred on the connector height
        // (PCB top + ~1.4mm). rotate([90,0,0]) sends +Z to -Y, so the extrusion has
        // to start at the wall's INNER face - starting at y=0 cut empty space
        // outside the case and left the port blocked by a 1.4mm wall.
        translate([outer_l / 2, wall + 0.2, floor_t + standoff + board_t + 1.4])
            rotate([90, 0, 0])
            linear_extrude(height = wall + 0.6)
            offset(r = 0.5) square([usb_w, usb_h], center = true);
        // Reset pinhole: reach the XIAO's back-side reset pads from underneath.
        translate([reset_x, reset_y, -1]) cylinder(d = reset_d, h = floor_t + 2);
    }
}

module lid() {
    difference() {
        union() {
            translate([0, 0, base_h]) cube([outer_l, outer_w, lid_t]);
            // Press-fit lip that drops into the base.
            translate([wall + fit, wall + fit, base_h - lip_h])
                difference() {
                    cube([inner_l - 2 * fit, inner_w - 2 * fit, lip_h]);
                    translate([1.0, 1.0, -1])
                        cube([inner_l - 2 * fit - 2.0, inner_w - 2 * fit - 2.0, lip_h + 2]);
                }
        }
        // Same USB-C window, so the lid has one correct orientation. It has to cut
        // through the lip as well (the lip is a 1mm wall at y = wall + fit, right in
        // front of the connector), so this extrusion starts outside it.
        translate([outer_l / 2, wall + fit + 1.1, floor_t + standoff + board_t + 1.4])
            rotate([90, 0, 0])
            linear_extrude(height = wall + fit + 1.7)
            offset(r = 0.5) square([usb_w, usb_h], center = true);
    }
}

mode = "assembly";

if (mode == "base") {
    base();
} else if (mode == "lid") {
    lid();
} else {
    base();
    translate([outer_l + 8, 0, 0]) lid();
}
