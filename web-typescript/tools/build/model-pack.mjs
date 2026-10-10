/**
 * Packs the site labs' furniture and equipment (CC0 / MIT-0, see public/models/ATTRIBUTION.md) into
 * one GLB per group (public/models/<group>.glb): each model a named node under the scene root, in
 * metres, y up, centred on x/z with its foot at y = 0, textures shrunk to WebP. The scene code places
 * them by name (src/ui/education/lab/ambient/Model.tsx); a rigged model's clips are named
 * '<model>:<clip>' and a scene can hold one pose from them.
 *
 * The source models are not in the repository. Fetch them into one folder (SRC) first, each as one
 * .glb (Poly Haven: the 1k glTF packed to GLB; AWS RoboMaker worlds: the DAE converted with
 * `assimp export x.dae x.glb -f glb2`; Kenney / KayKit / MilkAndBanana: the pack's own GLB/glTF).
 * The file names below are the ones used when they were collected (see ATTRIBUTION.md for where each
 * comes from).
 * Needs @gltf-transform/core, /extensions, /functions and sharp (not app dependencies: install them
 * next to this script's copy, outside the app).
 *
 * The groups are the JSON files in model-packs/ (one per pack, see that folder).
 *
 * usage: SRC=<folder> [PACKS=<model-packs folder, when this script is run from a copy>] node model-pack.mjs <outdir> [group,group]
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, mergeDocuments, prune, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const S = process.env.SRC ?? '.';
const OUT = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** One pack per file in model-packs/: { "tex": max texture size, "models": { name: [source file under SRC, scale to metres] } }. */
const PACK_DIR = process.env.PACKS ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'model-packs');
const GROUPS = Object.fromEntries(
  fs
    .readdirSync(PACK_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(PACK_DIR, f), 'utf8'))]),
);

const only = process.argv[3]?.split(',');
fs.mkdirSync(OUT, { recursive: true });
for (const [group, g] of Object.entries(GROUPS)) {
  if (only && !only.includes(group)) continue;
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene(group);
  doc.getRoot().setDefaultScene(scene);
  for (const [name, [file, scale]] of Object.entries(g.models)) {
    const src = await io.read(path.join(S, file));
    src
      .getRoot()
      .listBuffers()
      .forEach((b, i) => i > 0 && b.dispose());
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    // Animations keep their clip names, prefixed with the model's: 'workerMan:Idle'.
    for (const a of src.getRoot().listAnimations()) a.setName(`${name}:${a.getName()}`);
    // Foot on the floor, centred: from the model's own bounds (in its units).
    const { min, max } = getBounds(srcScene);
    const map = mergeDocuments(doc, src);
    const inner = doc.createNode(`${name}_src`).setTranslation([-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]);
    for (const child of srcScene.listChildren()) inner.addChild(map.get(child));
    const holder = doc.createNode(name).setScale([scale, scale, scale]).addChild(inner);
    scene.addChild(holder);
    for (const sc of doc.getRoot().listScenes()) if (sc !== scene) sc.dispose();
    for (const b of doc.getRoot().listBuffers())
      if (b !== buf) {
        for (const a of doc.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buf);
        b.dispose();
      }
    const size = [0, 1, 2].map((i) => +((max[i] - min[i]) * scale).toFixed(3));
    console.log(group, name, 'size (m, x y z):', size.join(' × '));
  }
  await doc.transform(
    dedup(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [g.tex, g.tex], quality: 82 }),
    prune(),
    unpartition(),
  );
  const out = path.join(OUT, `${group}.glb`);
  await io.write(out, doc);
  console.log(out, Math.round(fs.statSync(out).size / 1024), 'KB');
}
