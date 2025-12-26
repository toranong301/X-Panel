<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\CycleController;
use App\Http\Controllers\Api\ExportController;
use Illuminate\Support\Facades\Route;

Route::middleware('api-key')->group(function () {
    Route::get('/cycles', [CycleController::class, 'index']);
    Route::post('/cycles', [CycleController::class, 'store']);
    Route::get('/cycles/{cycle}', [CycleController::class, 'show']);
    Route::put('/cycles/{cycle}/data', [CycleController::class, 'updateData']);
    Route::post('/cycles/{cycle}/attachments', [AttachmentController::class, 'store']);
    Route::get('/cycles/{cycle}/preview', [CycleController::class, 'preview']);
    Route::post('/cycles/{cycle}/export', [ExportController::class, 'store']);
    Route::get('/exports/{export}', [ExportController::class, 'show']);
});
