import { MonthlyQty } from './entry-row.model';

export function createEmptyMonths(): MonthlyQty[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    qty: 0,
  }));
}
