/*
 * Interlock Ergo Switch Plate - Kailh Choc v1 Low-Profile
 * Plate thickness: 1.2mm (Mandatory for Choc stabilizer clip retention)
 * Matches firmware switch matrix: 34 keys left (with encoder hole), 42 keys right.
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;

plate_w_left = cols_left * choc_pitch_x;
plate_l_left = rows * choc_pitch_y;

plate_w_right = cols_right * choc_pitch_x;
plate_l_right = rows * choc_pitch_y;

module choc_plate_left() {
    difference() {
        cube([plate_w_left, plate_l_left, choc_plate_thickness]);

        for (r = [0 : rows - 1]) {
            for (c = [0 : cols_left - 1]) {
                if (r == 0 && c == 0) {
                    // Encoder mounting hole
                    translate([c * choc_pitch_x + choc_pitch_x * 0.5, (rows - 1 - r) * choc_pitch_y + choc_pitch_y * 0.5, -1])
                        cylinder(d = 7.5, h = choc_plate_thickness + 2);
                } else if (r == 4 && c == 5) {
                    // Skip omitted 2.25u space gap
                } else {
                    translate([c * choc_pitch_x + (choc_pitch_x - choc_switch_cutout) * 0.5,
                               (rows - 1 - r) * choc_pitch_y + (choc_pitch_y - choc_switch_cutout) * 0.5,
                               -1])
                        cube([choc_switch_cutout, choc_switch_cutout, choc_plate_thickness + 2]);
                }
            }
        }
    }
}

module choc_plate_right() {
    difference() {
        cube([plate_w_right, plate_l_right, choc_plate_thickness]);

        for (r = [0 : rows - 1]) {
            for (c = [0 : cols_right - 1]) {
                if (r == 2 && (c == 7 || c == 8)) {
                    // Home row terminates at Enter (7 keys)
                } else if (r == 4 && c == 8) {
                    // Bottom row terminates at 8 keys
                } else {
                    translate([c * choc_pitch_x + (choc_pitch_x - choc_switch_cutout) * 0.5,
                               (rows - 1 - r) * choc_pitch_y + (choc_pitch_y - choc_switch_cutout) * 0.5,
                               -1])
                        cube([choc_switch_cutout, choc_switch_cutout, choc_plate_thickness + 2]);
                }
            }
        }
    }
}

mode = "left";

if (mode == "left") {
    choc_plate_left();
} else {
    choc_plate_right();
}
