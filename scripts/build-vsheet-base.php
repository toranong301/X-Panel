<?php

require __DIR__ . '/../backend/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

$basePath = __DIR__ . '/../shared/templates/mbax/แบบฟอร์ม V-Sheet CFO.xlsx';
$mbaxPath = __DIR__ . '/../shared/templates/mbax/MBAX-TGO-11102567-Demo.xlsx';
$outPath = __DIR__ . '/../shared/templates/mbax/VSheetCFO_BASE.xlsx';

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
foreach ($copySheets as $sheetName) {
    $source = $mbax->getSheetByName($sheetName);
    if (!$source) {
        continue;
    }

    $existing = $base->getSheetByName($sheetName);
    if ($existing) {
        $base->removeSheetByIndex($base->getIndex($existing));
    }

    $cloned = $source->copy();
    $cloned->setTitle($sheetName);
    $cloned->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
    $base->addSheet($cloned);
}

$writer = IOFactory::createWriter($base, 'Xlsx');
$writer->save($outPath);

echo "Generated VSheetCFO_BASE.xlsx at {$outPath}\n";
