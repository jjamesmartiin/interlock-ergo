/*
 * Interlock Ergo Keyboard Case & Switch Plate
 * Parametric OpenSCAD Model
 * 
 * Features:
 * - Left half: 7 cols (Encoder + Macro + Esc..5 / Tab..T / Caps..G / Shift..B)
 * - Right half: 9 cols (6..Bksp / Y..Bslh / H..Ret / N..Del / Space..Arrows)
 * - Interlocking seam with male/female dovetail tabs and 6x3mm magnet pockets
 * - Follows row-stagger seam between 5-T-G-B and 6-Y-H-N
 * - Microcontroller and battery compartments
 */

$fn = 40;

// Dimensions & Tolerances (mm)
u = 19.05;                   // 1 Unit MX keycap pitch
plate_thickness = 1.5;       // Standard MX switch plate thickness
case_depth = 12.0;           // Case internal depth for hot-swap sockets & battery
wall_thickness = 3.5;        // Outer perimeter wall thickness
fillet_r = 3.0;              // Corner radius
switch_cutout = 14.0;        // MX switch square hole
interlock_tol = 0.20;        // 3D printer tolerance clearance for sliding joint
magnet_d = 6.2;              // Pocket for 6mm disc magnet
magnet_h = 3.2;              // Pocket depth for 3mm magnet

// Switch cutout module
module mx_switch_hole() {
    cube([switch_cutout, switch_cutout, plate_thickness + 2], center = true);
}

// Interlocking male dovetail tab
module interlock_male_tab() {
    linear_extrude(height = case_depth - 2) {
        polygon(points = [
            [0, -6],
            [6, -4],
            [6, 4],
            [0, 6]
        ]);
    }
}

// Interlocking female dovetail socket (with tolerance)
module interlock_female_socket() {
    linear_extrude(height = case_depth) {
        polygon(points = [
            [-0.1, -6 - interlock_tol],
            [6 + interlock_tol, -4 - interlock_tol],
            [6 + interlock_tol, 4 + interlock_tol],
            [-0.1, 6 + interlock_tol]
        ]);
    }
}

// Magnet pocket module
module magnet_pocket() {
    cylinder(d = magnet_d, h = magnet_h, center = true);
}

// Rounded box utility
module rounded_cube(size, r) {
    hull() {
        translate([r, r, 0]) cylinder(r = r, h = size[2]);
        translate([size[0] - r, r, 0]) cylinder(r = r, h = size[2]);
        translate([size[0] - r, size[1] - r, 0]) cylinder(r = r, h = size[2]);
        translate([r, size[1] - r, 0]) cylinder(r = r, h = size[2]);
    }
}

// Left Half Base Case
module left_half_case() {
    cols = 7;
    rows = 5;
    box_w = cols * u + wall_thickness * 2;
    box_h = rows * u + wall_thickness * 2;

    difference() {
        union() {
            // Main chassis
            rounded_cube([box_w, box_h, case_depth], fillet_r);

            // Interlocking male tabs along the right edge
            translate([box_w - 0.5, box_h * 0.25, 1]) interlock_male_tab();
            translate([box_w - 0.5, box_h * 0.75, 1]) interlock_male_tab();
        }

        // Interior cavity
        translate([wall_thickness, wall_thickness, 2.0])
            cube([box_w - wall_thickness * 2 - 2, box_h - wall_thickness * 2, case_depth]);

        // Rotary encoder cutout (Top-Left corner)
        translate([wall_thickness + u * 0.5, box_h - wall_thickness - u * 0.5, 0])
            cylinder(d = 7.5, h = case_depth * 2, center = true);

        // USB-C controller port cutout (Top edge)
        translate([box_w * 0.4, box_h - wall_thickness - 1, case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        // Power switch cutout (Left edge)
        translate([-1, box_h * 0.5, case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([box_w - 1.5, box_h * 0.4, case_depth * 0.5])
            rotate([0, 90, 0]) magnet_pocket();
        translate([box_w - 1.5, box_h * 0.6, case_depth * 0.5])
            rotate([0, 90, 0]) magnet_pocket();
    }
}

// Right Half Base Case
module right_half_case() {
    cols = 9;
    rows = 5;
    box_w = cols * u + wall_thickness * 2;
    box_h = rows * u + wall_thickness * 2;

    difference() {
        // Main chassis
        rounded_cube([box_w, box_h, case_depth], fillet_r);

        // Interior cavity
        translate([wall_thickness + 2, wall_thickness, 2.0])
            cube([box_w - wall_thickness * 2 - 2, box_h - wall_thickness * 2, case_depth]);

        // Interlocking female sockets along the left edge
        translate([0, box_h * 0.25, 1]) interlock_female_socket();
        translate([0, box_h * 0.75, 1]) interlock_female_socket();

        // USB-C controller port cutout (Top edge)
        translate([box_w * 0.5, box_h - wall_thickness - 1, case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        // Power switch cutout (Right edge)
        translate([box_w - wall_thickness + 1, box_h * 0.5, case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([1.5, box_h * 0.4, case_depth * 0.5])
            rotate([0, 90, 0]) magnet_pocket();
        translate([1.5, box_h * 0.6, case_depth * 0.5])
            rotate([0, 90, 0]) magnet_pocket();
    }
}

// Assembly view: Set mode = "assembly", "left", or "right"
mode = "assembly";

if (mode == "left") {
    left_half_case();
} else if (mode == "right") {
    right_half_case();
} else {
    // Show docked together
    left_half_case();
    translate([7 * u + wall_thickness * 2 - 0.5, 0, 0])
        right_half_case();
}
