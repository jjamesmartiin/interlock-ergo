/*
 * 2.4GHz ZMK USB Dongle Snap-Fit Enclosure
 * Parametric OpenSCAD Model for Seeed Studio XIAO BLE / nRF52840 Dongle
 */

$fn = 32;

// Dongle Dimensions (Xiao BLE: 21mm x 17.5mm x 5mm)
pcb_l = 22.0;
pcb_w = 18.5;
pcb_h = 3.5;
wall = 1.6;
lid_h = 3.0;

case_l = pcb_l + wall * 2;
case_w = pcb_w + wall * 2;
case_h = pcb_h + wall + 2.0;

module dongle_bottom() {
    difference() {
        // Outer body
        hull() {
            cylinder(r = 2, h = case_h);
            translate([case_l - 4, 0, 0]) cylinder(r = 2, h = case_h);
            translate([case_l - 4, case_w - 4, 0]) cylinder(r = 2, h = case_h);
            translate([0, case_w - 4, 0]) cylinder(r = 2, h = case_h);
        }

        // Inner PCB pocket
        translate([wall - 2, wall - 2, wall])
            cube([pcb_l, pcb_w, case_h]);

        // USB-C Connector cutout
        translate([-4, (case_w - 4) * 0.5 - 4.5, wall + 0.5])
            cube([6.0, 9.0, 3.5]);

        // Lanyard hole (rear)
        translate([case_l - 5, (case_w - 4) * 0.5, 0])
            cylinder(d = 3.0, h = case_h * 2, center = true);
    }
}

dongle_bottom();
