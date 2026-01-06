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
        $result = $service->previewPayload($request->payload());
        return response()->json([
            'ok' => true,
            'splitEnabled' => $result['splitEnabled'] ?? false,
            'periodYear' => $result['periodYear'] ?? null,
            'headerMonths' => $result['headerMonths'] ?? null,
            'items' => $result['items'] ?? [],
            'unknown_rowIds' => $result['unknownRowIds'] ?? [],
            'warnings' => $result['warnings'] ?? [],
            'splitRows' => $result['splitRows'] ?? [],
            'linkCheck' => $result['linkCheck'] ?? null,
        ]);
    }
}
