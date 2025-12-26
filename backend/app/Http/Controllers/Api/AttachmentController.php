<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\Cycle;
use Illuminate\Http\Request;

class AttachmentController extends Controller
{
    public function store(Request $request, Cycle $cycle)
    {
        $payload = $request->validate([
            'kind' => ['required', 'string', 'max:120'],
            'file' => ['required', 'file', 'max:5120'],
        ]);

        $file = $payload['file'];
        $dir = 'attachments/cycle_' . $cycle->id;
        $filename = uniqid('att_', true) . '_' . $file->getClientOriginalName();
        $path = $file->storeAs($dir, $filename, 'local');

        $attachment = Attachment::create([
            'cycle_id' => $cycle->id,
            'kind' => $payload['kind'],
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType() ?: 'application/octet-stream',
            'size' => $file->getSize(),
        ]);

        return response()->json([
            'id' => $attachment->id,
            'kind' => $attachment->kind,
            'original_name' => $attachment->original_name,
            'size' => $attachment->size,
        ], 201);
    }
}
