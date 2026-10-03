# Credits: source assets for the corridor render

Every downloaded asset is licensed CC0 1.0 (public domain,
https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required; it is given
here anyway. The files are not committed: `npm run corridor:fetch` downloads them into
`corridor3d/textures/`. The list the script reads is `assets.json`.

## Textures from Poly Haven (https://polyhaven.com, CC0): diffuse, normal, roughness

| Asset | Size, real scale | Used for | URL |
|-------|------------------|----------|-----|
| decrepit_wallpaper | 2k, 2.5 m | The wallpaper: base of every wall panel, its normal and roughness under all of them, and the peeling strips | https://polyhaven.com/a/decrepit_wallpaper |
| wood_cabinet_worn_long | 2k, 1.0 x 0.5 m (laid at 1.86 x 0.93 m) | The boarded wainscot: albedo, normal and roughness, the boards shuffled | https://polyhaven.com/a/wood_cabinet_worn_long |
| wood_table_001 | 2k, 1.5 m | Door leaves (stiles, rails, panels cut from it), the clawed inside of door 305, the grain normal of every leaf | https://polyhaven.com/a/wood_table_001 |
| dark_wood | 2k, 2.0 m | Skirting, dado rail, architraves, door linings, leaf edges | https://polyhaven.com/a/dark_wood |
| plank_flooring | 2k, 1.34 m | Worn strip parquet beside the runner | https://polyhaven.com/a/plank_flooring |
| painted_plaster_wall | 1k, 2.0 m | Ceiling and cornice | https://polyhaven.com/a/painted_plaster_wall |
| worn_plaster_wall | 1k, 1.8 m | Bare plaster where the wallpaper has come away (decals) | https://polyhaven.com/a/worn_plaster_wall |
| rough_wood | 1k, 0.9 m | The boards nailed across door 312 | https://polyhaven.com/a/rough_wood |

## Texture from ambientCG (https://ambientcg.com, CC0): colour, normal, roughness

| Asset | Size, real scale | Used for | URL |
|-------|------------------|----------|-----|
| Carpet015 | 2K, 0.4 m (photogrammetry) | The woven runner: base of every carpet panel, its normal and roughness under all of them | https://ambientcg.com/a/Carpet015 |

## Model from Poly Haven (CC0)

| Asset | Used for | URL |
|-------|----------|-----|
| korean_fire_extinguisher_01 | The fire extinguisher by the right wall (its moulded plastic stand is cut away) | https://polyhaven.com/a/korean_fire_extinguisher_01 |

## Authored here (no outside source)

Baked in code in `src/surfaces.js`, on top of the scans above: every wall panel (the faded
print, the lengths and their seams, nicotine, soot, water and tide lines, mould, damp, hand
grime, the ghosts of removed pictures, scratches, the wear of the wainscot), every carpet panel
(the stripes, the worn path, bald patches, dirt, stains, lint), every door skin (how the leaf
is framed, joints, grease, rubbed varnish, kicked bottom rail, chips) and the door sheen map.
In `src/textures.js`: the decal atlas (dried blood, water stains, grime, gouges, carpet stains,
rubbed varnish), the gouges on the clawed face of door 305, the brass number plates, the exit
sign, the do-not-disturb card, the framed prints, the mottled glow of the lamp shades.
Modelled in code: the corridor, the doors and their furniture, the lamps, the child's shoe, the
housekeeping trolley, the peeling wallpaper, and the figure behind door 308.

## Software

three.js (MIT), three-gpu-pathtracer (MIT), three-mesh-bvh (MIT), sharp (Apache-2.0),
Playwright (Apache-2.0). Dev dependencies only: nothing of them is shipped to the browser.
