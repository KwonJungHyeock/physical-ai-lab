/**
 * The site rooms' floor and wall textures (public/models/tex/<name>/{color,normal,rough}.webp) from
 * Poly Haven texture sets (CC0, https://polyhaven.com/license), see public/models/tex/ATTRIBUTION.md.
 * Fetch each set's 1k JPG maps first (diffuse → color.jpg, nor_gl → normal.jpg, rough → rough.jpg)
 * into SRC/<poly haven id>/. Colour maps become WebP at 1024 px, normal and roughness at 512; a set
 * marked grey loses its colour (the scene tints it).
 *
 * usage: SRC=<folder> node tex-pack.mjs <public/models/tex>
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const S = process.env.SRC ?? '.';
const OUT = process.argv[2];

/** name → [Poly Haven id, grey?] */
const SETS = {
  'floor-epoxy': ['concrete_floor_worn_001', false],
  'floor-concrete': ['brushed_concrete', false],
  'floor-lab': ['marble_01', true],
  'floor-tiles': ['floor_tiles_08', true],
  'floor-wood': ['wood_floor', false],
  'floor-laminate': ['laminate_floor_02', false],
  'wall-plaster': ['painted_plaster_wall', true],
};

for (const [name, [id, grey]] of Object.entries(SETS)) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [map, size] of [
    ['color', 1024],
    ['normal', 512],
    ['rough', 512],
  ]) {
    let img = sharp(path.join(S, id, `${map}.jpg`)).resize(size, size);
    if (grey && map === 'color') img = img.grayscale();
    await img.webp({ quality: map === 'color' ? 80 : 75 }).toFile(path.join(dir, `${map}.webp`));
  }
  console.log(name, '←', id);
}
