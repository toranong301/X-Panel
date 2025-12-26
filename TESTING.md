1) Fresh DB: delete `backend/database/database.sqlite`, then run `php artisan migrate` from `backend`.
2) Backend: `cd backend` then run `php artisan serve` (ensure `API_KEY` is set in `.env`).
3) Frontend: `cd frontend` then run `ng serve --proxy-config proxy.conf.json`.
4) Open `http://localhost:4200` and confirm a demo cycle is auto-created/stored.
5) Click Review: confirm requests go to `http://localhost:4200/api/...` and no 404/500.
6) Confirm no requests hit `/api/cycles/1` unless cycle 1 exists.
