<?php

namespace App\Services\Export;

use Psr\SimpleCache\CacheInterface;

class SpreadsheetDiskCache implements CacheInterface
{
    private string $dir;

    public function __construct(string $dir)
    {
        $this->dir = rtrim($dir, DIRECTORY_SEPARATOR);
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0775, true);
        }
    }

    public function get(string $key, mixed $default = null): mixed
    {
        if (!$this->isKeyValid($key)) {
            throw new \InvalidArgumentException('Invalid cache key');
        }
        $path = $this->filePath($key);
        if (!is_file($path)) {
            return $default;
        }
        $content = @file_get_contents($path);
        if ($content === false) {
            return $default;
        }
        return unserialize($content);
    }

    public function set(string $key, mixed $value, $ttl = null): bool
    {
        if (!$this->isKeyValid($key)) {
            throw new \InvalidArgumentException('Invalid cache key');
        }
        $path = $this->filePath($key);
        return file_put_contents($path, serialize($value)) !== false;
    }

    public function delete(string $key): bool
    {
        if (!$this->isKeyValid($key)) {
            throw new \InvalidArgumentException('Invalid cache key');
        }
        $path = $this->filePath($key);
        if (is_file($path)) {
            return unlink($path);
        }
        return true;
    }

    public function clear(): bool
    {
        $files = glob($this->dir . DIRECTORY_SEPARATOR . '*.cache') ?: [];
        $ok = true;
        foreach ($files as $file) {
            if (is_file($file)) {
                $ok = unlink($file) && $ok;
            }
        }
        return $ok;
    }

    public function getMultiple(iterable $keys, mixed $default = null): iterable
    {
        $out = [];
        foreach ($keys as $key) {
            $out[$key] = $this->get($key, $default);
        }
        return $out;
    }

    public function setMultiple(iterable $values, $ttl = null): bool
    {
        $ok = true;
        foreach ($values as $key => $value) {
            $ok = $this->set($key, $value, $ttl) && $ok;
        }
        return $ok;
    }

    public function deleteMultiple(iterable $keys): bool
    {
        $ok = true;
        foreach ($keys as $key) {
            $ok = $this->delete($key) && $ok;
        }
        return $ok;
    }

    public function has($key): bool
    {
        if (!$this->isKeyValid($key)) {
            throw new \InvalidArgumentException('Invalid cache key');
        }
        return is_file($this->filePath($key));
    }

    private function isKeyValid($key): bool
    {
        if (!is_string($key) || $key === '') {
            return false;
        }
        if (preg_match('/[\{\}\(\)\/\\\\\@\:]|\s/', $key)) {
            return false;
        }
        return true;
    }

    private function filePath(string $key): string
    {
        $hash = hash('sha256', $key);
        return $this->dir . DIRECTORY_SEPARATOR . $hash . '.cache';
    }
}
