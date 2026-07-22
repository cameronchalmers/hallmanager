/** Format an integer pence value as a pounds display string.
 *  1500 → "£15"   |   1250 → "£12.50"   |   123456 → "£1,234.56"
 */
export function formatPence(pence: number): string {
  const pounds = pence / 100
  if (pounds % 1 === 0) return `£${pounds.toLocaleString('en-GB')}`
  return `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Convert a pound amount (from user input) to integer pence. */
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100)
}

import type { RatePackage } from './database.types'

/** Fraction of the total taken upfront to confirm a package-site booking. */
export const DEPOSIT_FRACTION = 0.25

/** The daily rate (per_day) or flat price (fixed) in force for this booking,
 *  using the district rate when claimed and configured. */
export function packageBaseRate(pkg: RatePackage, isDistrict: boolean): number {
  if (isDistrict && pkg.district_price != null) return pkg.district_price
  return pkg.price
}

/** Total (pence) for a per-day package over `days`, applying the highest
 *  whole-booking discount tier the length qualifies for, on the active rate. */
export function perDayTotal(pkg: RatePackage, days: number, isDistrict = false): { total: number; discountPct: number } {
  let pct = 0
  for (const t of pkg.tiers ?? []) {
    if (days >= t.min_days && t.discount_pct > pct) pct = t.discount_pct
  }
  return { total: Math.round(days * packageBaseRate(pkg, isDistrict) * (100 - pct) / 100), discountPct: pct }
}
