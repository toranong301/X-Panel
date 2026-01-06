<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Scope11ExportRequest;
use App\Services\Export\Scope11HiddenTableExportService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class Scope11ExportController extends Controller
{
    public function preview(Scope11ExportRequest $request, Scope11HiddenTableExportService $service)
    {
        $result = $service->export($request->payload());
        if (!empty($result['missingKeys'])) {
            Log::debug('Scope11 preview ignored unknown keys', ['missingKeys' => $result['missingKeys']]);
        }

        $filename = 'SCOPE11_PREVIEW.xlsx';
        return response()
            ->file($result['path'], [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
            ])
            ->deleteFileAfterSend(true);
    }

    public function export(Scope11ExportRequest $request, Scope11HiddenTableExportService $service)
    {
        $result = $service->export($request->payload());
        if (!empty($result['missingKeys'])) {
            Log::debug('Scope11 export ignored unknown keys', ['missingKeys' => $result['missingKeys']]);
        }

        $filename = 'SCOPE11_EXPORT.xlsx';
        return response()
            ->download($result['path'], $filename, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }

    public function previewJson(Scope11ExportRequest $request, Scope11HiddenTableExportService $service)
    {
        try {
            $result = $service->previewPayload($request->payload());
            return response()->json([
                'ok' => true,
                'splitEnabled' => $result['splitEnabled'] ?? false,
                'periodYear' => $result['periodYear'] ?? null,
                'headerMonths' => $result['headerMonths'] ?? null,
                'itemsPreview' => $result['itemsPreview'] ?? [],
                'splitRows' => $result['splitRows'] ?? [],
                'linkCheck' => $result['linkCheck'] ?? null,
            ]);
        } catch (\Throwable $e) {
            Log::error('Scope11 preview-json failed', [
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'exception' => $e,
            ]);

            $payload = [
                'ok' => false,
                'message' => $e->getMessage(),
                'code' => $e->getCode(),
            ];
            if (config('app.debug')) {
                $payload['debug'] = [
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ];
            }

            return response()->json($payload, 500);
        }
    }
}
