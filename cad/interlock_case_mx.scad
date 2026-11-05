/*
 * Interlock Ergo Case - Cherry MX Standard Profile Variant
 * Matches MX PCB footprint: 7 cols left, 9 cols right, 5 rows + top controller bay.
 * Integrated PCB standoff bosses, plate retention ledge, and 0mm-aligned magnet sockets.
 */

include <interlock_params.scad>

cols_left = 7;
cols_right = 9;
rows = 5;
top_bay = 28.0;

left_w = cols_left * mx_pitch_x + wall_thickness * 2 + 16.0;
left_l = rows * mx_pitch_y + top_bay + wall_thickness * 2 + 16.0;

right_w = cols_right * mx_pitch_x + wall_thickness * 2 + 16.0;
right_l = left_l;

magnet_y1 = left_l * 0.35;
magnet_y2 = left_l * 0.70;

module mx_left_case() {
    difference() {
        union() {
            rounded_box(left_w, left_l, mx_case_depth, fillet_r);
            translate([left_w - 0.1, left_l * 0.25, floor_thickness])
                horizontal_dovetail_male(4.5, mx_case_depth - floor_thickness - 1.5);
            translate([left_w - 0.1, left_l * 0.80, floor_thickness])
                horizontal_dovetail_male(4.5, mx_case_depth - floor_thickness - 1.5);
        }

        translate([wall_thickness, wall_thickness, floor_thickness])
            cube([left_w - wall_thickness * 2, left_l - wall_thickness * 2, mx_case_depth]);

        translate([left_w * 0.5, left_l - wall_thickness - 1, floor_thickness + 3.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        translate([-1, left_l - wall_thickness - 14.0, floor_thickness + 3.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        translate([left_w - (magnet_depth * 0.5 + wall_skin), magnet_y1, mx_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
        translate([left_w - (magnet_depth * 0.5 + wall_skin), magnet_y2, mx_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
    }

    translate([wall_thickness + 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([left_w - wall_thickness - 4.0, wall_thickness + 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([wall_thickness + 4.0, left_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
    translate([left_w - wall_thickness - 4.0, left_l - wall_thickness - 4.0, floor_thickness])
        standoff_boss(standoff_h);
}

module mx_right_case() {
    difference() {
        rounded_box(right_w, right_l, mx_case_depth, fillet_r);

        translate([wall_thickness, wall_thickness, floor_thickness])
            cube([right_w - wall_thickness * 2, right_l - wall_thickness * 2, mx_case_depth]);

        translate([0, right_l * 0.25, floor_thickness])
            horizontal_dovetail_female(4.5, mx_case_depth - floor_thickness - 1.5);
        translate([0, right_l * 0.80, floor_thickness])
            horizontal_dovetail_female(4.5, mx_case_depth - floor_thickness - 1.5);

        translate([right_w * 0.5, right_l - wall_thickness - 1, floor_thickness + 3.5])
            cube([12.5, wall_thickness + 2, 7.0], center = true);

        translate([right_w - wall_thickness + 1, right_l - wall_thickness - 14.0, floor_thickness + 3.5])
            cube([wall_thickness + 2, 9.0, 4.0], center = true);

        translate([magnet_depth * 0.5 + wall_skin, magnet_y1, mx_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
        translate([magnet_depth * 0.5 + wall_skin, magnet_y2, mx_case_depth * 0.5])
            rotate([0, 90, 0]) cylinder(d = magnet_d, h = magnet_depth, center = true);
    }

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
    mx_left_case();
} else if (mode == "right") {
    mx_right_case();
} else {
    mx_left_case();
    translate([left_w, 0, 0]) mx_right_case();
}
