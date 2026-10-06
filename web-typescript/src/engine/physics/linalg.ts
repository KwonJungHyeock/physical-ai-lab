/**
 * Small dense linear algebra for the 교육 (robotics lessons) screens: 3-vectors,
 * 3x3 symmetric eigen-decomposition and small linear solves. Plain number arrays,
 * so the same code runs in the browser and in the Node checks.
 */

export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];

export const add = (a: readonly number[], b: readonly number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: readonly number[], k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: readonly number[], b: readonly number[]): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: readonly number[]): number => Math.hypot(a[0], a[1], a[2]);

export const mulMV = (m: readonly (readonly number[])[], v: readonly number[]): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

export function det3(m: readonly (readonly number[])[]): number {
  return dot(m[0], cross(m[1], m[2]));
}

/**
 * Eigenvalues and eigenvectors of a symmetric 3x3 matrix (cyclic Jacobi rotations).
 * Returned largest first; `vectors[i]` is the unit eigenvector of `values[i]`.
 */
export function eigSym3(m: readonly (readonly number[])[]): { values: V3; vectors: [V3, V3, V3] } {
  const a = m.map((r) => r.slice(0, 3));
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((i) => a[i][i]) as V3,
    vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]] as V3) as [V3, V3, V3],
  };
}

/** Solve A x = b (small, square) by Gaussian elimination with partial pivoting. Singular columns give 0. */
export function solve(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row.slice(0, n), b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-14) continue;
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f) for (let c = col; c <= n; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-14 ? 0 : row[n] / row[i]));
}
