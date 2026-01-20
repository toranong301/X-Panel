<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EfProfile extends Model
{
    protected $table = 'ef_profiles';

    protected $fillable = [
        'code',
        'label',
        'gwp_json',
    ];

    protected $casts = [
        'gwp_json' => 'array',
    ];

    public function entries(): HasMany
    {
        return $this->hasMany(EfLibraryEntry::class, 'ef_profile_id');
    }
}

