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

### Next.js client and server entry points

Next.js resolves a package differently depending on where it is imported. The
`@handsoff/next` package therefore exposes **separate client and server entry
points** so that server components never pull in browser-only code and client
components never pull in server-only code.

Supported behavior:

- The **server entry point** is safe to import from server components, route
  handlers, and middleware. It must not reference DOM globals or client-only
  hooks at module scope.
- The **client entry point** is marked as a client boundary (for example with a
  `"use client"` directive) and is the only place that may use browser APIs,
  effects, or client-only hooks.
- Importing the server entry point from a client component, or the client entry
  point from a server component, is unsupported and may fail the build.

Failure and edge cases:

- A consumer build that imports the client entry point into a server component
  should fail loudly (a build error or a clear runtime error) rather than
  silently shipping browser code to the server.
- A consumer build that imports the server entry point into a client component
  should likewise fail rather than bundling server-only code into the client.
- Importing either entry point in a plain Node.js context (no Next.js) must not
  throw at module scope; only the client entry point may require a DOM at
  runtime, and only when its client-only helpers are actually invoked.

### Verifying SSR safety

Each framework package includes automated coverage that imports its entry
point in a server-side context (no DOM globals) and asserts that loading and
basic server rendering succeed. The `@handsoff/next` package additionally
includes coverage that validates the separate client and server entry points in
consumer-style builds, including the failure cases above. Run the workspace
tests and type checks to verify the affected packages:

```sh
# from the repository root
npm test
npm run typecheck
```

## API stability

- #438: [react] Progress events not wired: IDLE_PROGRESS exists but restore:batch:complete is never mapped to setProgress

<!-- handsoff-issue-572 -->
- #572: Test malformed and oversized persisted history data at storage boundaries
