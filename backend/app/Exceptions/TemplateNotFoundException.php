<?php

namespace App\Exceptions;

use RuntimeException;

class TemplateNotFoundException extends RuntimeException
{
    public function __construct(
        public readonly string $templateId,
        public readonly string $templateDir,
        public readonly array $attemptedPaths,
        string $message = 'MBAX template not found.'
    ) {
        parent::__construct($message);
    }
}
