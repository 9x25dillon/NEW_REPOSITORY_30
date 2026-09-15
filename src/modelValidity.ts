import { type Medium, type Particle } from "./gorkov.js";
import { positive } from "./validation.js";

/** A size screening criterion, deliberately not an error bound or a claim that
 * thermoviscous, wall, shape or elastic effects are negligible. */
export function rayleighSizeAssessment(frequency: number, particle: Particle, medium: Medium): {
  externalKa: number;
  internalKa: number;
  smallParticle: boolean;
  message: string;
} {
  positive("frequency", frequency); positive("radius", particle.radius);
  positive("particle sound speed", particle.c); positive("fluid sound speed", medium.c);
  const externalKa = 2 * Math.PI * frequency * particle.radius / medium.c;
  const internalKa = 2 * Math.PI * frequency * particle.radius / particle.c;
  const smallParticle = Math.max(externalKa, internalKa) <= 0.1;
  return {
    externalKa, internalKa, smallParticle,
    message: smallParticle
      ? "Rayleigh size criterion met (external and internal ka ≤ 0.1). This is a size screen, not an error bound."
      : "Rayleigh size criterion exceeded. Gor’kov trap and focusing predictions need a finite-size scattering model.",
  };
}
