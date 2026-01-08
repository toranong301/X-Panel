<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Export;
use App\Models\Fr041Config;
use App\Services\Export\Scope11HiddenTableExportService;
use App\Services\MbaxTemplateService;
use App\Services\TemplateRegistry;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ExportController extends Controller
{
    public function store(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        Scope11HiddenTableExportService $scope11Export
    )
    {
        $payload = $request->validate([
            'templateId' => ['nullable', 'string', 'max:200'],
        ]);

        $templateId = trim((string) ($payload['templateId'] ?? ''));
        if ($templateId === '') {
            $templateId = $this->resolveTemplateId($cycle, $registry);
        }
        $template = $registry->getTemplate($templateId);
        if (!$template) {
            return response()->json([
                'code' => 'INVALID_TEMPLATE',
                'message' => 'Unknown templateId.',
            ], 422);
        }

        try {
            $spreadsheet = $mbax->loadTemplate(null, null, $templateId);
            $profileId = isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== ''
                ? strtolower(trim($cycle->template_id))
                : 'mbax';
            $profile = $registry->getProfile($profileId);
            if ($profile) {
                $this->assertRequiredSheets($spreadsheet, $profile['requiredSheets'] ?? []);
                $this->assertHiddenTables($spreadsheet, $profile['hiddenTables'] ?? []);
            }
            $mbax->applyData($spreadsheet, $cycle->data_json ?? [], $cycle->attachments()->get()->all(), null, null, $templateId);
            $data = $cycle->data_json ?? [];
            $selectionRows = $this->loadFr041SelectionRowsFromData($data);
            if ($selectionRows) {
                $scope11Export->writeFr041SelectionRows($spreadsheet, $selectionRows);
            } else {
                $selection = $this->loadFr041SelectionRowIds($cycle->id);
                $scope11Export->writeSelectionToSpreadsheet($spreadsheet, $selection);
            }

            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            $tmpFile = tempnam(sys_get_temp_dir(), 'xpanel_export_');
            if (!$tmpFile) {
                return response()->json(['message' => 'Failed to create export file.'], 500);
            }
            $finalPath = $tmpFile . '.xlsx';
            $writer->save($finalPath);

            $filename = 'mbax_export_' . $cycle->id . '_' . now()->format('Ymd_His') . '.xlsx';
            return response()->download($finalPath, $filename, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])->deleteFileAfterSend(true);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'MBAX template not found')) {
                return response()->json([
                    'message' => 'Template missing',
                    'code' => 'TEMPLATE_NOT_FOUND',
                ], 500);
            }
            if (str_contains($e->getMessage(), 'PhpSpreadsheet')) {
                return response()->json([
                    'message' => 'Spreadsheet engine missing',
                    'code' => 'DEPENDENCY_MISSING',
                ], 500);
            }
            return response()->json(['message' => $e->getMessage()], 500);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Export failed.'], 500);
        }
    }

    public function show(Export $export)
    {
        return response()->json([
            'id' => $export->id,
            'cycle_id' => $export->cycle_id,
            'status' => $export->status,
            'file_path' => $export->file_path,
            'download_url' => null,
            'error_message' => $export->error_message,
            'created_at' => $export->created_at,
        ]);
    }

    private function assertRequiredSheets(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $requiredSheets): void
    {
        foreach ($requiredSheets as $sheetName) {
            if (!is_string($sheetName) || trim($sheetName) === '') {
                continue;
            }
            if (!$spreadsheet->getSheetByName($sheetName)) {
                throw new \RuntimeException("Missing required sheet: {$sheetName}");
            }
        }
    }

    private function assertHiddenTables(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $hiddenTables): void
    {
        if (!is_array($hiddenTables)) return;
        foreach ($hiddenTables as $table) {
            if (!is_array($table)) continue;
            $sheetName = $table['sheet'] ?? '';
            $tableName = $table['tableName'] ?? '';
            if (!is_string($sheetName) || !is_string($tableName) || $sheetName === '' || $tableName === '') {
                continue;
            }
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                throw new \RuntimeException("Missing required sheet: {$sheetName}");
            }
            $found = false;
            foreach ($sheet->getTableCollection() as $tbl) {
                if (strcasecmp($tbl->getName(), $tableName) === 0) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                throw new \RuntimeException("Missing required table: {$tableName} on sheet {$sheetName}");
            }
        }
    }

    private function resolveTemplateId(Cycle $cycle, TemplateRegistry $registry): string
    {
        if (isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== '') {
            $resolved = $registry->resolveTemplateIdForProfile($cycle->template_id);
            if ($resolved) {
                return $resolved;
            }
        }

        $data = $cycle->data_json ?? [];
        $fromData = is_array($data) ? ($data['templateId'] ?? $data['template_id'] ?? null) : null;
        if (is_string($fromData) && trim($fromData) !== '') {
            return trim($fromData);
        }

        if ($this->templateExists($registry, 'VSHEET_CFO')) {
            return 'VSHEET_CFO';
        }

        return MbaxTemplateService::DEFAULT_TEMPLATE_ID;
    }

    private function templateExists(TemplateRegistry $registry, string $templateId): bool
    {
        $mapping = $registry->getTemplate($templateId);
        if (!$mapping) return false;

        $envKey = $mapping['path']['env'] ?? null;
        if (is_string($envKey) && $envKey !== '') {
            $envPath = env($envKey);
            if (is_string($envPath) && $envPath !== '' && is_file($envPath)) {
                return true;
            }
        }

        $fallbackRel = $mapping['path']['fallback'] ?? null;
        if (is_string($fallbackRel) && $fallbackRel !== '') {
            $fallback = base_path($fallbackRel);
            if (is_file($fallback)) return true;
        }

        return false;
    }

    private function loadFr041SelectionRowIds(int $cycleId): array
    {
        $config = Fr041Config::query()
            ->where('cycle_id', $cycleId)
            ->where('sheet_id', 'fr041')
            ->where('section', 'scope1_stationary')
            ->first();

        $rows = $config?->selected_row_ids ?? [];
        return is_array($rows) ? $rows : [];
    }

    private function loadFr041SelectionRowsFromData(array $data): array
    {
        $rows = $data['fr041Selection'] ?? $data['fr041Selections'] ?? null;
        return is_array($rows) ? $rows : [];
    }
}
