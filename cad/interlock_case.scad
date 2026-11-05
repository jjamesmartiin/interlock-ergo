/*
 * Interlock Ergo case - shared implementation for both switch standards.
 *
 * One tray per half: PCB screws down onto four bosses from above, the switch
 * plate drops into a rebate so its top is flush with the case rim, and the
 * controller bay stays open so a nice!nano can be socketed after assembly.
 *
 * Set `variant` to "choc" or "mx" and `mode` to "left", "right" or "assembly".
 * The _choc/_mx wrapper files do this; you normally run them, not this file.
 */

include <interlock_params.scad>

is_mx    = (variant == "mx");
pitch_x  = is_mx ? mx_pitch_x : choc_pitch_x;
pitch_y  = is_mx ? mx_pitch_y : choc_pitch_y;
plate_t  = is_mx ? mx_plate_thickness : choc_plate_thickness;
case_d   = is_mx ? mx_case_depth : choc_case_depth;

// PCB-side component envelope, mirrored from pcb/generate_pcb.js.
mcu_y_pcb = 16.0;   // controller pad grid centre, from pcb/generate_pcb.js
sw_y_pcb  = 12.0;   // power switch centre, same source

module half_case(half) {
    ncols          = (half == "left") ? cols_left : cols_right;
    pw             = pcb_w(ncols, pitch_x);
    pl             = pcb_l(pitch_y);
    plate_pw       = plate_w(ncols, pitch_x);
    plate_pl       = plate_l(pitch_y);

    seam_on_right  = (half == "left");
    wall_l         = seam_on_right ? wall_thickness : seam_wall;
    wall_r         = seam_on_right ? seam_wall : wall_thickness;

    case_w  = wall_l + pw + wall_r + pcb_clearance;
    case_l  = 2 * wall_thickness + pl + pcb_clearance;
    cav_x   = wall_l + pcb_clearance / 2;
    cav_y   = wall_thickness + pcb_clearance / 2;
    cav_w   = pw + pcb_clearance;
    cav_l   = pl + pcb_clearance;

    plate_x = cav_x + plate_off_x;
    plate_y = cav_y + plate_off_y;
    ledge_z = case_d - plate_t;

    out_x   = seam_on_right ? 0 : case_w;          // outer side wall plane

    mcu_x   = cav_x + pw / 2;
    pcb_top = floor_thickness + standoff_h + pcb_thickness;
    sw_x    = cav_x + (seam_on_right ? 2.05 : pw - 2.05);

    // Cell locating recess, centred in the controller bay under the PCB.
    bat_x = cav_x + pw / 2 - battery_l / 2;
    bat_y = cav_y + (pcb_top_bay - battery_w) / 2;

    // Standoff bosses line up with the PCB's four 2.2mm mounting holes at 4mm inset.
    boss_pts = [
        [cav_x + 4, cav_y + 4],
        [cav_x + pw - 4, cav_y + 4],
        [cav_x + 4, cav_y + pl - 4],
        [cav_x + pw - 4, cav_y + pl - 4]
    ];

    // Body and tabs first, then every cut, then the bosses: the bosses live inside
    // the cavity, so they have to be added back after the cavity is removed. They
    // also start 0.6mm below the floor surface, because a coplanar face contact
    // leaves them as loose shells instead of fusing with the tray.
    union() {
        difference() {
            union() {
                rounded_box(case_w, case_l, case_d, fillet_r);
                // Dovetail tabs hang off the seam face of the left half only.
                if (seam_on_right) {
                    for (f = tab_y_frac)
                        translate([case_w, case_l * f, 0]) dovetail_tab(case_d);
                }
            }

            // Electronics cavity, up to the underside of the plate.
            translate([cav_x, cav_y, floor_thickness - 0.01])
                cube([cav_w, cav_l, ledge_z - floor_thickness + 0.01]);

            // Plate rebate: the plate drops in so its top is flush with the rim.
            translate([plate_x - 0.25, plate_y - 0.25, ledge_z])
                cube([plate_pw + 0.5, plate_pl + 0.5, plate_t + 1]);

            // Controller bay stays open: the nice!nano and its reset button are
            // only reachable from the top. Leaves a 3mm ledge above the plate.
            translate([cav_x, cav_y, ledge_z])
                cube([cav_w, plate_y - 3.0 - cav_y, case_d - ledge_z + 1]);

            // USB-C window through the front wall, aligned with the controller.
            translate([mcu_x, cav_y + 1, pcb_top + 2.0])
                cube([10.0, wall_thickness + 4, 4.6], center = true);

            // Power switch: through-slot in the outer wall at the actuator height,
            // plus a finger recess centred on the wall face (1.2mm relieved outside).
            translate([out_x, cav_y + sw_y_pcb, pcb_top + 1.1])
                cube([wall_thickness + 4, 6.0, 4.0], center = true);
            translate([out_x, cav_y + sw_y_pcb, pcb_top + 1.1])
                cube([2.4, 12.0, 6.0], center = true);

            // Cell locating recess in the bay floor.
            translate([bat_x, bat_y, floor_thickness - battery_recess])
                cube([battery_l + 1.0, battery_w + 1.0, battery_recess + 0.01]);

            // Seam interface: sockets on the right half, magnet pockets on both.
            if (!seam_on_right) {
                for (f = tab_y_frac)
                    translate([0, case_l * f, 0]) dovetail_socket(case_d);
            }
            for (f = magnet_y_frac) {
                if (seam_on_right) {
                    translate([case_w, case_l * f, case_d / 2]) mirror([1, 0, 0]) magnet_pocket();
                    translate([case_w + 0.4, case_l * f, case_d / 2 - magnet_d / 2 - 1.6])
                        mirror([1, 0, 0]) polarity_dimple();
                } else {
                    translate([0, case_l * f, case_d / 2]) magnet_pocket();
                    translate([-0.4, case_l * f, case_d / 2 - magnet_d / 2 - 1.6]) polarity_dimple();
                }
            }
        }

        for (b = boss_pts) translate([b[0], b[1], floor_thickness - 0.6]) standoff_boss(standoff_h + 0.6);
    }
}

if (mode == "left") {
    half_case("left");
} else if (mode == "right") {
    half_case("right");
} else {
    // Docked pose. The two seam faces touch, so the right half is offset by the
    // left half's full width.
    half_case("left");
    translate([pcb_w(cols_left, pitch_x) + wall_thickness + seam_wall + pcb_clearance, 0, 0])
        half_case("right");
}
