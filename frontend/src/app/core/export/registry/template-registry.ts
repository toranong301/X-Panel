import { VSheetTemplateSpec } from '../models/template-spec.model';
import { TemplateAdapter } from '../engine/excel-export.engine';

import { MBAX_SPEC } from '../templates/mbax-tgo-11102567/mbax.spec';
import { MBAX_TGO_11102567_Adapter } from '../templates/mbax-tgo-11102567/mbax.adapter';

export interface TemplateBundle {
  spec: VSheetTemplateSpec;
  adapter: TemplateAdapter;
  /** template xlsx file URL (place the file under /assets) */
  templateUrl: string;
}

/**
 * Registry = a single switchboard. Add new companies by adding a new folder under templates/.
 */
export function resolveTemplate(templateId: string): TemplateBundle {
  const baseId = templateId.split('::')[0];
  switch (baseId) {
    case 'MBAX_TGO_11102567':
      return {
        spec: MBAX_SPEC,
        adapter: new MBAX_TGO_11102567_Adapter(),
        templateUrl: '/assets/templates/mbax/MBAX-TGO-11102567-Demo.xlsx',
      };
    default:
      throw new Error(`Unknown templateId: ${templateId}`);
  }
}
