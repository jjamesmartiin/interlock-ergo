/*
 * Interlock Ergo Case - Kailh Choc v1 Low-Profile Variant
 * Matches PCB footprint: 7 cols left, 9 cols right, 5 rows + top controller bay.
 * Integrated PCB standoff bosses, plate retention ledge, and 0mm-aligned magnet sockets.
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;
top_bay = 28.0;

// Dimensions matching PCB + 1.5mm clearance
left_w = cols_left * choc_pitch_x + wall_thickness * 2 + 16.0;
left_l = rows * choc_pitch_y + top_bay + wall_thickness * 2 + 16.0;

right_w = cols_right * choc_pitch_x + wall_thickness * 2 + 16.0;
right_l = left_l; // Identical length along seam

// Shared magnet Y positions along the seam for 0.00 mm alignment
magnet_y1 = left_l * 0.35;
magnet_y2 = left_l * 0.70;

module choc_left_case() {
    difference() {
        union() {
            rounded_box(left_w, left_l, choc_case_depth, fillet_r);
            // Dovetail male tabs along right seam
            translate([left_w - 0.1, left_l * 0.25, floor_thickness])
                horizontal_dovetail_male(4.5, choc_case_depth - floor_thickness - 1.5);
            translate([left_w - 0.1, left_l * 0.80, floor_thickness])
                horizontal_dovetail_male(4.5, choc_case_depth - floor_thickness - 1.5);
        }

        // Main interior cavity
        translate([wall_thickness, wall_thickness, floor_thickness])
            cube([left_w - wall_thickness * 2, left_l - wall_thickness * 2, choc_case_depth]);

        // USB-C Controller Cutout (Top wall)
        translate([left_w * 0.5, left_l - wall_thickness - 1, floor_thickness + 3.0])
            cube([12.5, wall_thickness + 2, 6.5], center = true);

        // Power switch cutout (Left edge)
        translate([-1, left_l - wall_thickness - 14.0, floor_thickness + 3.0])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // Magnet pockets (recessed inside wall, 0.8mm skin at seam, NO breach)
        translate([left_w - (magnet_depth * 0.5 + wall_skin), magnet_y1, choc_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
        translate([left_w - (magnet_depth * 0.5 + wall_skin), magnet_y2, choc_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
    }

    // PCB Standoff bosses (4 corners of interior)
    translate([wall_thickness + 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([left_w - wall_thickness - 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([wall_thickness + 4.0, left_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([left_w - wall_thickness - 4.0, left_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
}

module choc_right_case() {
    difference() {
        rounded_box(right_w, right_l, choc_case_depth, fillet_r);

        // Interior cavity
        translate([wall_thickness, wall_thickness, floor_thickness])
            cube([right_w - wall_thickness * 2, right_l - wall_thickness * 2, choc_case_depth]);

        // Dovetail female sockets along left seam
        translate([0, right_l * 0.25, floor_thickness])
            horizontal_dovetail_female(4.5, choc_case_depth - floor_thickness - 1.5);
        translate([0, right_l * 0.80, floor_thickness])
            horizontal_dovetail_female(4.5, choc_case_depth - floor_thickness - 1.5);

        // USB-C Controller Cutout (Top wall)
        translate([right_w * 0.5, right_l - wall_thickness - 1, floor_thickness + 3.0])
            cube([12.5, wall_thickness + 2, 6.5], center = true);

        // Power switch cutout (Right edge)
        translate([right_w - wall_thickness + 1, right_l - wall_thickness - 14.0, floor_thickness + 3.0])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        // Magnet pockets (recessed inside wall, exact same Y coordinates as left half!)
        translate([magnet_depth * 0.5 + wall_skin, magnet_y1, choc_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
        translate([magnet_depth * 0.5 + wall_skin, magnet_y2, choc_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
    }

    // PCB Standoff bosses
    translate([wall_thickness + 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([right_w - wall_thickness - 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([wall_thickness + 4.0, right_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([right_w - wall_thickness - 4.0, right_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
}

mode = "assembly";

if (mode == "left") {
    choc_left_case();
} else if (mode == "right") {
    choc_right_case();
} else {
    choc_left_case();
    translate([left_w, 0, 0]) choc_right_case();
}
