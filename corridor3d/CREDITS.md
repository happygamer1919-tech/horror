# Credits: source assets for the corridor render

Every downloaded asset is from Poly Haven (https://polyhaven.com) and is licensed CC0 1.0
(public domain, https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required;
it is given here anyway. The files are not committed: `npm run corridor:fetch` downloads them
into `corridor3d/textures/`. The list the script reads is `assets.json`.

## Textures (diffuse, normal, roughness)

| Asset | Used for | URL |
|-------|----------|-----|
| dirty_carpet | Pile and dirt of the carpet runner | https://polyhaven.com/a/dirty_carpet |
| decrepit_wallpaper | Stains and surface of the wallpaper | https://polyhaven.com/a/decrepit_wallpaper |
| oak_veneer_01 | Door leaves, and the base of the clawed door face | https://polyhaven.com/a/oak_veneer_01 |
| dark_wood | Skirting, dado rail, architraves, door linings | https://polyhaven.com/a/dark_wood |
| wood_cabinet_worn_long | Wainscot boards | https://polyhaven.com/a/wood_cabinet_worn_long |
| wood_floor_worn | Floorboards beside the runner | https://polyhaven.com/a/wood_floor_worn |
| painted_plaster_wall | Ceiling and cornice | https://polyhaven.com/a/painted_plaster_wall |
| worn_plaster_wall | Bare plaster where the wallpaper has come away | https://polyhaven.com/a/worn_plaster_wall |
| rough_wood | The boards nailed across door 312 | https://polyhaven.com/a/rough_wood |

## Model

| Asset | Used for | URL |
|-------|----------|-----|
| korean_fire_extinguisher_01 | The fire extinguisher by the right wall | https://polyhaven.com/a/korean_fire_extinguisher_01 |

## Authored here (no outside source)

Drawn in code in `src/textures.js`: the wallpaper print, the pattern of the carpet runner,
the decal atlas (dried blood, water stains, grime, gouges, carpet stains), the clawed face of
door 305, the brass number plates, the exit sign, the do-not-disturb card, the framed prints.
Modelled in code: the corridor, the doors and their furniture, the lamps, the child's shoe, the
housekeeping trolley, the peeling wallpaper, and the figure behind door 308.

## Software

three.js (MIT), three-gpu-pathtracer (MIT), three-mesh-bvh (MIT), sharp (Apache-2.0),
Playwright (Apache-2.0). Dev dependencies only: nothing of them is shipped to the browser.
