<?php

namespace Tests\Unit;

use App\Services\MbaxTemplateService;
use App\Services\TemplateRegistry;
use PHPUnit\Framework\TestCase;

class MbaxTemplateServiceTest extends TestCase
{
    public function test_resolves_demo_template_from_directory(): void
    {
        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'xpanel_tpl_' . uniqid();
        mkdir($tempDir, 0777, true);
        $filename = 'MBAX-TGO-11102567-Demo.xlsx';
        $path = $tempDir . DIRECTORY_SEPARATOR . $filename;
        file_put_contents($path, 'placeholder');

        putenv('MBAX_TEMPLATE_DIR=' . $tempDir);

        $service = new MbaxTemplateService(new TemplateRegistry());
        $resolved = $service->resolveTemplatePath('MBAX_TGO_11102567');

        $this->assertSame($path, $resolved);

        @unlink($path);
        @rmdir($tempDir);
        putenv('MBAX_TEMPLATE_DIR');
    }
}
