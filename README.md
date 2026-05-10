# Vite AI Studio No Auto-Reload

A focused `vite.config.ts` workaround for Google AI Studio Build projects that must run `vite dev`, but should not let Vite reload the preview page by itself.

## What you need to change

Only replace or patch your project's `vite.config.ts`.

You do **not** need to change:

- `package.json`
- npm scripts
- dependencies
- React entry files
- app source code
- Google AI Studio Build settings

This repository is intentionally limited to a single Vite configuration pattern to reduce integration noise.

## Problem

In Google AI Studio Build, the preview may show Vite client logs like:

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

That means the page is still running Vite's browser-side `/@vite/client` module.

When the Vite dev server connection is lost and recovered, that client can poll, reconnect, and reload the page. This is disruptive when you are actively using the preview and want to preserve in-page state.

This project does **not** try to block Google AI Studio's own preview reload after the agent edits files. It only prevents extra Vite-driven websocket / polling / reconnect reloads.

## Strategy

The config keeps `vite dev` running, but replaces the browser-side `/@vite/client` module with a safe no-reload shim.

It:

- keeps Google AI Studio Build compatible with `vite dev`
- disables Vite websocket reconnect / polling / reload behavior
- disables HMR
- keeps CSS injection working in Vite dev mode through `updateStyle()` and `removeStyle()`
- keeps Vite file watching enabled so the dev server can invalidate its module graph when files change

## Usage

Copy the `neutralizeViteClient()` plugin and the related `server` config from this repository's `vite.config.ts` into your own `vite.config.ts`.

Your existing dev script can stay as-is. For example, this common AI Studio script does not need to change:

```json
{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0"
  }
}
```

Run your project the same way you already do:

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

## Origin

This repository was created from a debugging discussion with ChatGPT about Google AI Studio Build preview auto-reload behavior. The README files and initial code were discussed with ChatGPT and submitted to this repository through ChatGPT-assisted GitHub actions.
