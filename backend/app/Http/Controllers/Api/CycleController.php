<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\MbaxTemplateService;
use App\Services\SheetRegistry;
use App\Services\TemplateRegistry;
use Illuminate\Http\Request;

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

        return response()->json(['id' => $cycle->id, 'updated' => true]);
    }

    public function preview(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        SheetRegistry $sheetRegistry
    )
    {
        $payload = $request->validate([
            'sheetId' => ['required', 'string', 'max:200'],
        ]);

        $sheetId = trim((string) ($payload['sheetId'] ?? ''));
        if ($sheetId === '') {
            return response()->json([
                'code' => 'INVALID_SHEET',
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

        $sheetConfig = $sheetRegistry->getSheet($templateId, $sheetId);
        if (!$sheetConfig) {
            return response()->json([
                'code' => 'INVALID_SHEET',
                'message' => 'Invalid sheetId.',
                'allowed' => $sheetRegistry->listSheetIds($templateId),
            ], 422);
        }

        $sheet = trim((string) ($sheetConfig['name'] ?? ''));
        $range = trim((string) ($sheetConfig['previewRange'] ?? ''));
        if ($sheet === '') {
            return response()->json([
                'code' => 'INVALID_SHEET',
                'message' => 'Sheet mapping missing.',
            ], 422);
        }
        if ($range === '') {
            return response()->json([
                'code' => 'INVALID_RANGE',
                'message' => 'Preview range missing.',
            ], 422);
        }

        // Root cause seen in logs: missing MBAX template path triggered a 500.
        try {
            $spreadsheet = $mbax->loadTemplate($sheet, $range, $templateId);
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
            throw $e;
        }

        try {
            $mbax->applyData(
                $spreadsheet,
                $cycle->data_json ?? [],
                $cycle->attachments()->get()->all(),
                $sheet,
                $range,
                $templateId
            );
            return response()->json($mbax->buildPreview($spreadsheet, $sheet, $range));
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'code' => 'INVALID_RANGE',
                'message' => $e->getMessage(),
            ], 422);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'Sheet')) {
                return response()->json([
                    'code' => 'INVALID_SHEET',
                    'message' => $e->getMessage(),
                ], 422);
            }
            \Log::error('Preview failed', [
                'cycleId' => $cycle->id,
                'sheet' => $sheet,
                'range' => $range,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Preview failed.'], 500);
        } catch (\Throwable $e) {
            \Log::error('Preview failed', [
                'cycleId' => $cycle->id,
                'sheet' => $sheet,
                'range' => $range,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Preview failed.'], 500);
        }
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
