/*
 * Interlock Ergo switch plate - shared implementation.
 *
 * The plate is the only part that retains the switches, so its apertures and
 * thickness are the load-bearing dimensions. It drops into the case rebate with
 * its top flush and is held down by the switches themselves.
 *
 * Plate-local origin is its top-left corner; the case positions it at
 * (plate_off_x, plate_off_y) from the PCB's top-left corner.
 */

include <interlock_params.scad>

is_mx   = (variant == "mx");
pitch_x = is_mx ? mx_pitch_x : choc_pitch_x;
pitch_y = is_mx ? mx_pitch_y : choc_pitch_y;
plate_t = is_mx ? mx_plate_thickness : choc_plate_thickness;
cutout  = is_mx ? mx_switch_cutout : choc_switch_cutout;

enc_body   = 13.5;   // EC11 body clearance square (through hole)

module switch_plate(half) {
    ncols = (half == "left") ? cols_left : cols_right;
    pw    = plate_w(ncols, pitch_x);
    pl    = plate_l(pitch_y);

    difference() {
        cube([pw, pl, plate_t]);

        for (r = [0 : rows - 1]) {
            for (c = [0 : ncols - 1]) {
                x0 = c * pitch_x + row_stagger_u[r] * pitch_x;
                y0 = r * pitch_y;
                if (half == "left" && r == 0 && c == 0) {
                    // Rotary encoder: the 12.4mm body sits on the PCB and passes
                    // straight through the plate, so this must be a through hole.
                    // centre=true centres Z as well, so anchor it on the plate mid-plane
                    // or the cut only reaches partway through and the body bottoms out.
                    translate([x0 + pitch_x / 2, y0 + pitch_y / 2, plate_t / 2])
                        cube([enc_body, enc_body, plate_t + 2], center = true);
                } else if (half == "left" && r == 4 && c == 5) {
                    // No switch here: the left bottom row skips a position.
                } else if (half == "right" && r == 2 && (c == 7 || c == 8)) {
                    // Home row ends at Enter.
                } else if (half == "right" && r == 4 && c == 8) {
                    // Bottom row ends at Page Down.
                } else {
                    translate([x0 + (pitch_x - cutout) / 2, y0 + (pitch_y - cutout) / 2, -1])
                        cube([cutout, cutout, plate_t + 2]);
                }
            }
        }
    }
}

if (mode == "left") {
    switch_plate("left");
} else if (mode == "right") {
    switch_plate("right");
} else {
    switch_plate("left");
    translate([0, plate_l(pitch_y) + 10, 0]) switch_plate("right");
}
