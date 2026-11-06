/*
 * Interlock Ergo - shared parameters for the case, plates and dongle.
 *
 * Everything vertical is derived from one stackup so the case, plate and PCB
 * cannot drift apart. The dimensional chain, top to bottom, is:
 *
 *     plate top  = case_depth                          (flush with the case rim)
 *     plate bottom = case_depth - plate_thickness      <- the plate ledge
 *     PCB top    = plate bottom - plate_gap
 *     PCB bottom = PCB top - pcb_thickness             (sits on the bosses)
 *     floor top  = PCB bottom - standoff_h
 *     floor bottom = 0
 *
 * Horizontal numbers that must match pcb/generate_pcb.js are marked "PCB".
 */

$fa = 2;
$fs = 0.4;

// ---------------------------------------------------------------- vertical stack

pcb_thickness   = 1.6;
floor_thickness = 2.4;
standoff_h      = 5.5;   // floor top -> PCB underside; must clear the cell below it
wall_thickness  = 4.0;   // outer side walls
seam_wall       = 6.0;   // thicker: it has to carry the dovetail socket
fillet_r        = 3.0;
pcb_clearance   = 0.6;   // total X/Y slop around the PCB (0.3 per side)

// Cell: a protected LP402030 pouch. The cell is 4.0 x 20 x 30 mm but the PCM
// protection board adds ~3.2 mm on one end, so the pack is ~34 mm long; allow 35.
// Rated 200 mAh. A 503040 does not fit - see docs/assembly.md.
battery_l      = 35.0;
battery_w      = 21.0;
battery_t      = 4.5;   // pack + tape
battery_recess = 1.0;   // locating recess in the floor

// Kailh Choc v1 (Corne/crkbd low-profile)
choc_pitch_x            = 18.0;
choc_pitch_y            = 17.0;
choc_switch_cutout      = 14.0;  // Kailh's 13.8 +/- 0.2, taken at the upper bound
choc_plate_thickness    = 1.2;   // Choc retention barbs only latch in 1.2mm
choc_plate_gap          = 3.5;   // plate underside -> PCB top, under the switch body.
                                 // INFERRED, not read: Kailh's PG1350 drawing is a vector
                                 // outline with no text layer. The recovered chain (body
                                 // 5.00 tall, 1.30 plate seat, 4.70 to the seat top) is
                                 // consistent with 3.5 + 1.2 plate. This is the only
                                 // dimension here that is not from a drawing, and every
                                 // vertical number hangs off it - see docs/assembly.md for
                                 // the dry-fit procedure that settles it in two prints.

// Cherry MX
mx_pitch_x           = 19.05;
mx_pitch_y           = 19.05;
mx_switch_cutout     = 14.0;
mx_plate_thickness   = 1.5;
mx_plate_gap         = 5.0;

// Derived case depths (asserted below)
choc_case_depth = floor_thickness + standoff_h + pcb_thickness + choc_plate_gap + choc_plate_thickness;
mx_case_depth   = floor_thickness + standoff_h + pcb_thickness + mx_plate_gap + mx_plate_thickness;

// ---------------------------------------------------------------- PCB layout (PCB)

row_stagger_u = [0, 0.5, 0.75, 1.25, 0.25];  // ANSI stagger, key units, row 0 = number row
stagger_max_u = 1.25;
pcb_margin_x  = 8.0;    // PCB edge margin around the key field
pcb_margin_y  = 8.0;
pcb_top_bay   = 28.0;   // controller bay at the top of the PCB
cols_left     = 7;
cols_right    = 9;
rows          = 5;

function pcb_w(cols, pitch_x) = cols * pitch_x + 2 * pcb_margin_x + stagger_max_u * pitch_x;
function pcb_l(pitch_y)       = rows * pitch_y + 2 * pcb_margin_y + pcb_top_bay;
function plate_w(cols, pitch_x) = cols * pitch_x + stagger_max_u * pitch_x;
function plate_l(pitch_y)       = rows * pitch_y;

// The plate sits this far inside the cavity. Must match the PCB switch grid:
// PCB switch (row 0, col 0) is at (pcb_margin_x + pitch_x/2, pcb_top_bay + pcb_margin_y + pitch_y/2)
// and plate switch (row 0, col 0) is at (pitch_x/2, pitch_y/2).
plate_off_x = pcb_margin_x;
plate_off_y = pcb_top_bay + pcb_margin_y;

// ---------------------------------------------------------------- magnets

magnet_d            = 6.0;   // 6 x 3 mm N52 disc
magnet_pocket_d     = 6.2;   // 0.1 mm radial clearance for glue
magnet_pocket_depth = 3.2;   // 0.2 mm glue relief behind a 3.0 mm magnet
magnet_chamfer      = 0.5;   // lead-in at the seam face
magnet_y_frac       = [0.35, 0.70];

// ---------------------------------------------------------------- dovetail

// Sliding fit: clearance on the flanks only, the thrust faces stay tight.
interlock_tol = 0.20;
tab_protrusion = 3.0;    // must stay under seam_wall - 1.0 so the socket stays blind
tab_throat     = 6.0;    // profile width at the seam face
tab_head       = 9.0;    // profile width at the tab tip (the undercut)
tab_y_frac     = [0.25, 0.75];
tab_lead_in    = 0.8;    // chamfer at the socket mouth and tab root

// ---------------------------------------------------------------- guards

assert(abs(choc_case_depth - (floor_thickness + standoff_h + pcb_thickness + choc_plate_gap + choc_plate_thickness)) < 1e-6,
       "choc_case_depth must equal the stackup sum");
assert(abs(mx_case_depth - (floor_thickness + standoff_h + pcb_thickness + mx_plate_gap + mx_plate_thickness)) < 1e-6,
       "mx_case_depth must equal the stackup sum");
assert(tab_protrusion <= seam_wall - 1.0,
       "dovetail socket would break through the seam wall; shorten tab_protrusion or thicken seam_wall");
assert(magnet_pocket_depth <= seam_wall - 1.5,
       "magnet pocket would leave less than 1.5mm behind it; thicken seam_wall");
assert(tab_head > tab_throat, "the dovetail must be wider at the tip than at the throat");
assert(battery_t < standoff_h, "the cell is taller than the space under the PCB");
assert(plate_off_x + plate_w(cols_left, choc_pitch_x) < pcb_w(cols_left, choc_pitch_x),
       "plate overhangs the PCB on the left half");
assert(plate_off_x + plate_w(cols_right, choc_pitch_x) < pcb_w(cols_right, choc_pitch_x),
       "plate overhangs the PCB on the right half");

// ---------------------------------------------------------------- primitives

module rounded_box(w, l, h, r) {
    hull() {
        for (x = [r, w - r]) for (y = [r, l - r]) translate([x, y, 0]) cylinder(r = r, h = h);
    }
}

// M2 self-tapping boss the PCB screws down onto from above.
module standoff_boss(h) {
    difference() {
        cylinder(d = 6.0, h = h);
        translate([0, 0, -0.5]) cylinder(d = 1.6, h = h + 1.0);
    }
}

// Male dovetail tab, extruded vertically so the case prints with no overhang.
// `protrusion` runs along +X from the seam face at x = 0.
module dovetail_tab(height) {
    hz = tab_head / 2;
    tz = tab_throat / 2;
    inset = 0.8;  // start inside the wall so the union cannot end up with a
                  // coplanar face contact, which CGAL leaves as a loose shell
    linear_extrude(height = height) {
        polygon(points = [
            [-inset, -tz],
            [tab_protrusion, -hz],
            [tab_protrusion, hz],
            [-inset, tz]
        ]);
    }
}

// Female socket: the same profile, offset outward (flank clearance), blind, with
// a straight flared mouth over the top `tab_lead_in` so the tab self-guides in.
module dovetail_socket(height) {
    hz = tab_head / 2 + interlock_tol;
    tz = tab_throat / 2 + interlock_tol;
    d  = tab_protrusion + 0.2;
    union() {
        translate([0, 0, -1]) linear_extrude(height = height + 2) {
            polygon(points = [
                [-0.1, -tz],
                [d, -hz],
                [d, hz],
                [-0.1, tz]
            ]);
        }
        // The mouth is 0.1mm proud of the undercut so the two cut surfaces never
        // coincide exactly; an exact coincidence leaves zero-area slivers in the mesh.
        translate([0, 0, height - tab_lead_in]) linear_extrude(height = tab_lead_in + 1) {
            polygon(points = [
                [-0.1, -(hz + 0.1)],
                [d + 0.1, -(hz + 0.1)],
                [d + 0.1, hz + 0.1],
                [-0.1, hz + 0.1]
            ]);
        }
    }
}

// Magnet pocket, opening flush at the seam face (x = 0), cut into the wall on +X.
module magnet_pocket() {
    rotate([0, 90, 0]) {
        cylinder(d = magnet_pocket_d, h = magnet_pocket_depth);
        translate([0, 0, magnet_pocket_depth - magnet_chamfer])
            cylinder(d1 = magnet_pocket_d, d2 = magnet_pocket_d + 2 * magnet_chamfer, h = magnet_chamfer);
    }
}

// Polarity dimple beside each magnet pocket, cut into the seam face: visible while
// the halves are apart, so a reversed pair is caught before the glue goes off.
module polarity_dimple() {
    // 1.0 deep, sunk 0.4 below the face so the cut opens to air instead of
    // leaving a 0.01mm skin that CGAL exports as a detached inner shell.
    rotate([0, 90, 0]) cylinder(d = 2.0, h = 1.0);
}
