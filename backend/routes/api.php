<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\CycleController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\Scope11ExportController;
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
    Route::get('/cycles/{cycle}/preview', [CycleController::class, 'preview']);
    Route::post('/cycles/{cycle}/export', [ExportController::class, 'store']);
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
