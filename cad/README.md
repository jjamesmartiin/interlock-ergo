# Interlock Ergo 3D Printing & CAD Guide

## Slicing & Print Recommendations

- **Recommended Printer:** CoreXY FDM (Elegoo Centauri Carbon, Bambu Lab, Voronoi) or SLA.
- **Filament:** PETG (recommended for toughness and sliding joint resilience) or PLA+ / ABS.
- **Layer Height:** 0.16mm - 0.20mm (use 0.16mm for smoother dovetail sliding surfaces).
- **Perimeters / Walls:** 4 walls for rigid structural integrity and firm switch plate seating.
- **Infill:** 20% Gyroid or Adaptive Cubic.
- **Supports:** None needed if printed flat on bed (`mode = "left"` or `mode = "right"`).

## Interlocking Mechanism Assembly

1. **Magnets:**
   - 4x Neodymium disc magnets (6mm diameter × 3mm thick, Grade N52).
   - Press-fit into the circular side pockets on the interlocking mating edges.
   - **Crucial:** Verify opposite polarities (North facing South) so the two halves pull together strongly rather than repelling.
   - Secure with a small drop of cyanoacrylate (CA / super glue).

2. **Dovetail Fitting:**
   - The male tabs and female sockets include a `0.20mm` design clearance (`interlock_tol`).
   - If sliding fit is too tight due to slight over-extrusion, lightly deburr the dovetail edges with 400-grit sandpaper or a hobby file.
