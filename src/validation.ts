/** Shared runtime guards at public solver and JSON boundaries. All units are SI. */
export function finite(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

export function positive(name: string, value: number): number {
  if (finite(name, value) <= 0) throw new Error(`${name} must be positive`);
  return value;
}

export function nonnegative(name: string, value: number): number {
  if (finite(name, value) < 0) throw new Error(`${name} must be nonnegative`);
  return value;
}

export function integer(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}
