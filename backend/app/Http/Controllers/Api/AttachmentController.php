<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use App\Models\AttachmentLink;
use App\Models\Cycle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AttachmentController extends Controller
{
    public function index(Request $request, Cycle $cycle)
    {
        $payload = $request->validate([
            'kind' => ['nullable', 'string', 'max:120'],
            'scope' => ['nullable', 'string', 'max:50'],
        ]);

        $kind = trim((string) ($payload['kind'] ?? ''));
        $scope = trim((string) ($payload['scope'] ?? ''));

        $attachments = Attachment::query()
            ->with('links')
            ->where('cycle_id', $cycle->id)
            ->when($kind !== '', fn ($q) => $q->where('kind', $kind))
            ->orderByDesc('id')
            ->get()
            ->all();

        $out = [];
        foreach ($attachments as $att) {
            $links = [];
            foreach (($att->links ?? []) as $link) {
                if (!($link instanceof AttachmentLink)) continue;
                if ($scope !== '' && $link->scope !== $scope) continue;
                $links[] = [
                    'id' => $link->id,
                    'scope' => $link->scope,
                    'recordId' => $link->record_id !== '' ? $link->record_id : null,
                ];
            }

            if ($scope !== '' && !$links) {
                continue;
            }

            $out[] = [
                'id' => $att->id,
                'kind' => $att->kind,
                'original_name' => $att->original_name,
                'mime' => $att->mime,
                'size' => $att->size,
                'created_at' => optional($att->created_at)->toIso8601String(),
                'links' => $links,
            ];
        }

        return response()->json([
            'ok' => true,
            'attachments' => $out,
        ]);
    }

    public function store(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

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

    public function link(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        $payload = $request->validate([
            'attachmentIds' => ['required', 'array', 'min:1'],
            'attachmentIds.*' => ['integer'],
            'scope' => ['required', 'string', 'max:50'],
            'recordId' => ['nullable', 'string', 'max:200'],
        ]);

        $scope = trim((string) ($payload['scope'] ?? ''));
        $recordId = trim((string) ($payload['recordId'] ?? ''));
        $recordId = $recordId !== '' ? $recordId : '';

        $ids = array_values(array_unique(array_map('intval', $payload['attachmentIds'] ?? [])));
        $existing = Attachment::query()
            ->where('cycle_id', $cycle->id)
            ->whereIn('id', $ids)
            ->get(['id'])
            ->pluck('id')
            ->all();
        $existingSet = array_fill_keys(array_map('intval', $existing), true);

        $created = 0;
        foreach ($ids as $id) {
            if (!isset($existingSet[$id])) {
                continue;
            }

            $row = AttachmentLink::firstOrCreate([
                'cycle_id' => $cycle->id,
                'attachment_id' => $id,
                'scope' => $scope,
                'record_id' => $recordId,
            ]);
            if ($row->wasRecentlyCreated) {
                $created += 1;
            }
        }

        return response()->json([
            'ok' => true,
            'linked' => $created,
        ]);
    }

    public function unlink(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        $payload = $request->validate([
            'attachmentIds' => ['required', 'array', 'min:1'],
            'attachmentIds.*' => ['integer'],
            'scope' => ['required', 'string', 'max:50'],
            'recordId' => ['nullable', 'string', 'max:200'],
        ]);

        $scope = trim((string) ($payload['scope'] ?? ''));
        $recordId = trim((string) ($payload['recordId'] ?? ''));
        $recordId = $recordId !== '' ? $recordId : '';

        $ids = array_values(array_unique(array_map('intval', $payload['attachmentIds'] ?? [])));

        $deleted = AttachmentLink::query()
            ->where('cycle_id', $cycle->id)
            ->whereIn('attachment_id', $ids)
            ->where('scope', $scope)
            ->where('record_id', $recordId)
            ->delete();

        return response()->json([
            'ok' => true,
            'unlinked' => $deleted,
        ]);
    }

    public function download(Cycle $cycle, Attachment $attachment)
    {
        if ((int) $attachment->cycle_id !== (int) $cycle->id) {
            return response()->json([
                'ok' => false,
                'message' => 'Attachment not found in this cycle.',
            ], 404);
        }

        $path = $attachment->path ?? '';
        if (!is_string($path) || $path === '' || !Storage::disk('local')->exists($path)) {
            return response()->json([
                'ok' => false,
                'message' => 'File not found.',
            ], 404);
        }

        $absolute = Storage::disk('local')->path($path);
        return response()->download($absolute, $attachment->original_name ?? ('attachment_' . $attachment->id));
    }
}
