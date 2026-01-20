<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('cycles')) {
            return;
        }

        Schema::table('cycles', function (Blueprint $table) {
            if (!Schema::hasColumn('cycles', 'locked_at')) {
                $table->timestamp('locked_at')->nullable()->after('data_json');
            }
            if (!Schema::hasColumn('cycles', 'locked_reason')) {
                $table->string('locked_reason', 500)->nullable()->after('locked_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('cycles')) {
            return;
        }

        Schema::table('cycles', function (Blueprint $table) {
            if (Schema::hasColumn('cycles', 'locked_reason')) {
                $table->dropColumn('locked_reason');
            }
            if (Schema::hasColumn('cycles', 'locked_at')) {
                $table->dropColumn('locked_at');
            }
        });
    }
};

