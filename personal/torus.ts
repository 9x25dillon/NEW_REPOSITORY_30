// personal/torus.ts — the natal chart as a shape in four dimensions.
//
// Carried over from the engine this repository grew out of, and kept because it
// is worth looking at. Read personal/tonal.ts for the boundary note: nothing in
// this directory is physics, and nothing in src/ may import it.
//
// The geometry is exact and the claims about it are geometric ones:
//
//   · A longitude is an angle, so a body is a point on S1.
//   · A PAIR of bodies is a point on the torus T2 = S1 x S1, and an aspect
//     between them — a fixed difference of longitudes — is a diagonal circle.
//   · The Clifford torus sits flat inside the unit 3-sphere in R4 as
//     (e^i.theta, e^i.phi)/sqrt2, and stereographic projection brings it to R3
//     with every aspect circle landing as a TRUE round circle in space, any two
//     of them linked exactly once.
//   · Four dimensions have no rotation axis, only planes, and the six
//     coordinate planes fall into exactly three pairs sharing no coordinate:
//     {xy,zw}, {xz,yw}, {xw,yz}. Turning both planes of one pair at the same
//     rate is an isoclinic rotation. On the Clifford torus the first of those
//     pairs carries the two bodies' longitudes, so its isoclinic rotation
//     slides the surface along its own aspect circles without tilting it. The
//     other two mix the bodies' planes and take the surface through the
//     projection pole, where it turns inside out.
//
// All of that is checkable, and the tests check it. None of it is a claim about
// a person; it is a way of drawing where the planets were.

const DEG = Math.PI / 180;

export interface Vec3 { x: number; y: number; z: number; }
export interface Point4 { x: number; y: number; z: number; w: number; }

/** Distance to the tube centre, and the tube. */
export const DONUT_R = 1.5;
export const DONUT_r = 0.72;

/** The familiar donut: theta around the hole, phi around the tube. */
export function embedDonut(thetaDeg: number, phiDeg: number): Vec3 {
  const t = thetaDeg * DEG;
  const p = phiDeg * DEG;
  const w = DONUT_R + DONUT_r * Math.cos(p);
  return { x: w * Math.cos(t), y: w * Math.sin(t), z: DONUT_r * Math.sin(p) };
}

/** The Clifford torus as a point of R4, on the unit 3-sphere. */
export function cliffordPoint(thetaDeg: number, phiDeg: number): Point4 {
  const t = thetaDeg * DEG;
  const p = phiDeg * DEG;
  const k = Math.SQRT1_2;
  return { x: Math.cos(t) * k, y: Math.sin(t) * k, z: Math.cos(p) * k, w: Math.sin(p) * k };
}

export type Plane4 = "xy" | "xz" | "xw" | "yz" | "yw" | "zw";
const AXES: Record<Plane4, ["x" | "y" | "z" | "w", "x" | "y" | "z" | "w"]> = {
  xy: ["x", "y"], xz: ["x", "z"], xw: ["x", "w"],
  yz: ["y", "z"], yw: ["y", "w"], zw: ["z", "w"],
};

/** Rotate within one coordinate plane, first axis toward second. */
export function rotate4(p: Point4, plane: Plane4, deg: number): Point4 {
  const [i, j] = AXES[plane];
  const a = deg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: Point4 = { ...p };
  out[i] = p[i] * c - p[j] * s;
  out[j] = p[i] * s + p[j] * c;
  return out;
}

/** The three ways to split four dimensions into two planes sharing no
 *  coordinate. There are exactly three, which is the whole point. */
export const PLANE_PAIRS: Readonly<Record<string, readonly [Plane4, Plane4]>> = {
  first: ["xy", "zw"],
  second: ["xz", "yw"],
  third: ["xw", "yz"],
};

/**
 * A double rotation in one pair, `alpha` in the first plane and `beta` in the
 * second. Equal angles give the isoclinic rotation. The two planes share no
 * coordinate, so the rotations commute and the pair is one motion rather than
 * a sequence of two.
 */
export function pairRotation(
  p: Point4, pair: keyof typeof PLANE_PAIRS, alphaDeg: number, betaDeg = alphaDeg,
): Point4 {
  const [a, b] = PLANE_PAIRS[pair];
  return rotate4(rotate4(p, a, alphaDeg), b, betaDeg);
}

const CLIFFORD_SCALE = 0.95;
/** How close to the projection pole the divide may get. Undisturbed, the
 *  Clifford torus keeps w <= 1/sqrt2 and this is never reached; a rotation in
 *  the second or third pair takes it through w = 1, where the true projection
 *  is infinite, and the floor bounds that so the passage renders as the surface
 *  rushing outward and folding through itself rather than as NaN. */
const POLE_FLOOR = 0.1;

/** Stereographic projection from (0,0,0,1). */
export function stereo3(p: Point4): Vec3 {
  const k = CLIFFORD_SCALE / Math.max(1 - p.w, POLE_FLOOR);
  return { x: p.x * k, y: p.y * k, z: p.z * k };
}

/** The aspect circle at a fixed longitude difference, sampled as (theta, phi)
 *  pairs. A diagonal on the donut; a true round circle under the Clifford
 *  projection, linked once with every other. */
export function aspectCircle(targetDeg: number, points = 96): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 360;
    out.push([t, t - targetDeg]);
  }
  return out;
}

/** Wrap into (-180, 180]. */
export function wrap180(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Separation between two longitudes, 0..180 — what the wheel calls an orb's
 *  worth of distance and what the tonal map turns into an interval. */
export function separation(aDeg: number, bDeg: number): number {
  return Math.abs(wrap180(aDeg - bDeg));
}
