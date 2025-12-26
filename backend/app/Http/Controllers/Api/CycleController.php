<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\MbaxTemplateService;
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

    public function preview(Request $request, Cycle $cycle, MbaxTemplateService $mbax)
    {
        $payload = $request->validate([
            'sheet' => ['required', 'string', 'max:200'],
            'range' => ['nullable', 'string', 'max:50'],
        ]);

        $sheet = trim((string) ($payload['sheet'] ?? ''));
        $range = trim((string) ($payload['range'] ?? ''));
        if ($sheet === '') {
            return response()->json(['message' => 'Sheet is required.'], 422);
        }

        if ($range === '') {
            $range = 'A1:Z60';
        }

        // Root cause seen in logs: missing MBAX template path triggered a 500.
        try {
            $spreadsheet = $mbax->loadTemplate($sheet, $range);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'MBAX template not found')) {
                return response()->json(['message' => 'Template missing'], 422);
            }
            throw $e;
        }

        try {
            $mbax->applyData($spreadsheet, $cycle->data_json ?? [], $cycle->attachments()->get()->all(), $sheet, $range);
            return response()->json($mbax->buildPreview($spreadsheet, $sheet, $range));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'Sheet')) {
                return response()->json(['message' => $e->getMessage()], 404);
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
}
