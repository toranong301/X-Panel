<?php

require __DIR__ . '/../backend/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Table;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

$path = $argv[1] ?? (__DIR__ . '/../backend/storage/app/templates/mbax/VSheetCFO_BASE.xlsx');
if (!is_file($path)) {
    fwrite(STDERR, "Missing template: {$path}\n");
    exit(1);
}

$spreadsheet = IOFactory::load($path);

// Ensure hidden data sheet
$dataSheetName = '_DATA_SCOPE11';
$wsData = $spreadsheet->getSheetByName($dataSheetName);
if (!$wsData) {
    $wsData = new Worksheet($spreadsheet, $dataSheetName);
    $wsData->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
    $spreadsheet->addSheet($wsData);
} else {
    $wsData->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
}

// Ensure selection sheet
$selSheetName = '_FR041_SEL';
$wsSel = $spreadsheet->getSheetByName($selSheetName);
if (!$wsSel) {
    $wsSel = new Worksheet($spreadsheet, $selSheetName);
    $wsSel->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
    $spreadsheet->addSheet($wsSel);
} else {
    $wsSel->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
}

// Ensure EF mapping sheet (hidden)
$efMapSheetName = '_EF_AR5_MAP';
$wsEf = $spreadsheet->getSheetByName($efMapSheetName);
if (!$wsEf) {
    $wsEf = new Worksheet($spreadsheet, $efMapSheetName);
    $wsEf->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
    $spreadsheet->addSheet($wsEf);
} else {
    $wsEf->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
}

// Build table headers
$headers = [
    'RowId',
    'ItemLabel',
    'FuelType',
    'Evidence',
    'Unit',
    'M1',
    'M2',
    'M3',
    'M4',
    'M5',
    'M6',
    'M7',
    'M8',
    'M9',
    'M10',
    'M11',
    'M12',
    'OtherDieselPct',
    'OtherBiodieselPct',
    'OtherGasolinePct',
    'OtherEthanolPct',
    'OtherBiodieselDensityKgPerL',
    'OtherEthanolDensityKgPerL',
    'TankModeEnabled',
    'TankCount',
    'KgPerTank',
    'TankTargetMonth',
    'ComputedKg',
    'IncludeFR041',
];

foreach ($headers as $idx => $label) {
    $col = Coordinate::stringFromColumnIndex($idx + 1);
    $wsData->setCellValue($col . '1', $label);
}

$tableRange = 'A1:' . Coordinate::stringFromColumnIndex(count($headers)) . '201';
$existingTable = null;
foreach ($wsData->getTableCollection() as $table) {
    if (strcasecmp($table->getName(), 'tblScope11Stationary') === 0) {
        $existingTable = $table;
        break;
    }
}

if (!$existingTable) {
    $wsData->addTable(new Table($tableRange, 'tblScope11Stationary'));
} else {
    $existingTable->setRange($tableRange);
}

// Build selection table
$selHeaders = ['RowId', 'Include'];
foreach ($selHeaders as $idx => $label) {
    $col = Coordinate::stringFromColumnIndex($idx + 1);
    $wsSel->setCellValue($col . '1', $label);
}
$selRange = 'A1:B201';
$selTable = null;
foreach ($wsSel->getTableCollection() as $table) {
    if (strcasecmp($table->getName(), 'tblFR041Sel') === 0) {
        $selTable = $table;
        break;
    }
}
if (!$selTable) {
    $wsSel->addTable(new Table($selRange, 'tblFR041Sel'));
} else {
    $selTable->setRange($selRange);
}

// Build EF map table (fuelKey -> EF AR5)
$efHeaders = ['FuelKey', 'CO2', 'FossilCH4', 'CH4', 'N2O'];
foreach ($efHeaders as $idx => $label) {
    $col = Coordinate::stringFromColumnIndex($idx + 1);
    $wsEf->setCellValue($col . '1', $label);
}

// Map keys to EF TGO AR5 rows (based on MBAX demo layout)
$efRows = [
    2 => ['B7', 'EF TGO AR5', 'D11', 'E11', 'F11', 'G11'],
    3 => ['B10', 'EF TGO AR5', 'D11', 'E11', 'F11', 'G11'],
    4 => ['91/95', 'EF TGO AR5', 'D17', 'E17', 'F17', 'G17'],
    5 => ['E20', 'EF TGO AR5', 'D17', 'E17', 'F17', 'G17'],
];

foreach ($efRows as $row => $def) {
    [$key, $sheetName, $co2Cell, $fossilCell, $ch4Cell, $n2oCell] = $def;
    $wsEf->setCellValue('A' . $row, $key);
    $wsEf->setCellValue('B' . $row, "='{$sheetName}'!{$co2Cell}");
    $wsEf->setCellValue('C' . $row, "='{$sheetName}'!{$fossilCell}");
    $wsEf->setCellValue('D' . $row, "='{$sheetName}'!{$ch4Cell}");
    $wsEf->setCellValue('E' . $row, "='{$sheetName}'!{$n2oCell}");
}

$efRange = 'A1:E50';
$efTable = null;
foreach ($wsEf->getTableCollection() as $table) {
    if (strcasecmp($table->getName(), 'tblEfAr5') === 0) {
        $efTable = $table;
        break;
    }
}
if (!$efTable) {
    $wsEf->addTable(new Table($efRange, 'tblEfAr5'));
} else {
    $efTable->setRange($efRange);
}

// Update FR-04.1 formulas for Scope 1 Stationary (rows 11-24)
$wsFr = $spreadsheet->getSheetByName('Fr-04.1');
if ($wsFr) {
    $startRow = 11;
    $endRow = 24;
    $helperCol = Coordinate::stringFromColumnIndex(42); // AP

    for ($row = $startRow; $row <= $endRow; $row++) {
        $helperCell = $helperCol . $row;
        $indexFormula = '=IFERROR(INDEX(FILTER(tblFR041Sel[RowId],tblFR041Sel[Include]=1),ROWS($' . $helperCol . '$' . $startRow . ':' . $helperCell . ')),"")';
        $wsFr->setCellValue($helperCell, $indexFormula);

        $wsFr->setCellValue('B' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblScope11Stationary[RowId],tblScope11Stationary[ItemLabel],""))');
        $wsFr->setCellValue('C' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblScope11Stationary[RowId],tblScope11Stationary[Unit],""))');
        $totalFormula = 'SUM(INDEX(tblScope11Stationary[[M1]:[M12]],MATCH($' . $helperCol . $row . ',tblScope11Stationary[RowId],0),0))';
        $wsFr->setCellValue('D' . $row, '=IF($' . $helperCol . $row . '="","",IF($' . $helperCol . $row . '="B7",' . $totalFormula . '*0.93,IF($' . $helperCol . $row . '="B10",' . $totalFormula . '*0.90,IF($' . $helperCol . $row . '="91/95",' . $totalFormula . '*0.90,IF($' . $helperCol . $row . '="E20",' . $totalFormula . '*0.80,' . $totalFormula . ')))))');
        $wsFr->setCellValue('E' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblEfAr5[FuelKey],tblEfAr5[CO2],""))');
        $wsFr->setCellValue('F' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblEfAr5[FuelKey],tblEfAr5[FossilCH4],""))');
        $wsFr->setCellValue('G' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblEfAr5[FuelKey],tblEfAr5[CH4],""))');
        $wsFr->setCellValue('H' . $row, '=IF($' . $helperCol . $row . '="","",XLOOKUP($' . $helperCol . $row . ',tblEfAr5[FuelKey],tblEfAr5[N2O],""))');
    }
}

// Ensure 1.1 Stationary pulls values from hidden table (no legacy values)
$wsScope11 = $spreadsheet->getSheetByName('1.1 Stationary ');
if ($wsScope11) {
    $rowIds = [
        9 => 'DIESEL_B7_STATIONARY',
        10 => 'GASOHOL_9195_STATIONARY',
        12 => 'ACETYLENE_TANK5_MAINT_2',
        14 => 'ACETYLENE_TANK5_MAINT_3',
    ];
    $monthCols = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
    $monthKeys = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

    foreach ($rowIds as $row => $rowId) {
        $wsScope11->setCellValue(
            'B' . $row,
            "=IFERROR(XLOOKUP(\"{$rowId}\",tblScope11Stationary[RowId],tblScope11Stationary[Evidence],\"\"),\"\")"
        );
        $wsScope11->setCellValue(
            'C' . $row,
            "=IFERROR(XLOOKUP(\"{$rowId}\",tblScope11Stationary[RowId],tblScope11Stationary[Unit],\"\"),\"\")"
        );

        foreach ($monthCols as $idx => $col) {
            $monthKey = $monthKeys[$idx];
            $wsScope11->setCellValue(
                $col . $row,
                "=IFERROR(XLOOKUP(\"{$rowId}\",tblScope11Stationary[RowId],tblScope11Stationary[{$monthKey}],\"\"),\"\")"
            );
        }
    }
}

// MBAX-specific: make Screen scope 3 writable (no cross-sheet formulas)
$wsScreenScope3 = $spreadsheet->getSheetByName('Screen scope 3');
if ($wsScreenScope3) {
    $startRow = 2;
    $endRow = 45;
    $groupCol = 'A';

    for ($row = $startRow; $row <= $endRow; $row++) {
        $groupVal = trim((string) $wsScreenScope3->getCell($groupCol . $row)->getValue());
        $isGroup = preg_match('/^Scope\\s*3\\./i', $groupVal) === 1;
        if ($isGroup) {
            continue;
        }

        foreach (['C', 'D', 'E', 'F', 'G', 'H', 'K'] as $col) {
            $wsScreenScope3->setCellValue($col . $row, null);
        }
    }
}

// MBAX-specific: make FR-04.1 Scope 3 block writable (export writes selected rows)
$wsFr041 = $spreadsheet->getSheetByName('Fr-04.1');
if ($wsFr041) {
    for ($row = 51; $row <= 56; $row++) {
        foreach (['B', 'C', 'D'] as $col) {
            $wsFr041->setCellValue($col . $row, null);
        }
    }
}

$writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
$tmpPath = $path . '.tmp';
$writer->save($tmpPath);
@rename($tmpPath, $path);

echo "Updated template: {$path}\n";
