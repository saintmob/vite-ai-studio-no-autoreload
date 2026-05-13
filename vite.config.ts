import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Neutralizes Vite's browser-side dev client while keeping CSS injection working.
 *
 * Important:
 * - This strong patch is NOT enabled merely because `DISABLE_HMR=true` exists.
 * - Some hosted preview environments use `DISABLE_HMR=true` as an internal signal,
 *   but still expect parts of Vite's normal startup path to remain available.
 * - Therefore, `DISABLE_HMR=true` only disables Vite HMR.
 * - The stronger `/@vite/client` replacement is enabled only with
 *   `AI_STUDIO_NO_AUTORELOAD=true`.
 *
 * Local development:
 * - If `DISABLE_HMR` and `AI_STUDIO_NO_AUTORELOAD` are not set, this plugin is
 *   not installed and normal Vite hot updates remain untouched.
 */
function neutralizeViteClient(): Plugin {
  const fakeViteClient = `
    const noop = () => {};

    const sheetsMap = new Map();
    let lastInsertedStyle;

    export function updateStyle(id, content) {
      if (typeof document === 'undefined') return;

      let style = sheetsMap.get(id);

      if (!style) {
        style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('data-vite-dev-id', id);
        style.textContent = content;

        if (!lastInsertedStyle) {
          document.head.appendChild(style);

          setTimeout(() => {
            lastInsertedStyle = undefined;
          }, 0);
        } else {
          lastInsertedStyle.insertAdjacentElement('afterend', style);
        }

        lastInsertedStyle = style;
        sheetsMap.set(id, style);
      } else {
        style.textContent = content;
      }
    }

    export function removeStyle(id) {
      if (typeof document === 'undefined') return;

      const style = sheetsMap.get(id);

      if (style) {
        style.remove();
        sheetsMap.delete(id);
      }

      document
        .querySelectorAll('style[data-vite-dev-id]')
        .forEach((el) => {
          if (el.getAttribute('data-vite-dev-id') === id) {
            el.remove();
          }
        });
    }

    const hotContext = {
      data: {},

      accept() {
        // CSS modules and React plugin transforms may call import.meta.hot.accept().
        // It must exist, but it must not subscribe to HMR updates.
      },

      decline: noop,
      dispose: noop,
      prune: noop,
      invalidate: noop,
      on: noop,
      off: noop,
      send: noop,
    };

    export function createHotContext() {
      return hotContext;
    }

    export function injectQuery(url, queryToInject) {
      if (!queryToInject) return url;
      if (url[0] !== '.' && url[0] !== '/') return url;

      const cleanUrl = url.replace(/[?#].*$/, '');
      const suffix = url.slice(cleanUrl.length);

      if (suffix.startsWith('?')) {
        return cleanUrl + '?' + queryToInject + '&' + suffix.slice(1);
      }

      return cleanUrl + '?' + queryToInject + suffix;
    }

    export const ErrorOverlay = class {
      constructor() {}
      close() {}
    };

    export default {};
  `;

  return {
    name: 'neutralize-vite-client-but-keep-css',
    apply: 'serve',
    enforce: 'pre',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/@vite/client')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript');
          res.end(fakeViteClient);
          return;
        }

        next();
      });
    },
  };
}

function isTrue(value: unknown): boolean {
  return value === 'true' || value === '1';
}

function isFalse(value: unknown): boolean {
  return value === 'false' || value === '0';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const disableHmrRequested =
    isTrue(env.DISABLE_HMR) || isTrue(process.env.DISABLE_HMR);

  const explicitNoAutoreloadEnabled =
    isTrue(env.AI_STUDIO_NO_AUTORELOAD) ||
    isTrue(process.env.AI_STUDIO_NO_AUTORELOAD);

  const explicitNoAutoreloadDisabled =
    isFalse(env.AI_STUDIO_NO_AUTORELOAD) ||
    isFalse(process.env.AI_STUDIO_NO_AUTORELOAD);

  const enableAiStudioNoAutoreloadPatch =
    explicitNoAutoreloadEnabled && !explicitNoAutoreloadDisabled;

  const disableHmr = disableHmrRequested || enableAiStudioNoAutoreloadPatch;

  return {
    plugins: [
      ...(enableAiStudioNoAutoreloadPatch ? [neutralizeViteClient()] : []),
      react(),
      tailwindcss(),
    ],

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,

      ...(disableHmr ? { hmr: false } : {}),

      ...(enableAiStudioNoAutoreloadPatch
        ? {
            // Keep watching enabled so Vite can invalidate its module graph after
            // files change. The browser-side client is neutralized above, so these
            // changes will not trigger Vite-driven reloads in the preview page.
            watch: {
              ignored: [
                '**/.git/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/.vite/**',
                '**/.cache/**',
                '**/*.log',
                '**/.aistudio/**',
                '**/.gemini/**',
              ],
            },
          }
        : {}),
    },
  };
});
