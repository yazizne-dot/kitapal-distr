const monthFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit',
});

export function orderMonthKey(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : monthFormatter.format(date);
}

export function filterOrderHistory<T extends { createdAt: string; distributorId: number }>(
  orders: readonly T[], month: string, distributorId = 0,
): T[] {
  return orders.filter(order =>
    (distributorId === 0 || order.distributorId === distributorId) &&
    (month === 'all' || orderMonthKey(order.createdAt) === month)
  ).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
