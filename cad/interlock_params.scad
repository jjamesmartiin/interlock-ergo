/*
 * Interlock Ergo - Shared Parametric Definitions
 * Supports both Kailh Choc v1 (crkbd/corne style) and Cherry MX standards.
 */

// Global OpenSCAD rendering resolution
$fn = 40;

// Interlocking mechanical tolerances
interlock_tol = 0.20;     // 0.2mm sliding joint clearance
magnet_d = 6.2;           // Pocket for 6mm disc magnet
magnet_h = 3.2;           // Pocket depth for 3mm magnet
fillet_r = 3.0;           // Outer chassis corner radius
wall_thickness = 3.5;     // Exterior perimeter wall

// Switch Standards
// Choc v1 (Corne/crkbd standard): 18.0mm X pitch, 17.0mm Y pitch, 1.2mm plate thickness
choc_pitch_x = 18.0;
choc_pitch_y = 17.0;
choc_switch_cutout = 13.8;
choc_plate_thickness = 1.2;
choc_case_depth = 9.5;    // Low profile depth

// MX Standard: 19.05mm X pitch, 19.05mm Y pitch, 1.5mm plate thickness
mx_pitch_x = 19.05;
mx_pitch_y = 19.05;
mx_switch_cutout = 14.0;
mx_plate_thickness = 1.5;
mx_case_depth = 12.5;     // Standard MX depth

// Common utility: Rounded box
module rounded_box(w, l, h, r) {
    hull() {
        translate([r, r, 0]) cylinder(r = r, h = h);
        translate([w - r, r, 0]) cylinder(r = r, h = h);
        translate([w - r, l - r, 0]) cylinder(r = r, h = h);
        translate([r, l - r, 0]) cylinder(r = r, h = h);
    }
}

// Interlocking male dovetail tab
module dovetail_male(depth) {
    linear_extrude(height = depth - 2) {
        polygon(points = [
            [0, -6],
            [5.5, -4],
            [5.5, 4],
            [0, 6]
        ]);
    }
}

// Interlocking female dovetail socket
module dovetail_female(depth) {
    linear_extrude(height = depth) {
        polygon(points = [
            [-0.1, -6 - interlock_tol],
            [5.5 + interlock_tol, -4 - interlock_tol],
            [5.5 + interlock_tol, 4 + interlock_tol],
            [-0.1, 6 + interlock_tol]
        ]);
    }
}

// Magnet pocket
module magnet_cavity() {
    cylinder(d = magnet_d, h = magnet_h, center = true);
}
