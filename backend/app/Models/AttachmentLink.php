<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttachmentLink extends Model
{
    protected $table = 'attachment_links';

    protected $fillable = [
        'cycle_id',
        'attachment_id',
        'scope',
        'record_id',
    ];

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(Cycle::class);
    }

    public function attachment(): BelongsTo
    {
        return $this->belongsTo(Attachment::class);
    }
}

