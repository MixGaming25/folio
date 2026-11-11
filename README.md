# Folio

A polished, offline Markdown reader for Linux. Warm paper, quiet typography, and your documents front and center.

## Run

```sh
python3 viewer.py
# Or open a specific document:
python3 viewer.py /path/to/notes.md
```

Requires **Python 3.9+** and a modern browser. No Python packages, Node installation, build step, accounts, or internet connection are required to run it. The interface opens in your default browser, served only on `127.0.0.1`. Stop the server with Ctrl+C when running from a terminal. All runtime libraries are bundled in `static/vendor`.

## Install the Linux launcher

```sh
python3 install.py
```

Find **Folio** in your applications menu, or run `~/.local/bin/folio`. Right-click a Markdown file and choose **Open With → Folio**. This does not change your default application. Keep the project folder in place; the launcher points to it. If `~/.local/bin` is on your PATH, the command is simply `folio`.

The optional `zenity` package provides a native Linux file picker, preserving paths for live refresh, relative images, and links. Without it, Folio uses the browser's file picker. Browser imports and drag-and-drop create a local reading copy and cannot watch the original file or access neighboring images. Use the native picker or command-line filename for those features. Relative images must be within the document's folder.

## Features

- GitHub-flavored Markdown: tables, task lists, fenced code, and raw HTML sanitized with DOMPurify.
- Bundled syntax highlighting and code copy buttons.
- Persistent document library, reading positions, and appearance settings stored locally in your browser.
- Document outline, document search, and library filtering.
- Light and dark themes; adjustable text size, font, and page width.
- Distraction-free focus mode and Markdown source view.
- Live refresh for documents opened from disk.
- Markdown downloads and browser printing / Save as PDF.
- Multiple file opening, drag-and-drop, and Linux Open With support.

Folio never uploads document contents. External links open in a separate tab. A document that contains remote images can still load those images from their original hosts. The reader works without network access; remote images will be unavailable offline.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Open files | Ctrl+O |
| Find in document | Ctrl+F |
| Toggle library | Ctrl+B |
| Focus mode | F |
| Filter library | / |
| Close search / leave focus | Escape |
| Next / previous search match | Enter / Shift+Enter |

## Development

```sh
npm ci
npx playwright install chromium --no-shell
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Python's standard library runs the app; npm is only needed for browser tests or updating bundled JavaScript. The server defaults to port 4179; use `--port 4180` to choose another, or `--no-browser` to run without opening a browser. A second invocation reuses the running instance and queues the supplied files.

To uninstall the launcher, remove `~/.local/bin/folio`, `~/.local/share/applications/folio.desktop`, and `~/.local/share/icons/hicolor/scalable/apps/folio.svg` (or the corresponding `$XDG_DATA_HOME` paths). Clear the site data for `http://127.0.0.1:4179` in your browser to remove reading history.

Bundled third-party licenses are in `static/vendor`.

## Contributors

- [Mihailo (MixGaming25)](https://github.com/MixGaming25) — project creator and maintainer.
- **OpenAI Codex / ChatGPT** — AI assistance with design, implementation, testing, documentation, and repository setup.
