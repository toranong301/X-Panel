import { ApplicationConfig, provideBrowserGlobalErrorListeners, PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { apiKeyInterceptor } from './core/services/api-key.interceptor';
import { API_BASE_URL } from './core/services/api-base-url.token';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiKeyInterceptor])),
    provideClientHydration(withEventReplay()),
    {
      provide: API_BASE_URL,
      useFactory: (platformId: object) => {
        if (isPlatformBrowser(platformId)) {
          return '/api';
        }

        const envOrigin =
          (globalThis as any)?.process?.env?.BACKEND_ORIGIN ||
          (globalThis as any)?.process?.env?.API_BASE_ORIGIN ||
          (globalThis as any)?.process?.env?.BACKEND_URL ||
          '';

        const normalize = (value: string) => {
          const raw = String(value || '').trim().replace(/\/+$/, '');
          if (!raw) return '';
          if (raw.endsWith('/api')) return raw;
          return `${raw}/api`;
        };

        const fromEnv = normalize(envOrigin);
        if (fromEnv) return fromEnv;

        const fromConfig = String(environment.apiBaseUrl || '').trim();
        if (/^https?:\/\//i.test(fromConfig)) {
          return fromConfig.replace(/\/+$/, '');
        }

        return 'http://localhost:8000/api';
      },
      deps: [PLATFORM_ID],
    },
  ]
};
