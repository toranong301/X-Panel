<?php

namespace App\Services;

class TemplateRegistry
{
    private array $registry = [];

    public function __construct()
    {
        $path = base_path('resources/templates/template-registry.json');
        if (!file_exists($path)) {
            $this->registry = [];
            return;
        }

        $raw = file_get_contents($path);
        $decoded = json_decode($raw ?: '', true);
        $this->registry = is_array($decoded) ? $decoded : [];
    }

    public function getTemplate(string $templateId): array
    {
        return $this->registry['templates'][$templateId] ?? [];
    }

    public function getMapping(string $templateId, string $key): array
    {
        $template = $this->getTemplate($templateId);
        return $template['mappings'][$key] ?? [];
    }
}
