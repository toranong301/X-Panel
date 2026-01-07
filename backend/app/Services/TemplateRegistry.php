<?php

namespace App\Services;

class TemplateRegistry
{
    private array $registry = [];
    private array $profiles = [];

    public function __construct()
    {
        $path = base_path('resources/templates/template-registry.json');
        if (!file_exists($path)) {
            $this->registry = [];
        } else {
            $raw = file_get_contents($path);
            $decoded = json_decode($raw ?: '', true);
            $this->registry = is_array($decoded) ? $decoded : [];
        }

        $profilePath = base_path('resources/templates/template-profiles.json');
        if (is_file($profilePath)) {
            $rawProfiles = file_get_contents($profilePath);
            $decodedProfiles = json_decode($rawProfiles ?: '', true);
            $this->profiles = is_array($decodedProfiles['profiles'] ?? null) ? $decodedProfiles['profiles'] : [];
        }
    }

    public function getTemplate(string $templateId): array
    {
        return $this->registry['templates'][$templateId] ?? [];
    }

    public function getSheet(string $templateId, string $sheetId): array
    {
        $template = $this->getTemplate($templateId);
        $sheets = $template['sheets'] ?? [];
        $key = $this->normalizeSheetId($sheetId);
        return $sheets[$key] ?? [];
    }

    public function listSheetIds(string $templateId): array
    {
        $template = $this->getTemplate($templateId);
        return array_keys($template['sheets'] ?? []);
    }

    public function normalizeSheetId(string $sheetId): string
    {
        $upper = strtoupper(trim($sheetId));
        $upper = preg_replace('/[^A-Z0-9]+/', '_', $upper) ?? '';
        return trim($upper, '_');
    }

    public function getMapping(string $templateId, string $key): array
    {
        $template = $this->getTemplate($templateId);
        return $template['mappings'][$key] ?? [];
    }

    public function listProfiles(): array
    {
        return array_values($this->profiles);
    }

    public function getProfile(string $profileId): ?array
    {
        $key = strtolower(trim($profileId));
        if ($key === '') return null;
        return $this->profiles[$key] ?? null;
    }

    public function resolveTemplateIdForProfile(string $profileId): ?string
    {
        $profile = $this->getProfile($profileId);
        $templateId = $profile['templateId'] ?? null;
        if (!is_string($templateId) || trim($templateId) === '') {
            return null;
        }
        return trim($templateId);
    }
}
