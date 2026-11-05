/*
 * Interlock Ergo Switch Plate - Kailh Choc v1 (Corne/crkbd Low-Profile)
 * Plate thickness: 1.2mm
 * Switch cutouts: 13.8mm x 13.8mm with 18.0mm X x 17.0mm Y pitch
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
                translate([c * choc_pitch_x + (choc_pitch_x - choc_switch_cutout) * 0.5,
                           (rows - 1 - r) * choc_pitch_y + (choc_pitch_y - choc_switch_cutout) * 0.5,
                           -1])
                    cube([choc_switch_cutout, choc_switch_cutout, choc_plate_thickness + 2]);
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
