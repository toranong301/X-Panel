import { SelectionRuleSpec } from '../models/template-spec.model';

export function runSelections(
  rules: Record<string, SelectionRuleSpec>,
  canonical: { inventory: any[]; fr03_2: any[] }
): Record<string, any[]> {
  const out: Record<string, any[]> = {};

  for (const [key, rule] of Object.entries(rules)) {
    let list: any[] =
      rule.source === 'fr032Canonical'
        ? [...(canonical.fr03_2 ?? [])]
        : [...(canonical.inventory ?? [])];

    // ✅ APPLY where conditions ก่อน
    if (rule.where?.length) {
      for (const w of rule.where) {
        list = list.filter((x: any) => String(x?.[w.field] ?? '') === String(w.eq ?? ''));
      }
    }

    if (rule.where?.length) {
  for (const w of rule.where) {
    list = list.filter((x: any) => String(x?.[w.field] ?? '') === String(w.eq ?? ''));
  }
}


    // sort
    if (rule.sortBy) {
      const { field, dir } = rule.sortBy;
      list.sort((a: any, b: any) => {
        const av = Number(a?.[field] ?? 0);
        const bv = Number(b?.[field] ?? 0);
        return dir === 'desc' ? bv - av : av - bv;
      });
    }

    if (rule.limit) list = list.slice(0, rule.limit);
    out[key] = list;
  }

  return out;
}
