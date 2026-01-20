<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EfLibraryEntry extends Model
{
    protected $table = 'ef_library_entries';

    protected $fillable = [
        'ef_profile_id',
        'scope',
        'ef_id',
        'name',
        'unit',
        'co2',
        'fossil_ch4',
        'ch4',
        'n2o',
        'total',
        'source',
        'meta_json',
    ];

    protected $casts = [
        'meta_json' => 'array',
        'co2' => 'float',
        'fossil_ch4' => 'float',
        'ch4' => 'float',
        'n2o' => 'float',
        'total' => 'float',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(EfProfile::class, 'ef_profile_id');
    }
}

