# Tasks

## 1. Spaces, affine math, and limits

- [ ] 1.1 Implement `spaces.ts`, `rect.ts`, and `limits.ts` (branded points/rects, rect ops, finiteness validators, documented ranges); verify `src/core/space/geometry/rect.test.ts` ("GEO-06 …") covers zero-size rects and non-finite rejection, and `npm run typecheck` passes the core-only pass
- [ ] 1.2 Implement `affine.ts` (compose, apply point/vector, invert returning a Result that refuses singular matrices); verify `affine.test.ts` ("GEO-02 …", "GEO-06 non-invertible") passes, including round trips on random seeded matrices
- [ ] 1.3 Implement `node-transform.ts` (mirror → quarter-turn → translate about the body-center origin, exact 0/±1 entries); verify `node-transform.test.ts` ("GEO-02a …") checks a 25×49 body in all 8 rotation/mirror states, normal rotation, and bit-identical return after four turns
- [ ] 1.4 Implement `viewport-transform.ts` (world↔viewport↔device, zoom clamp, cursor-anchored zoom helper); verify `viewport-transform.test.ts` ("GEO-01 round trip", "GEO-01 DPR 2", "GEO-06 zoom out of range") passes

## 2. Shapes and path geometry

- [ ] 2.1 Implement `shapes.ts` (rect, roundRect, ellipse, polygon: contains, distance, bounds); verify `shapes.test.ts` ("GEO-04 diamond outside shape") rejects a point inside the diamond's bounding box but outside the diamond
- [ ] 2.2 Implement `path-geometry.ts` (line/cubic bounds, nearest point, distance, end tangents); verify `path-geometry.test.ts` ("ROU-02 …", "GEO-06 coincident anchors") compares nearest-point results against dense sampling for S-curves, loops, and degenerate cubics with no NaN
- [ ] 2.3 Implement `connection-paths.ts` (straight and Bezier builders from anchors and normals); verify `connection-paths.test.ts` ("ROU-01 straight and bezier modes") checks control-point placement along the normals and the coincident-anchor case

## 3. Node geometry contract and presets

- [ ] 3.1 Implement `node-geometry.ts` (NodeGeometry, PortAnchor, GeometryRegistry, placeholder geometry); verify `node-geometry.test.ts` ("GEO-02b portless node", "NOD-07 placeholder geometry", "NOD-08 geometry independent of painter") passes
- [ ] 3.2 Implement `presets/image-symbol-geometry.ts` (outline-anywhere port placement with explicit, type-level, and fallback resolution); verify `image-symbol-geometry.test.ts` ("GEO-02b custom port positions", "GEO-02a mirrored anchor normal") passes
- [ ] 3.3 Implement `presets/card-geometry.ts` (horizontal/vertical port rows in model port order, label margin in painted bounds); verify `card-geometry.test.ts` ("NOD-03 …", "VIS-03 painted vs hit bounds") passes

## 4. Spatial index

- [ ] 4.1 Define `SpatialIndex` and implement `brute-force-index.ts`; verify `brute-force-index.test.ts` ("IDX-01 rectangle query") passes
- [ ] 4.2 Implement `aabb-tree.ts` (fattened leaves, rotation balancing, O(1) update inside the fat box); verify `aabb-tree.test.ts` ("IDX-01 alternative implementation", "IDX-02 incremental update") fuzzes 10k seeded insert/update/remove operations and matches brute-force results for every query
- [ ] 4.3 Verify `aabb-tree.test.ts` ("IDX-04 deterministic results") shows that, after the scene's key sort, the same entries inserted in two different orders yield identical ordered results

## 5. Geometry scene and picking

- [ ] 5.1 Implement `scene-entries.ts` and `geometry-scene.ts` (initial projection from a model read; incremental updates from committed-change events); verify `geometry-scene.test.ts` ("IDX-02 drag one node") counts recomputations and asserts that only the moved node and its incident connections change
- [ ] 5.2 Implement `queryRect` culling over painted bounds in paint order; verify `geometry-scene.test.ts` ("IDX-03 label extends into viewport", "GEO-04 path with off-screen endpoints") passes
- [ ] 5.3 Implement `picking.ts` (two-phase pick, CSS-pixel tolerances, interactive-order sorting); verify `picking.test.ts` ("GEO-04a port over node body", "GEO-04a coincident paths", "GEO-05 capture radius at zoom 0.5 and 4", "VIS-02 connections above nodes override") passes
- [ ] 5.4 Verify headless picking on a seeded 10k-node / 20k-connection fixture returns correct candidates against brute force, in `picking.test.ts` ("IDX-01 rectangle query on 10k nodes")

## 6. Exports and documentation

- [ ] 6.1 Export the geometry, spatial-index, and scene APIs from `src/core/index.ts`; verify `npm run build` emits declarations and `npm run typecheck` (including the DOM-free core pass) succeeds
- [ ] 6.2 Write `docs/geometry.md` (coordinate spaces, transform order, body-center origin, supported ranges, tolerance units, interactive order); verify every convention it states is asserted by a test named in groups 1–5
- [ ] 6.3 Run `npm run lint`, `npm test`, and `npm run typecheck`; verify all pass and every new source file stays within 300 lines (`wc -l src/core/{geometry,spatial-index,scene}/**/*.ts`)
