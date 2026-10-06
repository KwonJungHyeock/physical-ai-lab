/**
 * Three.js pieces for the 교육 screens, in the robot base frame (z up, metres):
 * the workspace (shell and cross-section), the manipulability ellipsoid, and
 * a translucent "ghost" material for comparing arm poses.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShaderMaterial,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three';

import { profileOutline, type WorkspaceProfile } from '@/engine/physics/workspace';

/** Colours of what lessons draw over the dark stage (bright enough to read on it). */
export const LEARN_COLORS = {
  accent: '#5b8cff',
  ok: '#3ddc84',
  bad: '#ff5a4e',
  warn: '#ffad1f',
  ghost: '#9fb0c8',
  /** The tool path, as simulators usually draw it: amber. */
  path: '#ffad1f',
  tree: '#7d8aa0',
};

/**
 * The workspace (the simulator's 작업 범위, also the lessons'): a solid of revolution about the J1
 * axis, open over the 24° J1 cannot turn through (`frontDeg` is where the arm points at J1 = 0; the
 * opening is opposite it), drawn so it reads as a volume without hiding the arm — faces almost
 * clear and the rims glowing where the surface turns away from the eye (a fresnel edge), contour
 * rings every 50 mm of height, and the cross-section (`showSection`) in a vertical plane turned by
 * `setAzimuth` (radians from +x).
 */
export function workspaceEnvelope(p: WorkspaceProfile, frontDeg: number, color = LEARN_COLORS.accent): { group: Group; showSection(on: boolean): void; setAzimuth(rad: number): void } {
  const outline = profileOutline(p);
  const pts = outline.map(([r, z]) => new Vector2(Math.max(0.0005, r / 1000), z / 1000));
  pts.push(pts[0].clone());
  const span = (p.j1Range[1] - p.j1Range[0]) * (Math.PI / 180);
  const start = ((frontDeg + p.j1Range[0]) * Math.PI) / 180 + Math.PI / 2;
  const geo = new LatheGeometry(pts, 128, start, span);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  const glow = new ShaderMaterial({
    uniforms: { tint: { value: new Color(color) } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 tint;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = 0.025 + 0.42 * pow(edge, 3.0);
        gl_FragColor = vec4(tint, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const shell = new Mesh(geo, glow);
  shell.renderOrder = 2;
  const g = new Group();
  g.add(shell);

  // Contour rings: where a horizontal plane every 50 mm cuts the outline (outer, and inner when there is a hole).
  const ringMat = new LineBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false });
  const arc = (rMm: number, zMm: number) => {
    const n = 96;
    const v: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const a = ((frontDeg + p.j1Range[0]) * Math.PI) / 180 + (span * i) / n;
      v.push((rMm / 1000) * Math.cos(a), (rMm / 1000) * Math.sin(a), zMm / 1000);
    }
    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute(v, 3));
    const l = new Line(lg, ringMat);
    l.renderOrder = 3;
    return l;
  };
  const top = p.rows[p.rows.length - 1]?.z ?? 0;
  for (let z = 50; z < top; z += 50) {
    const row = p.rows.reduce((best, r) => (Math.abs(r.z - z) < Math.abs(best.z - z) ? r : best), p.rows[0]);
    if (row.rMax > 5) g.add(arc(row.rMax, row.z));
    if (row.rMin > 5) g.add(arc(row.rMin, row.z));
  }

  // The plane through the tool tip: brighter, turning as the tip goes round.
  const section = workspaceSection(p, 0, 0, color);
  section.traverse((c) => {
    const m = (c as Mesh).material as MeshBasicMaterial | undefined;
    if (m && 'opacity' in m) m.opacity = 0.24;
  });
  const sectionEdge = new Line(
    new BufferGeometry().setFromPoints([...outline, outline[0]].map(([r, z]) => new Vector3(r / 1000, 0, z / 1000))),
    new LineBasicMaterial({ color: '#9fc0ff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  );
  sectionEdge.renderOrder = 4;
  section.add(sectionEdge);
  g.add(section);
  return {
    group: g,
    showSection: (on: boolean) => {
      section.visible = on;
    },
    setAzimuth: (rad: number) => {
      section.rotation.z = rad;
    },
  };
}

/** The reachable region in the vertical plane the arm is in now (J1 = `j1Deg`). */
export function workspaceSection(p: WorkspaceProfile, frontDeg: number, j1Deg: number, color = LEARN_COLORS.accent): Group {
  const outline = profileOutline(p);
  const shape = new Shape(outline.map(([r, z]) => new Vector2(r / 1000, z / 1000)));
  const geo = new ShapeGeometry(shape);
  // Shape lies in x (= r) / y (= z); stand it up in the x-z plane, then turn about z.
  geo.rotateX(Math.PI / 2);
  const m = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false, toneMapped: false }));
  m.renderOrder = 2;
  const g = new Group();
  g.add(m);
  g.rotation.z = ((frontDeg + j1Deg) * Math.PI) / 180;
  return g;
}

/** Ellipsoid with semi-axes `lengths` (metres) along the unit vectors `dirs`, centred at `centre`. */
export function ellipsoid(centre: Vector3, lengths: readonly number[], dirs: readonly (readonly number[])[], color = LEARN_COLORS.ok): Mesh {
  const m = new Mesh(
    new SphereGeometry(1, 40, 24),
    new MeshStandardMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.4, depthWrite: false }),
  );
  const [a, b] = dirs.map((d) => new Vector3(d[0], d[1], d[2]).normalize());
  const c = new Vector3().crossVectors(a, b).normalize();
  const basis = new Matrix4().makeBasis(a, b, c);
  m.matrixAutoUpdate = false;
  m.matrix.copy(new Matrix4().makeTranslation(centre.x, centre.y, centre.z).multiply(basis).multiply(new Matrix4().makeScale(lengths[0], lengths[1], lengths[2])));
  m.renderOrder = 4;
  return m;
}

/** Make every mesh under `o` see-through in one colour (a ghost arm). */
export function ghostify(o: Object3D, color: string, opacity: number): void {
  const mat = new MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.6, depthWrite: false });
  o.traverse((c) => {
    const mesh = c as Mesh;
    if (mesh.isMesh) {
      mesh.material = mat as Material;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 1;
    }
  });
}
