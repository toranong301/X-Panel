<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\CycleController;
use App\Http\Controllers\Api\ExportController;
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

if (app()->environment(['local', 'development', 'demo'])) {
    $publicCycleRoutes();
} else {
    Route::middleware('api-key')->group($publicCycleRoutes);
}

Route::middleware('api-key')->group(function () {
    Route::get('/cycles/{cycle}', [CycleController::class, 'show']);
    Route::post('/cycles/{cycle}/attachments', [AttachmentController::class, 'store']);
    Route::get('/exports/{export}', [ExportController::class, 'show']);
});
