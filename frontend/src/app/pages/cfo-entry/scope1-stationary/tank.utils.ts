export type TankInjection = {
  month: string;
  value: number;
};

const EPSILON = 1e-9;

function explainNumber(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (Math.abs(value) < EPSILON) {
    return null;
  }
  return value;
}

export function applyTankMonths(
  months: Record<string, number | null>,
  previousInjection: TankInjection | null,
  targetMonth: string | null,
  computedValue: number | null,
): { months: Record<string, number | null>; injection: TankInjection | null } {
  const updated: Record<string, number | null> = { ...months };

  if (previousInjection && previousInjection.month) {
    const previousValue = Number(updated[previousInjection.month] ?? 0);
    const newValue = previousValue - previousInjection.value;
    updated[previousInjection.month] = explainNumber(newValue);
  }

  if (!targetMonth || computedValue === null || Number.isNaN(computedValue)) {
    return { months: updated, injection: null };
  }

  const baseValue = Number(updated[targetMonth] ?? 0);
  const appliedValue = baseValue + computedValue;
  updated[targetMonth] = explainNumber(appliedValue);

  return {
    months: updated,
    injection: { month: targetMonth, value: computedValue },
  };
}
