<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Export;
use App\Services\MbaxTemplateService;
use App\Services\TemplateRegistry;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ExportController extends Controller
{
    public function store(Cycle $cycle, MbaxTemplateService $mbax, TemplateRegistry $registry)
    {
        $templateId = $this->resolveTemplateId($cycle);
        $template = $registry->getTemplate($templateId);
        if (!$template) {
            return response()->json(['message' => 'Unknown templateId.'], 400);
        }

        try {
            $spreadsheet = $mbax->loadTemplate(null, null, $templateId);
            $mbax->applyData($spreadsheet, $cycle->data_json ?? [], $cycle->attachments()->get()->all(), null, null, $templateId);

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

    private function resolveTemplateId(Cycle $cycle): string
    {
        $data = $cycle->data_json ?? [];
        $fromData = is_array($data) ? ($data['templateId'] ?? $data['template_id'] ?? null) : null;
        if (is_string($fromData) && trim($fromData) !== '') {
            return trim($fromData);
        }

        if (isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== '') {
            return trim($cycle->template_id);
        }

        return MbaxTemplateService::DEFAULT_TEMPLATE_ID;
    }
}
