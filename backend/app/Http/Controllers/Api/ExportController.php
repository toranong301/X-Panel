<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Export;
use App\Services\MbaxTemplateService;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ExportController extends Controller
{
    public function store(Cycle $cycle, MbaxTemplateService $mbax)
    {
        $export = Export::create([
            'cycle_id' => $cycle->id,
            'status' => 'processing',
        ]);

        try {
            $spreadsheet = $mbax->loadTemplate();
            $mbax->applyData($spreadsheet, $cycle->data_json ?? [], $cycle->attachments()->get()->all());

            $dir = 'exports/cycle_' . $cycle->id;
            $filename = 'mbax_export_' . $cycle->id . '_' . now()->format('Ymd_His') . '.xlsx';
            $path = $dir . '/' . $filename;

            Storage::disk('public')->makeDirectory($dir);
            $fullPath = Storage::disk('public')->path($path);

            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            $writer->save($fullPath);

            $export->status = 'completed';
            $export->file_path = $path;
            $export->error_message = null;
            $export->save();

            return response()->json($this->formatExport($export));
        } catch (\Throwable $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();

            return response()->json([
                'id' => $export->id,
                'status' => 'failed',
                'error_message' => $export->error_message,
            ], 500);
        }
    }

    public function show(Export $export)
    {
        return response()->json($this->formatExport($export));
    }

    private function formatExport(Export $export): array
    {
        return [
            'id' => $export->id,
            'cycle_id' => $export->cycle_id,
            'status' => $export->status,
            'file_path' => $export->file_path,
            'download_url' => $export->file_path ? Storage::disk('public')->url($export->file_path) : null,
            'error_message' => $export->error_message,
            'created_at' => $export->created_at,
        ];
    }
}
