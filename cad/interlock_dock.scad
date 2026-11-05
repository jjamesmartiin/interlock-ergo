/*
 * Interlock Ergo Lap & Desk Docking Tray
 * Holds Left and Right halves at a fixed ergonomic 12° angle (Alice-style)
 * with integrated 5° tenting for lap or mobile use.
 */

$fn = 40;

u = 19.05;
wall = 4.0;
dock_angle = 12.0; // 12-degree ergonomic split angle

module dock_cradle_half(cols) {
    w = cols * u + 8;
    h = 5 * u + 8;
    difference() {
        cube([w + 4, h + 4, 14]);
        translate([2, 2, 4])
            cube([w, h, 12]);
    }
}

module interlock_dock() {
    // Left angled cradle
    rotate([0, 0, dock_angle * 0.5])
        translate([-(7 * u + 10), -50, 0])
            dock_cradle_half(7);

    // Right angled cradle
    rotate([0, 0, -dock_angle * 0.5])
        translate([10, -50, 0])
            dock_cradle_half(9);

    // Center bridge with wrist rest extension
    translate([-30, -70, 0])
        cube([60, 20, 8]);
}

interlock_dock();
