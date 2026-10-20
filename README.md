# Study Connections — Obsidian plugin

**Status:** experimental version 0.2.0. Developed for automatic, offline concept matching in Obsidian.

This is a free personal study tool. It scans notes for repeated vocabulary and a small curated list of related expressions, marks matches, and creates a linked library of concept notes under `Study Connections/Concepts`. It **does not** rewrite source notes, use an AI API, or verify whether suggested evidence links are academically sound.

## Install or update with BRAT

1. In Obsidian, install the **BRAT** community plugin.
2. Open BRAT settings, choose **Add beta plugin**, and paste:
   `https://github.com/izdrewz/inspo`
3. BRAT downloads the latest published release. Enable **Study Connections** in Community plugins.
4. In a test note, write `the key is listening to them.` and run **Study Connections: Scan vault and update concept pages** if needed.
5. Open `Study Connections/Concepts/listening.md` and inspect suggested links.

**Only test on disposable notes initially.** A released build and automated tests do not guarantee the Obsidian desktop editor integration works until tested in the app.

## Development

Source files are `src/core.js` and `src/main.js`. Requires Node.js, with no third-party npm dependencies:

```sh
npm run check
```

This runs Node tests and rebuilds the bundled `main.js`. GitHub Actions builds and publishes release assets `main.js`, `manifest.json`, `styles.css` whenever changes are pushed to main. New BRAT versions require bumping `manifest.json` and `package.json` version together.

## Limits and safety

- Identifies predefined expressions and repeated terms, **not** full semantic analysis.
- Source locations are best-effort offsets and may move when a note is edited.
- User explanations outside generated markers remain intact; generated sections may be refreshed.
- Live Preview marks have not been confirmed inside Obsidian.
- For public release, do not commit private university notes, login credentials, or source PDFs.

Code is currently not licensed for third-party reuse.