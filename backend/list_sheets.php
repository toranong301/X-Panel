<?php
require __DIR__ . "/vendor/autoload.php";
$p = $argv[1] ?? "";
if ($p === "" || !file_exists($p)) { echo "MISSING: $p\n"; exit(1); }
$s = \PhpOffice\PhpSpreadsheet\IOFactory::load($p);
print_r($s->getSheetNames());
