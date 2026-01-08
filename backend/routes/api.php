<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\CycleController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\EfCatalogController;
use App\Http\Controllers\Api\EfAr5Controller;
use App\Http\Controllers\Api\Fr041ConfigController;
use App\Http\Controllers\Api\Fr041SourcesController;
use App\Http\Controllers\Api\Fr041SelectionController;
use App\Http\Controllers\Api\Fr032SelectionController;
use App\Http\Controllers\Api\Scope11ExportController;
use App\Http\Controllers\Api\Scope11StationaryController;
use App\Http\Controllers\Api\Scope3Controller;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\TemplateSetController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'time' => now()->toIso8601String(),
        'version' => config('app.version') ?? config('app.env'),
    ], 200);
});

$publicCycleRoutes = function () {
    Route::get('/cycles', [CycleController::class, 'index']);
    Route::post('/cycles', [CycleController::class, 'store']);
    Route::put('/cycles/{cycle}/data', [CycleController::class, 'updateData']);
    Route::put('/cycles/{cycle}/template', [CycleController::class, 'updateTemplate']);
    Route::get('/cycles/{cycle}/preview', [CycleController::class, 'preview']);
    Route::post('/cycles/{cycle}/export', [ExportController::class, 'store']);
    Route::get('/templates', [TemplateController::class, 'index']);
    Route::get('/template-sets', [TemplateSetController::class, 'index']);
    Route::get('/cycles/{cycle}/scope11/stationary/items', [Scope11StationaryController::class, 'items']);
    Route::get('/cycles/{cycle}/scope3/summary', [Scope3Controller::class, 'summary']);
    Route::get('/cycles/{cycle}/scope3/{sectionId}/items', [Scope3Controller::class, 'items']);
    Route::get('/cycles/{cycle}/fr041/sources', [Fr041SourcesController::class, 'index']);
    Route::get('/cycles/{cycle}/fr041/config', [Fr041ConfigController::class, 'show']);
    Route::put('/cycles/{cycle}/fr041/config', [Fr041ConfigController::class, 'update']);
    Route::post('/cycles/{cycle}/fr041/selection', [Fr041SelectionController::class, 'store']);
    Route::get('/cycles/{cycle}/fr032/selection', [Fr032SelectionController::class, 'show']);
    Route::post('/cycles/{cycle}/fr032/selection', [Fr032SelectionController::class, 'store']);
    Route::get('/ef/ar5', [EfAr5Controller::class, 'index']);
    Route::get('/ef/catalog', [EfCatalogController::class, 'index']);
};

$publicScope11ExportRoutes = function () {
    Route::post('/exports/scope11/preview', [Scope11ExportController::class, 'preview']);
    Route::post('/exports/scope11/preview-json', [Scope11ExportController::class, 'previewJson']);
    Route::post('/exports/scope11/xlsx', [Scope11ExportController::class, 'export']);
};

if (app()->environment(['local', 'development', 'demo'])) {
    $publicCycleRoutes();
    $publicScope11ExportRoutes();
} else {
    Route::middleware('api-key')->group($publicCycleRoutes);
    Route::middleware('api-key')->group($publicScope11ExportRoutes);
}

Route::middleware('api-key')->group(function () {
    Route::get('/cycles/{cycle}', [CycleController::class, 'show']);
    Route::post('/cycles/{cycle}/attachments', [AttachmentController::class, 'store']);
    Route::get('/exports/{export}', [ExportController::class, 'show']);
});
