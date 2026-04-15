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
