import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Neutralizes Vite's browser-side dev client while keeping CSS injection working.
 *
 * This plugin is intentionally NOT enabled by default. It is only activated in
 * AI Studio-like environments, detected by `DISABLE_HMR=true`, or when manually
 * opted in with `AI_STUDIO_NO_AUTORELOAD=true`.
 *
 * Why:
 * - Google AI Studio Build must run `vite dev` to start the preview.
 * - Vite's normal `/@vite/client` opens a websocket and may reload the page when
 *   the dev server connection is lost/recovered.
 * - In AI Studio, that can destroy in-preview state while the user is interacting
 *   with the app.
 *
 * What this does when enabled:
 * - Keeps `vite dev`.
 * - Disables HMR/reconnect/polling/full-reload behavior from the browser client.
 * - Preserves dev-mode CSS injection via `updateStyle()` / `removeStyle()`.
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const aiStudioLikeEnvironment =
    env.DISABLE_HMR === 'true' ||
    process.env.DISABLE_HMR === 'true' ||
    env.AI_STUDIO_NO_AUTORELOAD === 'true' ||
    process.env.AI_STUDIO_NO_AUTORELOAD === 'true';

  const patchExplicitlyDisabled =
    env.AI_STUDIO_NO_AUTORELOAD === 'false' ||
    process.env.AI_STUDIO_NO_AUTORELOAD === 'false';

  const enableAiStudioNoAutoreloadPatch =
    aiStudioLikeEnvironment && !patchExplicitlyDisabled;

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

      ...(enableAiStudioNoAutoreloadPatch
        ? {
            // Disable real Vite HMR only in the AI Studio patch mode.
            hmr: false,

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
