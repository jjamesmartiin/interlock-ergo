/*
 * Interlock Ergo - Precision Engineering & Joint Parameters
 * Dual standard: Kailh Choc v1 (crkbd/corne style) and Cherry MX.
 */

$fn = 40;

// Mechanical Tolerances
interlock_tol = 0.25;     // 0.25mm sliding joint clearance
fillet_r = 3.0;           // Exterior corner fillet radius
wall_thickness = 4.0;     // Perimeter wall thickness
floor_thickness = 2.4;    // Floor thickness
shelf_depth = 1.5;        // Switch plate perimeter retention shelf
standoff_h = 3.5;         // PCB mounting standoff height
boss_d = 5.0;             // Standoff boss outer diameter
screw_d = 2.2;            // M2 thread clearance hole

// Magnets (6.0mm diameter x 3.0mm thickness N52 disc)
magnet_d = 6.15;          // 6.15mm diameter pocket (snug slip fit)
magnet_depth = 3.2;       // 3.2mm depth
wall_skin = 0.8;          // 0.8mm protective wall between magnet and mating seam

// Kailh Choc v1 (Corne/crkbd Low-Profile Standard)
choc_pitch_x = 18.0;
choc_pitch_y = 17.0;
choc_switch_cutout = 14.0;// 14.0mm square aperture (Kailh 13.8 ±0.2 max bound)
choc_plate_thickness = 1.2;// 1.2mm plate mandatory for Choc stabilizer latching
choc_case_depth = 13.0;   // Floor + Battery pocket + PCB + Sockets + Plate

// Cherry MX Standard
mx_pitch_x = 19.05;
mx_pitch_y = 19.05;
mx_switch_cutout = 14.0;
mx_plate_thickness = 1.5;
mx_case_depth = 16.5;

// Horizontal sliding dovetail joint (male tab: narrow throat, wide head)
module horizontal_dovetail_male(length, height) {
    // Narrow base 6mm, wide head 9mm, protrusion 4.5mm
    linear_extrude(height = height) {
        polygon(points = [
            [0, -3.0],
            [4.5, -4.5],
            [4.5, 4.5],
            [0, 3.0]
        ]);
    }
}

// Horizontal sliding dovetail socket (with tolerance)
module horizontal_dovetail_female(length, height) {
    tol = interlock_tol;
    linear_extrude(height = height + 1.0) {
        polygon(points = [
            [-0.1, -3.0 - tol],
            [4.5 + tol, -4.5 - tol],
            [4.5 + tol, 4.5 + tol],
            [-0.1, 3.0 + tol]
        ]);
    }
}

// Rounded box utility
module rounded_box(w, l, h, r) {
    hull() {
        translate([r, r, 0]) cylinder(r = r, h = h);
        translate([w - r, r, 0]) cylinder(r = r, h = h);
        translate([w - r, l - r, 0]) cylinder(r = r, h = h);
        translate([r, l - r, 0]) cylinder(r = r, h = h);
    }
}

// PCB Standoff boss
module standoff_boss(h) {
    difference() {
        cylinder(d = boss_d, h = h);
        translate([0, 0, -0.5])
            cylinder(d = screw_d, h = h + 1.0);
    }
}
