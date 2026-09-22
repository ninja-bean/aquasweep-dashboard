// Dissolved oxygen is NOT read by a sensor — it is derived from water
// temperature on the dashboard using freshwater saturation at 1 atm
// (empirical polynomial, ~Mortimer/Weiss-equivalent at surface pressure).
// Returns mg/L, or null for a non-numeric temperature.

export function tempToDO(tC) {
  const c = Number(tC)
  if (!Number.isFinite(c) || c < 0 || c > 40) return null
  const mgL = 14.652 - 0.41022 * c + 0.007991 * c * c - 0.000077774 * c * c * c
  return Math.round(mgL * 10) / 10
}