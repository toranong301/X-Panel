<?php

namespace App\Services;

class SheetRegistry
{
    public function __construct(private TemplateRegistry $templates)
    {
    }

    public function getSheet(string $templateId, string $sheetId): array
    {
        return $this->templates->getSheet($templateId, $sheetId);
    }

    public function listSheetIds(string $templateId): array
    {
        return $this->templates->listSheetIds($templateId);
    }

    public function normalizeSheetId(string $sheetId): string
    {
        return $this->templates->normalizeSheetId($sheetId);
    }
}
