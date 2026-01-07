<?php

require __DIR__ . '/../backend/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

$basePath = $argv[1] ?? (__DIR__ . '/../shared/templates/mbax/แบบฟอร์ม V-Sheet CFO.xlsx');
$mbaxPath = $argv[2] ?? (__DIR__ . '/../shared/templates/mbax/MBAX-TGO-11102567-Demo.xlsx');
$outPath = $argv[3] ?? (__DIR__ . '/../backend/storage/app/templates/mbax/VSheetCFO_BASE.xlsx');

if (!is_file($basePath)) {
    fwrite(STDERR, "Missing base template: {$basePath}\n");
    exit(1);
}
if (!is_file($mbaxPath)) {
    fwrite(STDERR, "Missing MBAX template: {$mbaxPath}\n");
    exit(1);
}

$base = IOFactory::load($basePath);
$mbax = IOFactory::load($mbaxPath);

$copySheets = ['_DATA_SCOPE11', '_REGISTRY'];
$sectionSheets = [
    '1.1 Stationary ',
    '1.2 Mobile',
];
foreach ($copySheets as $sheetName) {
    $source = $mbax->getSheetByName($sheetName);
    if (!$source) {
        continue;
    }

    $existing = $base->getSheetByName($sheetName);
    if ($existing) {
        $base->removeSheetByIndex($base->getIndex($existing));
    }

    $source->setTitle($sheetName);
    $source->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
    $base->addExternalSheet($source);
}

foreach ($sectionSheets as $sheetName) {
    $source = $mbax->getSheetByName($sheetName);
    if (!$source) {
        continue;
    }

    $existing = $base->getSheetByName($sheetName);
    if ($existing) {
        $base->removeSheetByIndex($base->getIndex($existing));
    }

    $source->setTitle($sheetName);
    $base->addExternalSheet($source);
    $target = $base->getSheetByName($sheetName);

    if ($sheetName === '1.1 Stationary ' && $target) {
        $ranges = ['E9:P9', 'E10:P10', 'E12:P12', 'E14:P14'];
        foreach ($ranges as $range) {
            [$start, $end] = explode(':', $range);
            $startCol = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString(preg_replace('/\d+/', '', $start));
            $startRow = (int) preg_replace('/\D+/', '', $start);
            $endCol = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString(preg_replace('/\d+/', '', $end));
            $endRow = (int) preg_replace('/\D+/', '', $end);
            for ($r = $startRow; $r <= $endRow; $r++) {
                for ($c = $startCol; $c <= $endCol; $c++) {
                    $addr = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($c) . $r;
                    $target->setCellValue($addr, null);
                }
            }
        }
    }
}

$writer = IOFactory::createWriter($base, 'Xlsx');
$outDir = dirname($outPath);
if (!is_dir($outDir)) {
    mkdir($outDir, 0777, true);
}
$writer->save($outPath);

echo "Generated VSheetCFO_BASE.xlsx at {$outPath}\n";
