/*
 * Interlock Ergo Switch Plate - Cherry MX Standard Profile
 * Plate thickness: 1.5mm (Standard MX latch thickness)
 * Matches firmware switch matrix: 34 keys left (with encoder hole), 42 keys right.
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;

plate_w_left = cols_left * mx_pitch_x;
plate_l_left = rows * mx_pitch_y;

plate_w_right = cols_right * mx_pitch_x;
plate_l_right = rows * mx_pitch_y;

module mx_plate_left() {
    difference() {
        cube([plate_w_left, plate_l_left, mx_plate_thickness]);

        for (r = [0 : rows - 1]) {
            for (c = [0 : cols_left - 1]) {
                if (r == 0 && c == 0) {
                    translate([c * mx_pitch_x + mx_pitch_x * 0.5, (rows - 1 - r) * mx_pitch_y + mx_pitch_y * 0.5, -1])
                        cylinder(d = 7.5, h = mx_plate_thickness + 2);
                } else if (r == 4 && c == 5) {
                    // Skip omitted 2.25u space gap
                } else {
                    translate([c * mx_pitch_x + (mx_pitch_x - mx_switch_cutout) * 0.5,
                               (rows - 1 - r) * mx_pitch_y + (mx_pitch_y - mx_switch_cutout) * 0.5,
                               -1])
                        cube([mx_switch_cutout, mx_switch_cutout, mx_plate_thickness + 2]);
                }
            }
        }
    }
}

module mx_plate_right() {
    difference() {
        cube([plate_w_right, plate_l_right, mx_plate_thickness]);

        for (r = [0 : rows - 1]) {
            for (c = [0 : cols_right - 1]) {
                if (r == 2 && (c == 7 || c == 8)) {
                    // Home row terminates at Enter (7 keys)
                } else if (r == 4 && c == 8) {
                    // Bottom row terminates at 8 keys
                } else {
                    translate([c * mx_pitch_x + (mx_pitch_x - mx_switch_cutout) * 0.5,
                               (rows - 1 - r) * mx_pitch_y + (mx_pitch_y - mx_switch_cutout) * 0.5,
                               -1])
                        cube([mx_switch_cutout, mx_switch_cutout, mx_plate_thickness + 2]);
                }
            }
        }
    }
}

mode = "left";

if (mode == "left") {
    mx_plate_left();
} else {
    mx_plate_right();
}
