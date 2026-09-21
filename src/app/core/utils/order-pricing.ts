/** unitPrice is the agreed price AFTER discount; never apply discount twice. */
export function lineAmount(qty: number, unitPrice: number): number {
  return Math.round(Number(qty) * Number(unitPrice) * 100) / 100;
}

/** Legacy orders store net price and rate, not the original catalogue price. */
export function undiscountedPrice(unitPrice: number, discount: number, fallback = 0): number {
  return discount >= 1 ? fallback : Math.round(Number(unitPrice) / (1 - Number(discount)));
}
