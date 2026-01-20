<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scope11_stationary_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cycle_id')->constrained('cycles')->cascadeOnDelete();
            $table->string('row_id', 200);
            $table->string('item_label', 500)->nullable();

            $table->string('evidence_type', 50)->nullable();
            $table->text('evidence_other')->nullable();
            $table->text('evidence')->nullable();

            $table->string('unit', 50)->default('L');
            $table->string('fuel_key', 50)->nullable();
            $table->string('other_type', 500)->nullable();
            $table->json('months_json')->nullable();
            $table->decimal('total', 18, 6)->nullable();
            $table->timestamps();

            $table->unique(['cycle_id', 'row_id'], 'scope11_stationary_items_cycle_row');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scope11_stationary_items');
    }
};

