<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cycle extends Model
{
    protected $fillable = [
        'year',
        'name',
        'data_json',
    ];

    protected $casts = [
        'data_json' => 'array',
    ];

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    public function exports(): HasMany
    {
        return $this->hasMany(Export::class);
    }
}
