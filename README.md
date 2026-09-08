# ClashPoint Nexus

A controller-driven media center and game launcher for Windows. Steam games, TV/streaming, your apps, and now a growing plugin ecosystem, all from one interface built to be driven entirely with a controller from the couch.

Free, no ads, built in the open.

## What it does

- Full Steam library with native controller navigation, so you're not stuck fighting Steam Input for games that already have their own controller support
- TV and streaming through Stremio-compatible addons (Torrentio, subtitles, metadata/ratings)
- A custom TV homepage you build yourself, picking shows, movies, and addon catalogs and laying them out how you want
- Launch any Windows app or game from the same interface
- Mouse Mode: control the rest of Windows, outside of Nexus, entirely with a controller
- A real theme system: built-in themes, a visual editor, and a community theme repo you can browse, install from, or submit your own to
- A plugin store backed by a sandboxed runtime, so third-party plugins only get the capabilities they actually declare
- Updates itself

## Requirements

- Windows 10 or 11. Nexus uses Windows-only APIs (registry, global input hooks) and won't run on Mac or Linux.
- A game controller. Button prompts are labeled for PlayStation-style controllers; other controllers should still work through Windows' standard gamepad support.

## Installing

Grab the latest installer from the [Releases](https://github.com/Eoinknd16/ClashPointNexus/releases) page and run it.

The installer isn't code-signed yet, so Windows SmartScreen will likely show "Windows protected your PC" the first time. Click **More info**, then **Run anyway**. This is expected for now, not a sign anything's wrong.

After that, updates happen automatically from inside the app (Settings > App > Check for Updates).

## Building from source

Requires [Node.js](https://nodejs.org).

```
git clone https://github.com/Eoinknd16/ClashPointNexus.git
cd ClashPointNexus
npm install
npm run dev     # run it locally
npm run dist    # build a Windows installer
```

## Themes and plugins

Both are community repos, browsable and installable from inside Nexus (Store), or submit your own via a PR:

- Themes: [ClashPointNexus-Themes](https://github.com/Eoinknd16/ClashPointNexus-Themes)
- Plugins: [ClashPointNexus-Plugins](https://github.com/Eoinknd16/ClashPointNexus-Plugins)

## Status

Nexus is in active beta. Most of it is solid and used daily, but you'll hit rough edges. If something breaks, Settings > App > Open Logs Folder has what you need to report it.

Known issue: the PS/home button on the controller doesn't reliably bring Nexus to the foreground yet.
