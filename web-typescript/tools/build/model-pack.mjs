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
 * usage: SRC=<folder> node model-pack.mjs <outdir> [group,group]
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

/** name → [source file under SRC, scale to metres]. */
const GROUPS = {
  care: {
    tex: 512,
    models: {
      wheelchair: ['care-cafe/glb/ph-wheelchair-01.glb', 1],
      sideTable: ['care-cafe/glb/ph-side-table-01.glb', 1],
      nightstand: ['care-cafe/glb/aws-nightstand-white.glb', 1],
      armchair: ['care-cafe/glb/ph-modern-arm-chair-01.glb', 1],
      curtain: ['care-cafe/glb/aws-privacy-curtain.glb', 1],
      drawers: ['care-cafe/glb/ph-drawer-cabinet.glb', 1],
      fridge: ['care-cafe/glb/kn-fridge-small.glb', 1.9],
    },
  },
  people: {
    tex: 512,
    models: {
      elderWoman: ['people/glb/bph-elder-woman-sitting.glb', 1],
      elderMan: ['people/glb/bph-elder-man-sitting.glb', 1],
      workerMan: ['people/glb/umm-worker-man.glb', 0.95],
      workerWoman: ['people/glb/umw-worker-woman.glb', 0.93],
      customer: ['people/glb/umw-casual-woman.glb', 0.92],
    },
  },
};

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
