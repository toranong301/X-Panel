<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachment_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cycle_id')->constrained('cycles')->cascadeOnDelete();
            $table->foreignId('attachment_id')->constrained('attachments')->cascadeOnDelete();
            $table->string('scope', 50);
            $table->string('record_id', 200)->default('');
            $table->timestamps();

            $table->unique(['cycle_id', 'attachment_id', 'scope', 'record_id'], 'attachment_links_unique');
            $table->index(['cycle_id', 'scope'], 'attachment_links_cycle_scope');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachment_links');
    }
};

