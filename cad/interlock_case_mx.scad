/*
 * Interlock Ergo - Cherry MX Standard Profile Variant
 * Spacing: 19.05mm X x 19.05mm Y
 * Plate thickness: 1.5mm
 * Interlocking seam follows 5-T-G-B (Left) and 6-Y-H-N (Right)
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;

// Overall dimensions
left_w = cols_left * mx_pitch_x + wall_thickness * 2;
left_l = rows * mx_pitch_y + wall_thickness * 2;

right_w = cols_right * mx_pitch_x + wall_thickness * 2;
right_l = rows * mx_pitch_y + wall_thickness * 2;

module mx_left_case() {
    difference() {
        union() {
            rounded_box(left_w, left_l, mx_case_depth, fillet_r);
            // Interlocking male tabs
            translate([left_w - 0.5, left_l * 0.28, 1]) dovetail_male(mx_case_depth);
            translate([left_w - 0.5, left_l * 0.72, 1]) dovetail_male(mx_case_depth);
        }

        // Interior cavity
        translate([wall_thickness, wall_thickness, 2.0])
            cube([left_w - wall_thickness * 2 - 2, left_l - wall_thickness * 2, mx_case_depth]);

        // Rotary Encoder Cutout
        translate([wall_thickness + mx_pitch_x * 0.5, left_l - wall_thickness - mx_pitch_y * 0.5, 0])
            cylinder(d = 7.5, h = mx_case_depth * 2, center = true);

        // USB-C controller port cutout
        translate([left_w * 0.45, left_l - wall_thickness - 1, mx_case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        // Power switch cutout (Left edge)
        translate([-1, left_l * 0.5, mx_case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([left_w - 1.5, left_l * 0.4, mx_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
        translate([left_w - 1.5, left_l * 0.6, mx_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
    }
}

module mx_right_case() {
    difference() {
        rounded_box(right_w, right_l, mx_case_depth, fillet_r);

        // Interior cavity
        translate([wall_thickness + 2, wall_thickness, 2.0])
            cube([right_w - wall_thickness * 2 - 2, right_l - wall_thickness * 2, mx_case_depth]);

        // Interlocking female sockets
        translate([0, right_l * 0.28, 1]) dovetail_female(mx_case_depth);
        translate([0, right_l * 0.72, 1]) dovetail_female(mx_case_depth);

        // USB-C controller port cutout
        translate([right_w * 0.45, right_l - wall_thickness - 1, mx_case_depth * 0.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        // Power switch cutout (Right edge)
        translate([right_w - wall_thickness + 1, right_l * 0.5, mx_case_depth * 0.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // 6x3mm Magnet cavities on the interlocking face
        translate([1.5, right_l * 0.4, mx_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
        translate([1.5, right_l * 0.6, mx_case_depth * 0.5])
            rotate([0, 90, 0]) magnet_cavity();
    }
}

mode = "assembly";

if (mode == "left") {
    mx_left_case();
} else if (mode == "right") {
    mx_right_case();
} else {
    mx_left_case();
    translate([left_w - 0.5, 0, 0]) mx_right_case();
}
