/*
 * Interlock Ergo - Kailh Choc v1 (Corne/crkbd Low-Profile Variant)
 * Spacing: 18mm X x 17mm Y
 * Plate thickness: 1.2mm
 * Interlocking seam follows 5-T-G-B (Left) and 6-Y-H-N (Right)
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;

// Overall dimensions
left_w = cols_left * choc_pitch_x + wall_thickness * 2;
left_l = rows * choc_pitch_y + wall_thickness * 2;

right_w = cols_right * choc_pitch_x + wall_thickness * 2;
right_l = rows * choc_pitch_y + wall_thickness * 2;

module choc_left_case() {
    difference() {
        union() {
            rounded_box(left_w, left_l, choc_case_depth, fillet_r);
            // Interlocking male tabs
            translate([left_w - 0.5, left_l * 0.28, 1]) dovetail_male(choc_case_depth);
            translate([left_w - 0.5, left_l * 0.72, 1]) dovetail_male(choc_case_depth);
        }

        // Interior cavity for Choc PCB + 500mAh LiPo
        translate([wall_thickness, wall_thickness, 2.0])
            cube([left_w - wall_thickness * 2 - 2, left_l - wall_thickness * 2, choc_case_depth]);

        // Rotary Encoder Cutout (Top-Left corner)
        translate([wall_thickness + choc_pitch_x * 0.5, left_l - wall_thickness - choc_pitch_y * 0.5, 0])
            cylinder(d = 7.5, h = choc_case_depth * 2, center = true);

        // USB-C controller port cutout
        translate([left_w * 0.45, left_l - wall_thickness - 1, choc_case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 6.0], center = true);

        // Power switch cutout (Left edge)
        translate([-1, left_l * 0.5, choc_case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([left_w - 1.5, left_l * 0.4, choc_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
        translate([left_w - 1.5, left_l * 0.6, choc_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
    }
}

module choc_right_case() {
    difference() {
        rounded_box(right_w, right_l, choc_case_depth, fillet_r);

        // Interior cavity
        translate([wall_thickness + 2, wall_thickness, 2.0])
            cube([right_w - wall_thickness * 2 - 2, right_l - wall_thickness * 2, choc_case_depth]);

        // Interlocking female sockets
        translate([0, right_l * 0.28, 1]) dovetail_female(choc_case_depth);
        translate([0, right_l * 0.72, 1]) dovetail_female(choc_case_depth);

        // USB-C controller port cutout
        translate([right_w * 0.45, right_l - wall_thickness - 1, choc_case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 6.0], center = true);

        // Power switch cutout (Right edge)
        translate([right_w - wall_thickness + 1, right_l * 0.5, choc_case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([1.5, right_l * 0.4, choc_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
        translate([1.5, right_l * 0.6, choc_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
    }
}

// Render mode selector: "assembly", "left", "right"
mode = "assembly";

if (mode == "left") {
    choc_left_case();
} else if (mode == "right") {
    choc_right_case();
} else {
    choc_left_case();
    translate([left_w - 0.5, 0, 0]) choc_right_case();
}
