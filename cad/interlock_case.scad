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
mcu_y_pcb = 17.0;   // controller pad grid centre, from pcb/generate_pcb.js
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

    plate_y = cav_y + plate_off_y;
    ledge_z = case_d - plate_t;

    // One band stack defines the PCB, the cavity, the walls and the plate rebate; the
    // PCB, the plate and the case can therefore not drift apart. See interlock_params.
    pcb_b    = outline_bands(ncols, pitch_x, pitch_y, seam_on_right);
    // Walls: the outer face sits wall_thickness outside the PCB, the seam face
    // seam_wall outside it. The fillet below rounds convex corners without changing
    // that size (offset out then in), so no compensation is needed here.
    case_b   = grow_bands(pcb_b, seam_on_right,
                          wall_thickness + pcb_clearance / 2,
                          seam_wall + pcb_clearance / 2);
    cav_b    = grow_bands(pcb_b, seam_on_right, pcb_clearance / 2, pcb_clearance / 2);
    rebate_b = grow_bands(plate_bands(ncols, pitch_x, pitch_y, seam_on_right),
                          seam_on_right, 0.25, 0.25);

    // (no `out_x`: the power switch is reached from above, through the open bay)

    mcu_x   = cav_x + pw / 2;
    pcb_top = floor_thickness + standoff_h + pcb_thickness;
    // The slide switch sits at PCB (2.05, 12) on each half, on the outer side; it needs
    // no case feature because it is operated from above through the open bay.

    // Cell locating recess, centred in the controller bay under the PCB.
    bat_x = cav_x + pw / 2 - battery_l / 2;
    bat_y = cav_y + (pcb_top_bay - battery_w) / 2;

    // Standoff bosses line up with the PCB's four mounting holes.
    boss_pts = [for (hp = mounting_holes(ncols, pitch_x, pitch_y, seam_on_right))
                    [cav_x + hp[0], cav_y + hp[1]]];

    // Body and tabs first, then every cut, then the bosses: the bosses live inside
    // the cavity, so they have to be added back after the cavity is removed. They
    // also start 0.6mm below the floor surface, because a coplanar face contact
    // leaves them as loose shells instead of fusing with the tray.
    union() {
        difference() {
            union() {
                // Offset in then out rounds every convex corner without changing the
                // outer size, which is what keeps the stepped silhouette printable.
                translate([cav_x, cav_y, 0])
                    linear_extrude(height = case_d)
                        offset(r = case_fillet) offset(delta = -case_fillet)
                            bands_2d(case_b);
                // Dovetail tabs hang off the seam face of the left half only.
                if (seam_on_right) {
                    for (f = tab_y_frac)
                        translate([case_w, case_l * f, 0]) dovetail_tab(case_d);
                }
            }

            // Electronics cavity, up to the underside of the plate.
            translate([cav_x, cav_y, floor_thickness - 0.01])
                linear_extrude(height = ledge_z - floor_thickness + 0.01) bands_2d(cav_b);

            // Plate rebate: the plate drops in so its top is flush with the rim.
            translate([cav_x, cav_y, ledge_z])
                linear_extrude(height = plate_t + 1) bands_2d(rebate_b);

            // Controller bay stays open: the nice!nano, its reset button and the power
            // switch are only reachable from the top. A 2mm ledge is left above the
            // plate: the bay has to be at least 33.02mm deep (nice!nano length) plus
            // the 8mm PCB margin, which a 3mm ledge did not leave room for.
            translate([-10, -10, ledge_z])
                cube([case_w + 20, plate_y - 2.0 + 10, case_d - ledge_z + 1]);

            // USB-C window: the through-cut has to reach past the outer face (the
            // old one started 1.3mm inside it and left a membrane over the port),
            // then an exterior relief pocket so a standard cable overmold can reach
            // the controller's receptacle. The relief breaks the rim above the
            // controller bay, which is open there anyway.
            translate([mcu_x - usb_window_w / 2, -0.5, pcb_top + 2.0 - usb_window_h / 2])
                cube([usb_window_w, wall_thickness + 1.5, usb_window_h]);
            hull() {
                translate([mcu_x - usb_relief_w / 2, -0.5, pcb_top + 2.0 - usb_relief_h / 2])
                    cube([usb_relief_w, 0.5, usb_relief_h]);
                translate([mcu_x - usb_relief_w / 2 + usb_relief_chamfer, usb_relief_d,
                           pcb_top + 2.0 - usb_relief_h / 2 + usb_relief_chamfer])
                    cube([usb_relief_w - 2 * usb_relief_chamfer, 0.01, usb_relief_h - 2 * usb_relief_chamfer]);
            }

            // The power switch needs no cutout. An MSK-12D19 is 3.5mm thick with its
            // actuator on the TOP face and ~2.0mm of travel along its 9mm axis, so it
            // is operated from above, not through a side wall. Its actuator sits at
            // pcb_top + 5.5 = 15.0mm, above the 14.2mm case rim, inside the open
            // controller bay. A side slot would have been at the wrong height and the
            // wrong axis - verified against the LCSC C2904913 body drawing.

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
