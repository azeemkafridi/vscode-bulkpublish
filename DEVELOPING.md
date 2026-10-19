# Developing

```bash
npm install
npm run typecheck && npm test     # unit tests (logic + compose form in jsdom)
npm run test:host                 # Extension Development Host suite, against a stand-in server
BP_API_URL=http://localhost:4322 BP_TEST_KEY=bp_… npm run test:host   # same suite, live against a local app
npm run package                   # builds bulkpublish-<version>.vsix
```

F5 ("Run extension") opens a development host on `test/fixtures/workspace`.
Point it at a local app with the `bulkpublish.apiUrl` setting (plain http is
accepted only for localhost / 127.0.0.1).

Releasing (needs the publisher account first): `npm run publish:vsce` and
`npm run publish:ovsx` with `VSCE_PAT` / `OVSX_PAT` set.

## The compose form in a browser

```bash
BP_API_URL=http://localhost:4322 BP_TEST_KEY=bp_… npm run harness   # http://localhost:4360
```

Loads the real form (`dist/webview.js` + `media/compose.css`, dark editor theme)
beside a stand-in host that sends the same messages as the extension and calls a
real app. The key stays on the dev server, which adds it to forwarded `/api` calls.
Native dropdowns and date pickers can't be driven by every browser automation tool.
