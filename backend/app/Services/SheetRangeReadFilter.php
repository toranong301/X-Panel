<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;

class SheetRangeReadFilter implements IReadFilter
{
    private string $sheetName;
    private int $startRow;
    private int $endRow;
    private int $startCol;
    private int $endCol;

    public function __construct(string $sheetName, string $range)
    {
        $this->sheetName = $sheetName;
        [$start, $end] = explode(':', str_replace('$', '', strtoupper(trim($range))));
        [$startCol, $startRow] = Coordinate::coordinateFromString($start);
        [$endCol, $endRow] = Coordinate::coordinateFromString($end);

        $this->startRow = (int) $startRow;
        $this->endRow = (int) $endRow;
        $this->startCol = Coordinate::columnIndexFromString($startCol);
        $this->endCol = Coordinate::columnIndexFromString($endCol);
    }

    public function readCell($column, $row, $worksheetName = ''): bool
    {
        if ($worksheetName !== $this->sheetName) return false;
        $colIndex = Coordinate::columnIndexFromString($column);

        return $row >= $this->startRow
            && $row <= $this->endRow
            && $colIndex >= $this->startCol
            && $colIndex <= $this->endCol;
    }
}
