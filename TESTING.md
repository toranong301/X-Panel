1) Backend: `cd backend` then run `php artisan serve` (ensure `API_KEY` is set in `.env`).
2) Frontend: `cd frontend` then run `ng serve --proxy-config proxy.conf.json`.
3) Open `http://localhost:4200`, go to data entry, click Review. Confirm requests go to `http://localhost:4200/api/...` and no NG0100 error.
4) If a cycle is missing, confirm the app auto-creates a "Demo Cycle" and retries without a 404.
