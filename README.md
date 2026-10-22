# Handsoff

Handsoff is a set of framework entry points for building interactive UI with a
single, shared core. Each framework package ships its own entry point so that
consumers only pull in the code they need.

## Packages

- `@handsoff/core` — framework-agnostic core primitives.
- `@handsoff/react` — React entry point (provider, hooks, components).
- `@handsoff/next` — Next.js entry point (app router + pages router helpers).
- `@handsoff/vue` — Vue entry point.
- `@handsoff/svelte` — Svelte entry point.

## Server-side rendering (SSR)

Every framework entry point is safe to import in a server-side environment
(Node.js, edge runtimes, Next.js server components, and any bundler that runs
modules without DOM globals).

Guarantees:

- Importing any entry point **must not** touch `window`, `document`,
  `navigator`, `localStorage`, or other browser-only globals at module scope.
- Browser-only work is deferred to effects, lifecycle hooks, or explicit
  client-only helpers, so a server render never throws on a missing DOM.
- Rendering on the server produces markup that hydrates cleanly on the client;
  no browser state is read during the initial render.

### Compatibility constraints

- Entry points assume a modern ESM/CJS bundler. They do not polyfill DOM
  globals on the server.
- Code that needs the DOM (measurement, focus management, storage) must run in
  a client context. Use the framework's client-only escape hatch (for example
  `useEffect` in React, `onMount` in Svelte, `onMounted` in Vue) rather than
  reading globals during render.
- If you import an entry point in a non-DOM environment and it throws, that is
  a bug: the entry point must be guarded. Please report it with the runtime and
  bundler you used.

### Verifying SSR safety

Each framework package includes automated coverage that imports its entry
point in a server-side context (no DOM globals) and asserts that loading and
basic server rendering succeed. Run the workspace tests and type checks to
verify the affected packages:

```sh
# from the repository root
npm test
npm run typecheck
```

## API stability

Public APIs of the framework entry points are stable. Any intentional breaking
change is documented in the package changelog and called out in the release
notes.
