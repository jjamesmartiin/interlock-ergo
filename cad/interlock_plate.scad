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

module switch_plate(half) {
    ncols = (half == "left") ? cols_left : cols_right;

    // Same stepped outline as the PCB and the case rebate: a rectangular plate would
    // stick out through the case wall on the rows where the silhouette steps in.
    // Origin stays at the plate's top-left corner (= plate_off_x/plate_off_y in PCB
    // coordinates), so the aperture maths below is unchanged.
    bands = plate_bands(ncols, pitch_x, pitch_y, half == "left");

    difference() {
        translate([-plate_off_x, -plate_off_y, 0])
            linear_extrude(height = plate_t) bands_2d(bands);

        for (r = [0 : rows - 1]) {
            for (c = [0 : ncols - 1]) {
                x0 = c * pitch_x + row_stagger_u[r] * pitch_x;
                y0 = r * pitch_y;
                if (half == "left" && r == 4 && c == 4) {
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
