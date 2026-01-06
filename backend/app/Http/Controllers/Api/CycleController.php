<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\MbaxTemplateService;
use App\Services\SheetRegistry;
use App\Services\TemplateRegistry;
use App\Exceptions\TemplateNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

class CycleController extends Controller
{
    public function index()
    {
        return response()->json(Cycle::query()->orderByDesc('id')->get());
    }

    public function store(Request $request)
    {
        $payload = $request->validate([
            'year' => ['required', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'data_json' => ['nullable', 'array'],
        ]);

        $cycle = Cycle::create([
            'year' => $payload['year'],
            'name' => $payload['name'],
            'data_json' => $payload['data_json'] ?? null,
        ]);

        return response()->json($cycle);
    }

    public function show(Cycle $cycle)
    {
        return response()->json($cycle);
    }

    public function updateData(Request $request, Cycle $cycle)
    {
        $payload = $request->validate([
            'data_json' => ['nullable', 'array'],
            'data' => ['nullable', 'array'],
        ]);

        $cycle->data_json = $payload['data_json'] ?? $payload['data'] ?? [];
        $cycle->save();

        return response()->json([
            'id' => $cycle->id,
            'updated' => true,
            'previewVersion' => optional($cycle->updated_at)->toIso8601String(),
        ]);
    }

    public function preview(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        SheetRegistry $sheetRegistry
    )
    {
        try {
            $cycle->refresh();
            $payload = $request->validate([
                'sheetId' => ['required', 'string', 'max:200'],
            ]);

            $rawSheetId = trim((string) ($payload['sheetId'] ?? ''));
            if ($rawSheetId === '') {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'sheetId is required.',
                ], 422);
            }

            $templateId = $this->resolveTemplateId($cycle, $registry);
            $template = $registry->getTemplate($templateId);
            if (!$template) {
                return response()->json([
                    'code' => 'INVALID_TEMPLATE',
                    'message' => 'Unknown templateId.',
                ], 422);
            }

            $sheetIdMap = [
                'fr041' => ['sheetId' => 'FR041', 'sheetName' => 'Fr-04.1'],
                'scope11_stationary' => ['sheetId' => 'SCOPE11_STATIONARY', 'sheetName' => '1.1 Stationary '],
            ];
            $sheetKey = strtolower($rawSheetId);
            $normalizedSheetId = $sheetIdMap[$sheetKey]['sheetId'] ?? $sheetRegistry->normalizeSheetId($rawSheetId);
            $allowedSheetIds = $sheetRegistry->listSheetIds($templateId);
            if (!in_array($normalizedSheetId, $allowedSheetIds, true)) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Invalid sheetId.',
                    'allowed' => $allowedSheetIds,
                ], 422);
            }

            $sheetConfig = $sheetRegistry->getSheet($templateId, $normalizedSheetId);
            if (!$sheetConfig) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Sheet mapping missing.',
                ], 422);
            }

            $sheet = (string) ($sheetIdMap[$sheetKey]['sheetName'] ?? ($sheetConfig['name'] ?? ''));
            $range = trim((string) ($sheetConfig['previewRange'] ?? ''));
            if (trim($sheet) === '') {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Sheet mapping missing.',
                ], 422);
            }
            if ($range === '') {
                return response()->json([
                    'code' => 'INVALID_RANGE',
                    'message' => 'Preview range missing.',
                ], 422);
            }

            $data = $cycle->data_json ?? [];
            if (!is_array($data)) {
                $data = [];
            }
            if ($sheetKey === 'fr041' && !$this->hasPreviewData($data, $normalizedSheetId)) {
                return response()->json([
                    'ok' => true,
                    'sheetId' => $sheetKey,
                    'sheetName' => $sheet,
                    'data' => [
                        'rows' => [],
                        'splitRows' => [],
                        'headerMonths' => new \stdClass(),
                    ],
                ]);
            }

            try {
                $mbax->resolveTemplatePath($templateId);
            } catch (TemplateNotFoundException $e) {
                $attempted = $e->attemptedPaths ? implode(', ', $e->attemptedPaths) : 'unknown';
                throw new \RuntimeException("Template not found: {$attempted}");
            }

            $spreadsheet = $mbax->loadTemplate(null, null, $templateId);
            $mbax->applyData(
                $spreadsheet,
                $data,
                $cycle->attachments()->get()->all(),
                $sheet,
                $range,
                $templateId
            );
            $preview = $mbax->buildPreview($spreadsheet, $sheet, $range);
            $preview['previewVersion'] = optional($cycle->updated_at)->toIso8601String();
            return response()->json($preview);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'code' => 'INVALID_RANGE',
                'message' => $e->getMessage(),
            ], 422);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'Sheet')) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => $e->getMessage(),
                ], 422);
            }
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Preview failed', [
                'cycleId' => $cycle->id,
                'sheetId' => $request->query('sheetId'),
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    private function hasPreviewData(array $data, string $sheetId): bool
    {
        if (!$data) return false;
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory) || !$inventory) {
            return false;
        }

        if ($sheetId === 'SCOPE11_STATIONARY') {
            return $this->hasInventoryForScope($inventory, '1.1');
        }
        if ($sheetId === 'FR041') {
            return $this->hasInventoryForScope($inventory, '1.1') || $this->hasInventoryForScope($inventory, '1.2');
        }

        return true;
    }

    private function hasInventoryForScope(array $inventory, string $subScope): bool
    {
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $subScope) continue;
            return true;
        }
        return false;
    }

    private function buildEmptyPreview(string $sheetName, string $range): array
    {
        $rangeInfo = $this->parseRange($range);
        $columns = [];
        for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
            $columns[] = Coordinate::stringFromColumnIndex($c);
        }

        $rows = [];
        for ($r = $rangeInfo['startRow']; $r <= $rangeInfo['endRow']; $r++) {
            $cells = [];
            for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
                $addr = Coordinate::stringFromColumnIndex($c) . $r;
                $cells[] = [
                    'addr' => $addr,
                    'raw' => null,
                    'formula' => null,
                    'computed' => null,
                    'display' => null,
                    'calcError' => null,
                    'type' => 'text',
                ];
            }
            $rows[] = [
                'rowNumber' => $r,
                'cells' => $cells,
            ];
        }

        return [
            'sheetName' => $sheetName,
            'columns' => $columns,
            'rows' => $rows,
            'range' => $range,
        ];
    }

    private function parseRange(string $range): array
    {
        $clean = strtoupper(trim(str_replace('$', '', $range)));
        if (!preg_match('/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/', $clean, $m)) {
            throw new \InvalidArgumentException("Invalid range: {$range}");
        }
        return [
            'startCol' => Coordinate::columnIndexFromString($m[1]),
            'startRow' => (int) $m[2],
            'endCol' => Coordinate::columnIndexFromString($m[3]),
            'endRow' => (int) $m[4],
        ];
    }

    private function resolveTemplateId(Cycle $cycle, TemplateRegistry $registry): string
    {
        $data = $cycle->data_json ?? [];
        $fromData = is_array($data) ? ($data['templateId'] ?? $data['template_id'] ?? null) : null;
        if (is_string($fromData) && trim($fromData) !== '') {
            return trim($fromData);
        }

        if (isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== '') {
            return trim($cycle->template_id);
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
}
