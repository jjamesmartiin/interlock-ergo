# 3D printing

## Slicing

| | |
|---|---|
| Printer | any FDM with a 220 × 220 mm bed (the right half is 211 × 138 mm) |
| Filament | PETG. It creeps less than PLA under the switch retention load and survives a drop |
| Layer height | 0.16 mm |
| Perimeters | 4 |
| Infill | 20 % gyroid |
| Supports | **none.** Every part is modelled so the tabs, sockets and pockets print as vertical walls or bridgeable holes |

Print the cases with the floor on the bed. Do not scale any part - the switch
apertures and the plate thickness are functional dimensions, not cosmetic ones.

## Parts

| File | Notes |
|---|---|
| `interlock_choc_left/right.stl` | Choc v1 case, 14.2 mm tall |
| `interlock_mx_left/right.stl` | Cherry MX case, 16.0 mm tall |
| `interlock_plate_choc_left/right.stl` | 1.2 mm plate - the only thickness Choc barbs latch into |
| `interlock_plate_mx_left/right.stl` | 1.5 mm plate |
| `dongle_case_base.stl` + `dongle_case_lid.stl` | XIAO nRF52840 |

The left half is always the one with the tabs; the right half always has the
sockets. Print both from the same variant, or the seam will not match.

Build them with `node cad/build_models.js`, which also runs the mesh gate
(`tests/test_models.js`): every part must be one watertight manifold shell whose
dimensions agree with the stackup constants.

## Changing dimensions

All the vertical numbers derive from one chain in `interlock_params.scad`:

```
plate_thickness + plate_gap + pcb_thickness + standoff_h + floor_thickness = case_depth
```

Raise `standoff_h` and the case gets taller, the plate stays where it is and the
PCB moves up with it. Everything else - bosses, rebate, USB window, switch slot -
follows automatically, and `tests/test_models.js` fails if the exported STLs stop
agreeing with the arithmetic. That is the only safe way to make the case deeper
(for a bigger cell) or shallower.

## Interlock

- **Dovetail.** The tabs are a vertical drop-in joint, not a slide: lower one half
  onto the other. Mesh clearance is `interlock_tol = 0.2 mm` on the flanks. If yours
  is tight from over-extrusion, deburr the tab flanks with 400 grit; do not scale
  the model.
- **Magnets.** 4 × Ø6 × 3 mm N52, two per seam, flush with the seam faces. Check
  that each pair **attracts** before any glue goes in - a reversed pair turns the
  joint into a repulsion problem. The polarity dimple on the inside face marks each
  pocket. A small drop of CA or 2-part epoxy, magnet in second, is enough.

## Rendering the previews

`node cad/render_preview.js` re-renders `docs/images/*.png` from the STLs. It is a
software rasteriser because OpenSCAD's PNG export needs an OpenGL context that CI
does not have. `ASCII=1 node cad/render_preview.js hero` prints a coarse luma map
if you want to check a framing without opening the file.
