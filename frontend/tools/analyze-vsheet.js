const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  'src',
  'assets',
  'templates',
  'mbax',
  'แบบฟอร์ม V-Sheet CFO.xlsx',
);
const DEMO_PATH = path.join(
  __dirname,
  '..',
  'src',
  'assets',
  'templates',
  'mbax',
  'MBAX-TGO-11102567-Demo.xlsx',
);
const OUT_DIR = path.join(__dirname, 'out');
const JSON_PATH = path.join(OUT_DIR, 'vsheet-map.json');
const MD_PATH = path.join(OUT_DIR, 'vsheet-map.md');

const columnNumberToName = (num) => {
  let columnName = '';
  let dividend = num;
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
};

const toA1 = (row, col) => `${columnNumberToName(col)}${row}`;

const cellHasFormula = (cell) => {
  if (!cell) {
    return false;
  }
  if (cell.type === ExcelJS.ValueType.Formula) {
    return true;
  }
  if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
    return true;
  }
  return false;
};

const isBlankOrZero = (cell) => {
  if (!cell) {
    return true;
  }
  const value = cell.value;
  if (value === null || value === undefined || value === '') {
    return true;
  }
  if (typeof value === 'number' && value === 0) {
    return true;
  }
  return false;
};

const demoHasValue = (cell) => {
  if (!cell) {
    return false;
  }
  const value = cell.value;
  if (value === null || value === undefined || value === '') {
    return false;
  }
  return true;
};

const findConsecutiveRuns = (numbers) => {
  const runs = [];
  if (!numbers.length) {
    return runs;
  }
  let start = numbers[0];
  let prev = numbers[0];
  for (let i = 1; i < numbers.length; i += 1) {
    const current = numbers[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    runs.push({ start, end: prev });
    start = current;
    prev = current;
  }
  runs.push({ start, end: prev });
  return runs;
};

const detectRowPools = (rowsBySignature) => {
  const pools = [];
  rowsBySignature.forEach((rows, signature) => {
    if (rows.length < 3) {
      return;
    }
    const sortedRows = [...rows].sort((a, b) => a - b);
    let runStart = sortedRows[0];
    let runPrev = sortedRows[0];
    let runStep = null;
    let runLength = 1;
    for (let i = 1; i < sortedRows.length; i += 1) {
      const current = sortedRows[i];
      const diff = current - runPrev;
      if (runStep === null) {
        runStep = diff;
        runLength += 1;
        runPrev = current;
        continue;
      }
      if (diff === runStep) {
        runLength += 1;
        runPrev = current;
        continue;
      }
      if (runLength >= 3 && runStep > 0) {
        pools.push({
          startRow: runStart,
          endRow: runPrev,
          step: runStep,
          columns: signature.split(',').map((col) => Number(col)),
        });
      }
      runStart = runPrev;
      runPrev = current;
      runStep = diff;
      runLength = 2;
    }
    if (runLength >= 3 && runStep > 0) {
      pools.push({
        startRow: runStart,
        endRow: runPrev,
        step: runStep,
        columns: signature.split(',').map((col) => Number(col)),
      });
    }
  });
  return pools;
};

const extractDependencies = (formula) => {
  const dependencies = new Set();
  if (!formula) {
    return dependencies;
  }
  const regex = /'([^']+)'!|([A-Za-z0-9_]+)!/g;
  let match = regex.exec(formula);
  while (match) {
    const sheetName = match[1] || match[2];
    if (sheetName) {
      dependencies.add(sheetName);
    }
    match = regex.exec(formula);
  }
  return dependencies;
};

const buildSheetReport = (templateSheet, demoSheet) => {
  const candidateCells = [];
  const inputByRow = new Map();
  const formulaCells = [];
  const dependencies = new Set();

  const maxRows = demoSheet ? demoSheet.actualRowCount : templateSheet.actualRowCount;
  const maxCols = demoSheet ? demoSheet.actualColumnCount : templateSheet.actualColumnCount;

  for (let row = 1; row <= maxRows; row += 1) {
    for (let col = 1; col <= maxCols; col += 1) {
      const templateCell = templateSheet.getCell(row, col);
      if (cellHasFormula(templateCell)) {
        formulaCells.push({ row, col, address: templateCell.address });
        const formula =
          templateCell.type === ExcelJS.ValueType.Formula
            ? templateCell.formula
            : templateCell.value && templateCell.value.formula;
        extractDependencies(formula).forEach((sheet) => dependencies.add(sheet));
        continue;
      }
      const demoCell = demoSheet ? demoSheet.getCell(row, col) : null;
      if (isBlankOrZero(templateCell) && demoHasValue(demoCell)) {
        candidateCells.push({ row, col, address: toA1(row, col) });
        if (!inputByRow.has(row)) {
          inputByRow.set(row, []);
        }
        inputByRow.get(row).push(col);
      }
    }
  }

  const inputRanges = [];
  const monthlyPatterns = [];
  const rowsBySignature = new Map();

  inputByRow.forEach((cols, row) => {
    const sortedCols = [...cols].sort((a, b) => a - b);
    const signature = sortedCols.join(',');
    if (!rowsBySignature.has(signature)) {
      rowsBySignature.set(signature, []);
    }
    rowsBySignature.get(signature).push(row);

    const runs = findConsecutiveRuns(sortedCols);
    runs.forEach((run) => {
      const range = `${toA1(row, run.start)}:${toA1(row, run.end)}`;
      inputRanges.push({
        range,
        row,
        startColumn: run.start,
        endColumn: run.end,
        length: run.end - run.start + 1,
      });
      if (run.end - run.start + 1 >= 12) {
        monthlyPatterns.push({
          row,
          startColumn: run.start,
          endColumn: run.start + 11,
          range: `${toA1(row, run.start)}:${toA1(row, run.start + 11)}`,
          length: 12,
        });
      }
    });
  });

  const rowPools = detectRowPools(rowsBySignature).map((pool) => ({
    ...pool,
    columns: pool.columns,
    columnRange: `${columnNumberToName(pool.columns[0])}:${columnNumberToName(
      pool.columns[pool.columns.length - 1],
    )}`,
  }));

  const note = rowPools.length ? 'looks dynamic (row pools detected)' : 'looks fixed';

  return {
    name: templateSheet.name,
    formulaCellsCount: formulaCells.length,
    candidateInputCount: candidateCells.length,
    inputRanges,
    monthlyPatterns,
    rowPools,
    dependencies: [...dependencies].filter((dep) => dep !== templateSheet.name),
    note,
  };
};

const renderMarkdown = (report) => {
  const lines = [];
  lines.push('# V-Sheet mapping report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Sheets');
  report.sheets.forEach((sheet) => {
    lines.push(`### ${sheet.name}`);
    lines.push(`- Note: ${sheet.note}`);
    lines.push(`- Formula cells: ${sheet.formulaCellsCount}`);
    lines.push(`- Candidate inputs: ${sheet.candidateInputCount}`);
    if (sheet.dependencies.length) {
      lines.push(`- Depends on: ${sheet.dependencies.join(', ')}`);
    }
    if (sheet.inputRanges.length) {
      lines.push('- Input ranges (sample):');
      sheet.inputRanges.slice(0, 10).forEach((range) => {
        lines.push(`  - ${range.range}`);
      });
      if (sheet.inputRanges.length > 10) {
        lines.push(`  - ... (${sheet.inputRanges.length - 10} more)`);
      }
    }
    if (sheet.monthlyPatterns.length) {
      lines.push('- Monthly patterns:');
      sheet.monthlyPatterns.slice(0, 5).forEach((pattern) => {
        lines.push(`  - Row ${pattern.row}: ${pattern.range}`);
      });
      if (sheet.monthlyPatterns.length > 5) {
        lines.push(`  - ... (${sheet.monthlyPatterns.length - 5} more)`);
      }
    }
    if (sheet.rowPools.length) {
      lines.push('- Row pools:');
      sheet.rowPools.forEach((pool) => {
        lines.push(
          `  - Rows ${pool.startRow}-${pool.endRow} step ${pool.step} columns ${pool.columnRange}`,
        );
      });
    }
    lines.push('');
  });

  lines.push('## Dependency graph');
  if (!report.dependencyGraph.edges.length) {
    lines.push('- No cross-sheet dependencies detected.');
  } else {
    report.dependencyGraph.edges.forEach((edge) => {
      lines.push(`- ${edge.from} → ${edge.to}`);
    });
  }

  return `${lines.join('\n')}\n`;
};

const run = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const templateWorkbook = new ExcelJS.Workbook();
  const demoWorkbook = new ExcelJS.Workbook();

  await templateWorkbook.xlsx.readFile(TEMPLATE_PATH);
  await demoWorkbook.xlsx.readFile(DEMO_PATH);

  const sheets = [];
  const dependencyEdges = [];

  templateWorkbook.eachSheet((sheet) => {
    const demoSheet = demoWorkbook.getWorksheet(sheet.name);
    const report = buildSheetReport(sheet, demoSheet);
    sheets.push(report);
    report.dependencies.forEach((dependency) => {
      dependencyEdges.push({ from: sheet.name, to: dependency });
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    templatePath: path.relative(process.cwd(), TEMPLATE_PATH),
    demoPath: path.relative(process.cwd(), DEMO_PATH),
    sheets,
    dependencyGraph: {
      edges: dependencyEdges,
    },
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, renderMarkdown(report));

  console.log(`Wrote ${JSON_PATH}`);
  console.log(`Wrote ${MD_PATH}`);
};

run().catch((error) => {
  console.error('Failed to analyze V-Sheet workbooks:', error);
  process.exitCode = 1;
});
