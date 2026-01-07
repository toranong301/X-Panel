<?php

require __DIR__ . '/../backend/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Table;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

$path = __DIR__ . '/../shared/templates/mbax/VSheetCFO_BASE.xlsx';
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
        $wsFr->setCellValue('D' . $row, '=IF($' . $helperCol . $row . '="","",SUM(INDEX(tblScope11Stationary[[M1]:[M12]],MATCH($' . $helperCol . $row . ',tblScope11Stationary[RowId],0),0)))');
    }
}

$writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
$writer->save($path);

echo "Updated template: {$path}\n";
