/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const TEMPLATE_CANDIDATES = {
  cfo: [
    path.join(__dirname, '../src/assets/vsheet/VSHEET_CFO_blank.xlsx'),
    path.join(__dirname, '../src/assets/templates/mbax/แบบฟอร์ม V-Sheet CFO.xlsx'),
  ],
  demo: [
    path.join(__dirname, '../src/assets/vsheet/MBAX-TGO-11102567-Demo.xlsx'),
    path.join(__dirname, '../src/assets/templates/mbax/MBAX-TGO-11102567-Demo.xlsx'),
  ],
};

const SAMPLE_SCHEMA = {
  fixedBlocks: [
    {
      id: 'cfo-fr01-company',
      sheetName: 'Fr-01',
      inputs: [
        { key: 'companyName', cell: 'G4' },
        { key: 'reportPreparedBy', cell: 'J4' },
      ],
    },
  ],
  rowPoolBlocks: [
    {
      id: 'fr01-notes',
      sheetName: 'Fr-01',
      startRow: 5,
      maxRows: 3,
      columns: [
        { key: 'note', column: 'A' },
      ],
    },
  ],
  monthlyBlocks: [
    {
      id: 'fr042-monthly',
      sheetName: 'Fr-01',
      startRow: 50,
      maxRows: 3,
      monthColumns: ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'],
    },
  ],
};

const SAMPLE_DATA = {
  cfoFixed: {
    'cfo-fr01-company': {
      companyName: 'Demo Company',
      reportPreparedBy: 'QA Reviewer',
    },
  },
  subsheets: {
    'Fr-01::fr01-notes': [
      { inputs: { note: 'note 1' } },
      { inputs: { note: 'note 2' } },
    ],
    'Fr-01::fr042-monthly': [
      {
        months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    ],
  },
};

function resolveTemplate(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isFormula(cell) {
  return Boolean(cell?.formula || cell?.value?.formula);
}

function pickFormulaCells(ws, maxRows = 20, maxCols = 15, limit = 10) {
  const picked = [];
  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      const cell = ws.getCell(r, c);
      if (isFormula(cell)) {
        picked.push({
          sheetName: ws.name,
          address: cell.address,
          formula: cell.formula || cell.value?.formula,
        });
        if (picked.length >= limit) return picked;
      }
    }
  }
  return picked;
}

function setCellValueSafely(ws, cellRef, value) {
  const cell = ws.getCell(cellRef);
  const target = cell?.master || cell;
  if (isFormula(target)) return;
  target.value = value === '' ? null : value;
}

function writeFixedBlocks(workbook) {
  for (const block of SAMPLE_SCHEMA.fixedBlocks) {
    const ws = workbook.getWorksheet(block.sheetName);
    if (!ws) continue;
    const values = SAMPLE_DATA.cfoFixed[block.id] || {};
    for (const input of block.inputs) {
      if (values[input.key] === undefined) continue;
      setCellValueSafely(ws, input.cell, values[input.key]);
    }
  }
}

function writeRowPoolBlocks(workbook) {
  for (const block of SAMPLE_SCHEMA.rowPoolBlocks) {
    const ws = workbook.getWorksheet(block.sheetName);
    if (!ws) continue;
    const rows = SAMPLE_DATA.subsheets[`${block.sheetName}::${block.id}`] || [];
    for (let i = 0; i < block.maxRows; i++) {
      const excelRow = block.startRow + i;
      const row = rows[i];
      for (const col of block.columns) {
        const value = row?.inputs?.[col.key] ?? null;
        setCellValueSafely(ws, `${col.column}${excelRow}`, value);
      }
    }
  }
}

function writeMonthlyBlocks(workbook) {
  for (const block of SAMPLE_SCHEMA.monthlyBlocks) {
    const ws = workbook.getWorksheet(block.sheetName);
    if (!ws) continue;
    const rows = SAMPLE_DATA.subsheets[`${block.sheetName}::${block.id}`] || [];
    for (let i = 0; i < block.maxRows; i++) {
      const excelRow = block.startRow + i;
      const row = rows[i];
      if (block.columns) {
        for (const col of block.columns) {
          const value = row?.inputs?.[col.key] ?? null;
          setCellValueSafely(ws, `${col.column}${excelRow}`, value);
        }
      }
      for (let m = 0; m < block.monthColumns.length; m++) {
        const value = row?.months?.[m] ?? null;
        setCellValueSafely(ws, `${block.monthColumns[m]}${excelRow}`, value);
      }
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyWorkbook(templatePath, label) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const formulaCells = [];
  workbook.worksheets.forEach(ws => {
    formulaCells.push(...pickFormulaCells(ws));
  });

  writeFixedBlocks(workbook);
  writeRowPoolBlocks(workbook);
  writeMonthlyBlocks(workbook);

  for (const { sheetName, address } of formulaCells) {
    const ws = workbook.getWorksheet(sheetName);
    const cell = ws?.getCell(address);
    assert(isFormula(cell), `[${label}] Formula overwritten at ${sheetName}!${address}`);
  }

  const cfoSheet = workbook.getWorksheet('Fr-01');
  if (cfoSheet) {
    const fixedValue = cfoSheet.getCell('G4').value;
    assert(
      String(fixedValue ?? '') === 'Demo Company',
      `[${label}] CFO fixed input not written`,
    );
  }

  if (label === 'DEMO') {
    const rowPoolSheet = workbook.getWorksheet('Fr-01');
    if (rowPoolSheet) {
      const rowCell = rowPoolSheet.getCell('A5');
      const rowValue = (rowCell.master || rowCell).value;
      assert(String(rowValue ?? '') === 'note 1', `[${label}] Row pool input missing`);
      const tailCell = rowPoolSheet.getCell('A7');
      const tailValue = (tailCell.master || tailCell).value;
      assert(tailValue === null, `[${label}] Row pool tail row not cleared`);
    }

    const monthlySheet = workbook.getWorksheet('Fr-01');
    if (monthlySheet) {
      const monthCell = monthlySheet.getCell('K50');
      const monthValue = (monthCell.master || monthCell).value;
      assert(monthValue === 1, `[${label}] Monthly input missing`);
      const tailMonthCell = monthlySheet.getCell('K52');
      const tailMonthValue = (tailMonthCell.master || tailMonthCell).value;
      assert(tailMonthValue === null, `[${label}] Monthly tail row not cleared`);
    }
  }
}

(async () => {
  const cfoTemplate = resolveTemplate(TEMPLATE_CANDIDATES.cfo);
  const demoTemplate = resolveTemplate(TEMPLATE_CANDIDATES.demo);

  if (!cfoTemplate || !demoTemplate) {
    console.error('Missing templates for verification');
    process.exit(1);
  }

  try {
    await verifyWorkbook(cfoTemplate, 'CFO');
    await verifyWorkbook(demoTemplate, 'DEMO');
    console.log('verify-safe-write ✅');
  } catch (err) {
    console.error(`verify-safe-write failed: ${err.message}`);
    process.exit(1);
  }
})();
