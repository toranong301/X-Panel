import { VSheetTemplateSpec } from '../../models/template-spec.model';

/**
 * MBAX-TGO-11102567 demo v-sheet template spec (mock)
 *
 * Important binding requirement:
 * FR-04.1 Scope 3 section must pull only rows selected in FR-03.2:
 *   assessment = "มีนัยสำคัญ" AND selection = "เลือกประเมิน"
 */
export const MBAX_SPEC: VSheetTemplateSpec = {
  templateId: 'MBAX_TGO_11102567',
  version: '2025.12',

  // Default to legacy mode (no XLOOKUP / no FILTER). Can override at export runtime.
  excelFeatures: { dynamicArray: false, xlookup: false, namedRanges: false },

  sheets: {
    fr041: { name: 'Fr-04.1' },
    fr032: { name: 'Fr-03.2' },
    screenScope3: { name: 'Screen scope 3' },
  },

  selectionRules: {
    // Use canonical FR-03.2 evaluation results
    significantScope3Top6: {
      source: 'fr032Canonical',
      where: [
        { field: 'assessment', eq: 'มีนัยสำคัญ' },
        { field: 'selection', eq: 'เลือกประเมิน' },
      ],
      sortBy: { field: 'ghgTco2e', dir: 'desc' },
      limit: 6,
    },
  },

  sections: {
    /**
     * FR-04.1 Scope 3 lines (row 51-56 in demo sheet)
     * - Column B = itemLabel (adapter writes formula to trace back to FR-03.2 if possible)
     * - Column C/D/Q/Z = lookup by itemLabel from Screen scope 3
     * - Column AO = tCO2e = D*Q/1000 (example)
     */
    fr041_scope3_formulas: {
      sheet: 'fr041',
      table: {
        rowStart: 51,
        rowEnd: 56,
        columns: {
          C: {
            formulaFrom: {
              type: 'byExcel',
              whenModern: `=IF(B{r}="","",XLOOKUP(B{r},'Screen scope 3'!$C:$C,'Screen scope 3'!$D:$D,""))`,
              whenLegacy: `=IF(B{r}="","",VLOOKUP(B{r},'Screen scope 3'!$C:$K,2,FALSE))`,
            },
          },
          D: {
            formulaFrom: {
              type: 'byExcel',
              whenModern: `=IF(B{r}="","",XLOOKUP(B{r},'Screen scope 3'!$C:$C,'Screen scope 3'!$E:$E,""))`,
              whenLegacy: `=IF(B{r}="","",VLOOKUP(B{r},'Screen scope 3'!$C:$K,3,FALSE))`,
            },
          },
          Q: {
            formulaFrom: {
              type: 'byExcel',
              whenModern: `=IF(B{r}="","",XLOOKUP(B{r},'Screen scope 3'!$C:$C,'Screen scope 3'!$H:$H,""))`,
              whenLegacy: `=IF(B{r}="","",VLOOKUP(B{r},'Screen scope 3'!$C:$K,6,FALSE))`,
            },
          },
          Z: {
            formulaFrom: {
              type: 'byExcel',
              whenModern: `=IF(B{r}="","",XLOOKUP(B{r},'Screen scope 3'!$C:$C,'Screen scope 3'!$K:$K,""))`,
              whenLegacy: `=IF(B{r}="","",VLOOKUP(B{r},'Screen scope 3'!$C:$K,9,FALSE))`,
            },
          },
          AO: {
            formulaFrom: { type: 'pattern', pattern: `=IF(B{r}="",0,D{r}*Q{r}/1000)` },
          },
        },
      },
    },
  },

  validations: [
    {
      id: 'fr041_scope3_AO_formula',
      level: 'warn',
      check: 'cellFormulaEquals',
      args: {
        sheet: 'Fr-04.1',
        range: 'AO51:AO56',
        pattern: `=IF(B{r}="",0,D{r}*Q{r}/1000)`,
      },
    },
  ],
};
