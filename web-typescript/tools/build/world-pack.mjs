/**
 * Packs the world map's CC0 models into one GLB per pack (public/education/world, see its
 * ATTRIBUTION.md): each model a named node under the scene root, scaled to world units (1 unit ≈ 4 m,
 * a KayKit road tile = 2 units), textures shrunk to WebP.
 *
 * The packs are not in the repository. Fetch them into one folder (SRC) first:
 *   kaykit/KayKit-City-Builder-Bits-1.0, kaykit/KayKit-Space-Base-Bits-1.0  (git clone from github.com/KayKit-Game-Assets)
 *   x-kenney/<kit>/glb/*.glb + glb/Textures/  (kenney.nl zips: city-kit-industrial, -commercial, -suburban, -roads, car-kit)
 *   x-nature/glTF/  (Quaternius Stylized Nature MegaKit, standard)
 *   x-farm/*.glb  (Quaternius Farm Buildings + Ultimate Crops FBX → `assimp export X.fbx X.glb -f glb2`)
 * Needs @gltf-transform/core, /extensions, /functions and sharp (not app dependencies: install them
 * next to this script's copy, outside the app).
 *
 * usage: SRC=<folder> node world-pack.mjs <outdir> [pack,pack]
 */
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, textureCompress, weld, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const S = process.env.SRC ?? '.';
const OUT = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const KK = (pack) => `${S}/kaykit/KayKit-${pack}-1.0/addons/kaykit_${pack.toLowerCase().replace(/-/g, '_')}/Assets/gltf`;
const KN = (kit) => `${S}/x-kenney/${kit}/glb`;

const PACKS = {
  city: {
    dir: KK('City-Builder-Bits'),
    ext: '.gltf',
    scale: 1,
    tex: 256,
    names: [
      'building_A',
      'building_B',
      'building_C',
      'building_D',
      'building_E',
      'building_F',
      'building_G',
      'building_H',
      'building_A_withoutBase',
      'building_B_withoutBase',
      'building_C_withoutBase',
      'building_D_withoutBase',
      'building_E_withoutBase',
      'building_F_withoutBase',
      'building_G_withoutBase',
      'building_H_withoutBase',
      'base',
      'road_straight',
      'road_straight_crossing',
      'road_corner',
      'road_corner_curved',
      'road_junction',
      'road_tsplit',
      'car_hatchback',
      'car_police',
      'car_sedan',
      'car_stationwagon',
      'car_taxi',
      'streetlight',
      'trafficlight_A',
      'trafficlight_B',
      'bench',
      'bush',
      'dumpster',
      'firehydrant',
      'watertower',
      'trash_A',
      'box_A',
      'box_B',
    ],
  },
  space: {
    dir: KK('Space-Base-Bits'),
    ext: '.gltf',
    scale: 1,
    tex: 256,
    names: [
      'basemodule_A',
      'basemodule_B',
      'basemodule_C',
      'basemodule_D',
      'basemodule_E',
      'basemodule_garage',
      'roofmodule_base',
      'roofmodule_solarpanels',
      'roofmodule_cargo_A',
      'solarpanel',
      'windturbine_tall',
      'windturbine_low',
      'landingpad_large',
      'landingpad_small',
      'cargo_A',
      'cargo_A_stacked',
      'cargo_B',
      'cargo_B_stacked',
      'cargodepot_A',
      'cargodepot_B',
      'cargodepot_C',
      'containers_A',
      'containers_B',
      'containers_C',
      'containers_D',
      'structure_low',
      'structure_tall',
      'lights',
      'spacetruck',
      'drill_structure',
    ],
  },
  industry: {
    dir: KN('city-kit-industrial'),
    ext: '.glb',
    scale: 1.75,
    tex: 256,
    names: [
      'building-a',
      'building-b',
      'building-c',
      'building-d',
      'building-e',
      'building-f',
      'building-g',
      'building-h',
      'building-i',
      'building-j',
      'building-k',
      'building-l',
      'building-m',
      'building-n',
      'building-o',
      'building-p',
      'building-q',
      'building-r',
      'building-s',
      'building-t',
      'chimney-basic',
      'chimney-large',
      'chimney-medium',
      'chimney-small',
      'detail-tank',
      'detail-tank-large',
      'shipping-container-a',
      'shipping-container-b',
      'shipping-container-c',
      'solar-panel-landscape-group',
      'solar-panel-portrait-group',
      'water-tower',
      'windmill',
    ],
  },
  commercial: {
    dir: KN('city-kit-commercial'),
    ext: '.glb',
    scale: 1.75,
    tex: 256,
    names: [
      'building-a',
      'building-b',
      'building-c',
      'building-d',
      'building-e',
      'building-f',
      'building-g',
      'building-h',
      'building-i',
      'building-j',
      'building-k',
      'building-l',
      'building-m',
      'building-n',
      'building-skyscraper-a',
      'building-skyscraper-b',
      'building-skyscraper-c',
      'building-skyscraper-d',
      'building-skyscraper-e',
      'detail-awning',
      'detail-awning-wide',
      'detail-parasol-a',
      'detail-parasol-b',
    ],
  },
  suburb: {
    dir: KN('city-kit-suburban'),
    ext: '.glb',
    scale: 1.75,
    tex: 256,
    names: ['building-type-a', 'building-type-c', 'building-type-f', 'building-type-k', 'building-type-o', 'fence', 'planter'],
  },
  street: {
    dir: KN('city-kit-roads'),
    ext: '.glb',
    scale: 1.75,
    tex: 256,
    names: ['construction-cone', 'construction-barrier', 'electricity-pole', 'sign-highway', 'bridge-pillar', 'road-bridge'],
  },
  cars: {
    dir: KN('car-kit'),
    ext: '.glb',
    scale: 0.38,
    tex: 256,
    names: [
      'truck',
      'truck-flat',
      'delivery',
      'delivery-flat',
      'van',
      'ambulance',
      'garbage-truck',
      'tractor',
      'tractor-shovel',
      'firetruck',
      'police',
      'taxi',
      'suv',
      'sedan',
      'hatchback-sports',
      'box',
      'cone',
    ],
  },
  nature: {
    dir: `${S}/x-nature/glTF`,
    ext: '.gltf',
    scale: 0.3,
    tex: 512,
    names: [
      'CommonTree_1',
      'CommonTree_2',
      'CommonTree_3',
      'CommonTree_4',
      'CommonTree_5',
      'Pine_1',
      'Pine_2',
      'Pine_3',
      'Pine_4',
      'Pine_5',
      'TwistedTree_1',
      'TwistedTree_3',
      'Bush_Common',
      'Bush_Common_Flowers',
      'Rock_Medium_1',
      'Rock_Medium_2',
      'Rock_Medium_3',
      'Grass_Common_Short',
      'Grass_Common_Tall',
      'Flower_3_Group',
      'Flower_4_Group',
      'Plant_1_Big',
      'Plant_7_Big',
      'Fern_1',
      'Pebble_Round_1',
      'Pebble_Square_2',
      'RockPath_Round_Wide',
      'Mushroom_Common',
    ],
  },
  farm: {
    dir: `${S}/x-farm`,
    ext: '.glb',
    scale: 0.0025,
    tex: 256,
    names: [
      'Barn',
      'BigBarn',
      'OpenBarn',
      'SmallBarn',
      'Silo',
      'Silo_House',
      'Windmill',
      'TowerWindmill',
      'WaterTower',
      'Well',
      'ChickenCoop',
      'Fence',
      'Fence2',
      'Tomato_4',
      'Corn_4',
      'Wheat_4',
      'Lettuce_4',
      'Carrot_4',
      'Pumpkin_4',
      'Apple_4',
      'Rice_4',
      'Tomato_Crop',
      'Corn_Crop',
      'Wheat_Crop',
      'Lettuce_Crop',
      'Apple_Crop',
    ],
  },
};

const only = process.argv[3]?.split(',');
fs.mkdirSync(OUT, { recursive: true });
for (const [packName, p] of Object.entries(PACKS)) {
  if (only && !only.includes(packName)) continue;
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('pack');
  doc.getRoot().setDefaultScene(scene);
  for (const name of p.names) {
    const file = path.join(p.dir, name + p.ext);
    if (!fs.existsSync(file)) {
      console.warn('missing', file);
      continue;
    }
    const src = await io.read(file);
    // one buffer per document
    const buf = doc.getRoot().listBuffers()[0];
    src
      .getRoot()
      .listBuffers()
      .forEach((b, i) => i > 0 && b.dispose());
    const map = mergeDocuments(doc, src);
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const holder = doc.createNode(name).setScale([p.scale, p.scale, p.scale]);
    for (const child of srcScene.listChildren()) holder.addChild(map.get(child));
    scene.addChild(holder);
    // drop the merged-in scenes (keep only ours)
    for (const sc of doc.getRoot().listScenes()) if (sc !== scene) sc.dispose();
    for (const b of doc.getRoot().listBuffers())
      if (b !== buf) {
        for (const a of doc.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buf);
        b.dispose();
      }
  }
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    weld(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [p.tex, p.tex],
    }),
    unpartition(),
  );
  const out = path.join(OUT, `${packName}.glb`);
  await io.write(out, doc);
  console.log(packName.padEnd(12), (fs.statSync(out).size / 1024).toFixed(0) + ' KB', p.names.length, 'models');
}
