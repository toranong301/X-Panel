<?php
require __DIR__ . '/vendor/autoload.php';
use PhpOffice\PhpSpreadsheet\IOFactory;
$file = __DIR__ . '/storage/app/exports/lean_1.xlsx';
if (!is_file($file)) {
    fwrite(STDERR, "file missing\n");
    exit(1);
}
$reader = IOFactory::createReader('Xlsx');
$spreadsheet = $reader->load($file);
$sheets = implode(', ', $spreadsheet->getSheetNames());
echo "sheets: $sheets\n";
$fr = $spreadsheet->getSheetByName('Fr-04.1');
if (!$fr) {
    echo "missing fr\n";
    exit(1);
}
for ($r = 2; $r <= 4; $r++) {
    $item = (string)$fr->getCell('B' . $r)->getValue();
    $efKey = (string)$fr->getCell('G' . $r)->getValue();
    $formula = (string)$fr->getCell('H' . $r)->getValue();
    echo "row $r: $item | $efKey | $formula\n";
}
