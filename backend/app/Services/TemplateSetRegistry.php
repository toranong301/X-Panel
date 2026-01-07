<?php

namespace App\Services;

class TemplateSetRegistry
{
    private array $sets = [];

    public function __construct()
    {
        $path = base_path('resources/templates/template-sets.json');
        if (!is_file($path)) {
            $this->sets = [];
            return;
        }

        $raw = file_get_contents($path);
        $decoded = json_decode($raw ?: '', true);
        $this->sets = is_array($decoded['templateSets'] ?? null) ? $decoded['templateSets'] : [];
    }

    public function listSets(): array
    {
        return array_values($this->sets);
    }

    public function getSet(string $setId): ?array
    {
        $key = strtolower(trim($setId));
        if ($key === '') return null;
        return $this->sets[$key] ?? null;
    }
}
