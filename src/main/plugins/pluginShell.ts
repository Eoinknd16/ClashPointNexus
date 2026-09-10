import { writeFileSync } from 'fs'
import { join } from 'path'

// script-src 'self' is the one line here that matters most: whatever this
// CSP otherwise allows, a plugin can never load and execute *new* remote
// code at runtime — only exactly what's on disk in its own folder (the
// bundle.js that was reviewed and hashed at install time, see install.ts).
// That's a real guarantee 'network' permission doesn't undermine: a
// plugin fetching data is not the same as a plugin fetching and eval'ing
// a different program than the one that was installed.
// style-src needs 'unsafe-inline' because bundle.js builds its own UI via
// innerHTML strings with inline style="" attributes rather than a
// stylesheet — CSP doesn't gate JS-set element.style.x assignments either
// way, only the HTML-attribute form, so this only affects that one thing.
// frame-src/object-src 'none' close off embedding another page or plugin
// inside this one as a second, unaccounted-for surface.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: http:; connect-src *; frame-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'"

/** Runs once per plugin folder, on every install — this file is never
 * derived from anything the plugin author supplies (their only input is
 * bundle.js's own bytes), so there's no path for a plugin.json/bundle.js
 * to influence what this HTML actually contains. */
function shellHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}#root{position:absolute;inset:0}</style>
</head>
<body>
<div id="root"></div>
<script src="./boot.js"></script>
</body>
</html>
`
}

/** The ONLY thing that ever calls window.ClashPointPlugin.mount — bridges
 * the host relay (__cpx for every ordinary plugin, see preload/plugin.ts;
 * __cpxTrusted for the one trusted plugin, see preload/arcadePlugin.ts and
 * main/plugins/trustedPlugins.ts) into the plain `api` shape a plugin's own
 * bundle.js actually expects (see NexusDash's own bundle.js doc comment for
 * the ordinary contract). A plugin never talks to the host global directly;
 * it only ever sees `api`, same object shape regardless of whether the real
 * transport underneath is this webview/IPC relay or (as with preview.html
 * during development) a plain keyboard shim — the contract is the same
 * either way. `trusted` only ever comes from install.ts passing
 * isTrustedPlugin(manifest.id) — never anything the manifest itself says —
 * and is the one difference between the two: a trusted plugin's `api` also
 * gets spawnProcess/queryRegistry/pickFolder/listDir/readFile/writeFile/
 * getEnvVar, thin wrappers over window.__cpxTrusted's own same-named calls. */
function bootJs(trusted: boolean): string {
  const bridgeGlobal = trusted ? '__cpxTrusted' : '__cpx'
  const trustedApiLines = trusted
    ? `
    api.spawnProcess = function (path, args) { return window.__cpxTrusted.spawnProcess(path, args); };
    api.queryRegistry = function (hive, keyPath) { return window.__cpxTrusted.queryRegistry(hive, keyPath); };
    api.pickFolder = function () { return window.__cpxTrusted.pickFolder(); };
    api.listDir = function (path) { return window.__cpxTrusted.listDir(path); };
    api.readFile = function (path) { return window.__cpxTrusted.readFile(path); };
    api.writeFile = function (path, content) { return window.__cpxTrusted.writeFile(path, content); };
    api.getEnvVar = function (name) { return window.__cpxTrusted.getEnvVar(name); };
`
    : ''
  return `(function () {
  var navHandlers = new Set();
  var api = {
    onNav: function (handler) {
      navHandlers.add(handler);
      return function () { navHandlers.delete(handler); };
    },
    exit: function () {
      window.${bridgeGlobal}.sendToHost({ type: 'exit' });
    }
  };
${trustedApiLines}
  window.${bridgeGlobal}.onHostMessage(function (data) {
    if (data && data.type === 'nav') {
      navHandlers.forEach(function (h) { h(data.action); });
    }
  });
  window.addEventListener('DOMContentLoaded', function () {
    var script = document.createElement('script');
    script.src = './bundle.js';
    script.onload = function () {
      if (window.ClashPointPlugin && typeof window.ClashPointPlugin.mount === 'function') {
        window.ClashPointPlugin.mount(document.getElementById('root'), api);
      } else {
        window.${bridgeGlobal}.sendToHost({ type: 'error', message: 'bundle.js did not define window.ClashPointPlugin.mount' });
      }
    };
    script.onerror = function () {
      window.${bridgeGlobal}.sendToHost({ type: 'error', message: 'bundle.js failed to load' });
    };
    document.body.appendChild(script);
  });
})();
`
}

/** Writes index.html + boot.js into an already-created plugin directory —
 * called once at install time, alongside the plugin's own downloaded
 * manifest/bundle (see install.ts). Both files are otherwise 100% fixed
 * content; `trusted` is the only thing that varies them, and it's always
 * supplied by install.ts from the hardcoded allow-list, never from
 * anything plugin-supplied. */
export function writePluginShell(dir: string, trusted: boolean): void {
  writeFileSync(join(dir, 'index.html'), shellHtml())
  writeFileSync(join(dir, 'boot.js'), bootJs(trusted))
}
