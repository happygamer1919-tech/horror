// Materials. userData.size is the real-world size of one texture tile in metres (the Bag
// turns metre UVs into texture UVs with it), userData.swapUV rotates the grain.
import * as THREE from 'three';

export function makeMaterials(T) {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const rep = (t, x, y = x) => {
    // a second map on a material whose UVs are scaled for a different tile size
    const c = t.clone();
    c.repeat.set(x, y);
    c.needsUpdate = true;
    return c;
  };
  const sized = (m, size, swapUV = false) => {
    m.userData.size = size;
    m.userData.swapUV = swapUV;
    return m;
  };
  const m = {};

  // Wallpaper: a regency stripe, two 53 cm lengths to the tile (surfaces.js).
  m.wallpaper = sized(
    P({
      map: T.wallpaper,
      normalMap: T.wallpaperNormal,
      roughnessMap: T.wallpaperRough,
      normalScale: new THREE.Vector2(1, 1),
      roughness: 1,
      vertexColors: true,
    }),
    [1.06, 1.06],
  );
  m.wallpaperPeel = sized(
    P({ map: T.wallpaper, roughness: 0.9, vertexColors: true, side: THREE.FrontSide }),
    [1.06, 1.06],
  );
  m.paperBack = sized(P({ map: T.paperBack, roughness: 0.95, vertexColors: true, side: THREE.FrontSide }), [0.6, 0.6]);
  m.plaster = sized(
    P({ map: T.worn_plaster_wall.map, normalMap: T.worn_plaster_wall.normalMap, roughnessMap: T.worn_plaster_wall.roughnessMap, roughness: 1, vertexColors: true }),
    [1.8, 1.8],
  );

  // Wainscot: book-matched walnut veneer panels under amber lacquer, two to the 1.2 m tile.
  // (Clearcoat renders black in this tracer: the lacquer is a low roughness on the wood itself.)
  m.wainscot = sized(
    P({
      map: T.wainscot,
      normalMap: T.wainscotNormal,
      roughnessMap: T.wainscotRough,
      normalScale: new THREE.Vector2(1, 1),
      roughness: 1,
      vertexColors: true,
    }),
    [1.2, 1.2],
  );
  // Trim: skirting, dado rail, architraves, door linings. Grain along the piece.
  m.trim = sized(
    P({
      map: T.trimWood,
      normalMap: T.dark_wood.normalMap,
      roughnessMap: T.dark_wood.roughnessMap,
      color: new THREE.Color(0.52, 0.5, 0.5),
      roughness: 0.75,
      vertexColors: true,
    }),
    [1.6, 1.6],
    true,
  );
  // Door leaves: dark varnished veneer, grain vertical.
  m.door = sized(
    P({
      map: T.doorWood,
      normalMap: T.oak_veneer_01.normalMap,
      color: new THREE.Color(0.23, 0.165, 0.125), // walnut veneer under forty years of varnish and hands
      roughness: 0.5,
      vertexColors: true,
    }),
    [1.05, 1.05],
  );
  m.claw = sized(
    P({ map: T.claw, normalMap: T.clawNormal, normalScale: new THREE.Vector2(2.6, 2.6), roughness: 0.62, vertexColors: true }),
    [1, 1],
  );
  m.floor = sized(
    P({
      map: T.floorWood,
      normalMap: T.wood_floor_worn.normalMap,
      roughnessMap: T.wood_floor_worn.roughnessMap,
      color: new THREE.Color(0.4, 0.36, 0.32),
      roughness: 1,
      vertexColors: true,
    }),
    [2.0, 2.0],
    true,
  );
  m.carpet = sized(
    P({
      map: T.runner,
      normalMap: rep(T.dirty_carpet.normalMap, 2),
      roughnessMap: rep(T.dirty_carpet.roughnessMap, 2),
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 1,
      sheen: 0.5,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0.45, 0.16, 0.14),
      vertexColors: true,
    }),
    [1.2, 1.2],
  );
  m.ceiling = sized(
    P({
      map: T.painted_plaster_wall.map,
      normalMap: T.painted_plaster_wall.normalMap,
      roughnessMap: T.painted_plaster_wall.roughnessMap,
      color: new THREE.Color(0.86, 0.8, 0.66),
      roughness: 1,
      vertexColors: true,
    }),
    [2.0, 2.0],
  );
  m.boards = sized(
    P({ map: T.rough_wood.map, normalMap: T.rough_wood.normalMap, roughnessMap: T.rough_wood.roughnessMap, normalScale: new THREE.Vector2(1.5, 1.5), color: new THREE.Color(0.8, 0.74, 0.66), roughness: 1, vertexColors: true }),
    [0.9, 0.9],
  );

  // Metals.
  m.brass = P({ color: new THREE.Color(0.78, 0.6, 0.3), metalness: 1, roughness: 0.34, vertexColors: true });
  m.brassDull = P({ color: new THREE.Color(0.5, 0.39, 0.2), metalness: 1, roughness: 0.52, vertexColors: true });
  m.iron = P({ color: new THREE.Color(0.1, 0.09, 0.08), metalness: 0.9, roughness: 0.6, vertexColors: true });
  m.steel = P({ color: new THREE.Color(0.55, 0.55, 0.55), metalness: 1, roughness: 0.38, vertexColors: true });
  m.plate = P({ map: T.plates, metalnessMap: T.platesOrm, roughnessMap: T.platesOrm, normalMap: T.platesNormal, metalness: 1, roughness: 1, vertexColors: true });

  // Lamps.
  m.shade = P({ color: new THREE.Color(0.8, 0.74, 0.62), roughness: 0.55, emissive: new THREE.Color(1.0, 0.56, 0.2), emissiveMap: T.shadeGlow, emissiveIntensity: 0, side: THREE.DoubleSide, vertexColors: true });
  m.cable = P({ color: new THREE.Color(0.05, 0.045, 0.04), roughness: 0.7, vertexColors: true });
  m.bakelite = P({ color: new THREE.Color(0.09, 0.06, 0.045), roughness: 0.4, vertexColors: true });

  // Painted, plastic, cloth, rubber.
  m.cream = P({ color: new THREE.Color(0.62, 0.56, 0.42), roughness: 0.5, vertexColors: true });
  m.redPaint = P({ color: new THREE.Color(0.42, 0.04, 0.03), roughness: 0.45, vertexColors: true });
  m.cloth = P({ color: new THREE.Color(0.6, 0.58, 0.52), roughness: 0.95, sheen: 0.3, sheenColor: new THREE.Color(0.6, 0.6, 0.6), side: THREE.DoubleSide, vertexColors: true });
  m.rubber = P({ color: new THREE.Color(0.035, 0.035, 0.035), roughness: 0.85, vertexColors: true });
  m.void = P({ color: new THREE.Color(0.012, 0.011, 0.01), roughness: 1, vertexColors: true });
  m.glass = P({ color: new THREE.Color(1, 1, 1), roughness: 0.03, transmission: 1, ior: 1.5, thickness: 0, vertexColors: true });

  // Atlases.
  m.signs = P({ map: T.signs, roughness: 0.6, vertexColors: true });
  m.exitGlow = P({ map: T.signs, emissiveMap: T.signs, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.15, roughness: 0.4, vertexColors: true });
  // the same atlas at half strength, for grime that should only be a suggestion
  m.decalSoft = P({ map: T.decals, transparent: true, opacity: 0.42, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, vertexColors: true });
  m.decal = P({ map: T.decals, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, vertexColors: true });

  // The shoe.
  m.leather = P({ color: new THREE.Color(0.022, 0.018, 0.017), roughness: 0.12, side: THREE.DoubleSide, vertexColors: true }); // black patent
  m.sole = P({ color: new THREE.Color(0.2, 0.13, 0.08), roughness: 0.8, vertexColors: true });

  // The figure behind the door.
  m.skin = P({ color: new THREE.Color(0.3, 0.285, 0.275), roughness: 0.42, sheen: 0.3, sheenRoughness: 0.45, sheenColor: new THREE.Color(0.75, 0.55, 0.5), vertexColors: true });
  m.eye = P({ color: new THREE.Color(1, 1, 1), roughness: 0.03, vertexColors: true });
  m.hair = P({ color: new THREE.Color(0.016, 0.014, 0.012), roughness: 0.34, side: THREE.DoubleSide, vertexColors: true });
  m.nail = P({ color: new THREE.Color(0.72, 0.66, 0.6), roughness: 0.16, vertexColors: true });
  m.gown = P({ color: new THREE.Color(0.5, 0.48, 0.44), roughness: 1, side: THREE.DoubleSide, vertexColors: true });

  for (const [name, mat] of Object.entries(m)) {
    mat.name = name;
    if (!mat.userData.size) mat.userData.size = [1, 1];
  }
  return m;
}
