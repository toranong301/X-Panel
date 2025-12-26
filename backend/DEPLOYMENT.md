# Deployment (Plesk)

## Document root
- Point the docroot to `backend/public`.

## Build / install
1) `cd backend`
2) `composer install --no-dev --optimize-autoloader`
3) Copy `.env.example` to `.env` and set:
   - `APP_KEY`
   - `APP_ENV=production`
   - `APP_URL`
   - `DB_*`
   - `API_KEY`
   - `CORS_ALLOWED_ORIGINS=https://test-demo-platform-cfo.ecoxpanel.com`
   - `MBAX_TEMPLATE_PATH` (absolute path to MBAX template on the server)
4) `php artisan key:generate`
5) `php artisan storage:link`
6) `php artisan migrate --force`

## Queue worker (exports)
- `php artisan queue:work --tries=3` (optional if you later move exports to jobs)

## Notes
- Exports are saved under `storage/app/public/exports`.
- Attachments are saved under `storage/app/attachments`.
- PhpSpreadsheet requires `ext-zip` and image export works best with `ext-gd` enabled.
