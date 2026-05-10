# Vite AI Studio No Auto-Reload

A focused `vite.config.ts` workaround for Google AI Studio Build projects that must run `vite dev`, but should not let Vite reload the preview page by itself.

## Problem

In Google AI Studio Build, the preview may show Vite client logs like:

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

When the Vite dev server connection is lost and recovered, Vite's browser-side client can poll and reload the page. That is disruptive if you are actively using the preview and want to preserve in-page state.

AI Studio may still reload the preview after the agent edits files. This repository does not try to prevent that. It only prevents extra Vite-driven websocket / polling / reconnect reloads.

## Strategy

The config keeps `vite dev` running, but replaces the browser-side `/@vite/client` module with a safe no-reload shim.

It:

- keeps Google AI Studio Build compatible with `vite dev`
- disables Vite websocket reconnect / polling / reload behavior
- disables HMR
- keeps CSS injection working in Vite dev mode through `updateStyle()` and `removeStyle()`
- keeps Vite file watching enabled so the dev server can invalidate its module graph when files change

## Use

Copy `vite.config.ts` from this repository into your Vite React project.

Your `package.json` can keep a normal AI Studio-compatible dev script:

```json
{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0"
  }
}
```

Run:

```bash
npm run dev
```

## Expected result

The browser console should no longer show:

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

CSS should still render normally.

## Tradeoffs

This intentionally disables Vite's browser-side HMR behavior.

After AI Studio edits files, rely on AI Studio's own preview reload, or reload the page manually. This is designed for stable interactive preview usage, not for classic local hot-module-reload development.

## Compatibility

This was written for a Vite + React + Tailwind setup similar to:

- Vite 6
- React 19
- `@vitejs/plugin-react`
- `@tailwindcss/vite`
- Google AI Studio Build

Other Vite versions may require small changes if Vite adds new exports to `/@vite/client`.

## Troubleshooting

### Error: `/@vite/client` does not provide an export named ...

Add that missing export to the fake client inside `neutralizeViteClient()` as a no-op.

### CSS disappears

Make sure the fake client still implements:

```ts
export function updateStyle(id, content) {}
export function removeStyle(id) {}
```

In Vite dev mode, CSS imports are injected through JavaScript. If these functions are missing or empty, styles may not appear.

### The page still reloads

Check DevTools Console and Network.

If the Vite logs are gone but the page still reloads, the source is probably not Vite's browser client. Check for:

- `location.reload`
- `window.location`
- service worker update handlers
- AI Studio platform-level preview reloads
- app-level navigation resets
