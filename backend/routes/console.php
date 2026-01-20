<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use App\Services\TemplateInspector;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('templates:inspect', function () {
    /** @var TemplateInspector $inspector */
    $inspector = app(TemplateInspector::class);
    $outDir = storage_path('app/template-maps');

    $this->info('Inspecting templates…');
    $results = $inspector->inspectAndWriteAll($outDir);

    if (!$results) {
        $this->warn('No templates found under: ' . storage_path('app/templates/mbax'));
        return;
    }

    foreach ($results as $row) {
        $this->line(sprintf(
            '- %s (%d sheets) -> %s',
            $row['templateId'],
            (int) ($row['sheetCount'] ?? 0),
            $row['output']
        ));
        $ef = $row['efSheets'] ?? [];
        if ($ef) {
            $this->line('  EF sheets: ' . implode(', ', $ef));
        }
    }

    $this->info('Done.');
})->purpose('Inspect Excel templates and write JSON maps');
