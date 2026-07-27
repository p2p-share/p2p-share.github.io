<p align="center">
  <img src="public/logo.png" width="128" alt="p2p-share logo">
</p>

# p2p-share

**Live app:** [https://p2p-share.github.io](https://p2p-share.github.io)

A private, static, peer-to-peer code room that runs entirely from GitHub Pages. It combines a CodeMirror editor, Yjs conflict-free collaboration, direct WebRTC data channels, optional password-derived AES-256-GCM encryption, arbitrary file transfer, and browser-local recovery.

## What “serverless” means here

p2p-share makes no API calls and uses no database, analytics endpoint, signaling service, STUN server, TURN relay, WebSocket server, tracker, or CDN at runtime. The production bundle is self-contained.

That architecture has one deliberate tradeoff: peers pair manually.

1. The host chooses **Share** and creates a one-time invite link.
2. The guest opens the link and creates a connection answer.
3. The guest sends the answer to the host through any channel they already trust.
4. The host pastes the answer to complete the direct WebRTC connection.

Automatic “open one URL and appear in the room” discovery cannot be implemented on a static host without introducing a signaling service. Omitting STUN/TURN also means direct connections may fail across restrictive or symmetric NATs. This is the cost of a genuinely infrastructure-free runtime.

## Features

- Real-time multi-peer code and text editing with Yjs CRDT updates
- First-visit display-name onboarding, connected-peer roster, and synchronized group chat
- One invite per new peer, native device sharing when available, and repeatable multi-peer onboarding
- Syntax modes for plain text, JavaScript, TypeScript, Python, Java, C/C++, HTML, CSS, JSON, Markdown, and SQL
- Arbitrary files up to 1 GiB per file, streamed in backpressured chunks over WebRTC
- File System Access streaming on supporting browsers; IndexedDB fallback elsewhere
- Optional password protection using PBKDF2-SHA-256 and AES-256-GCM
- WebRTC DTLS encryption even when application password protection is off
- Local IndexedDB recovery by stable room URL
- Ephemeral mode and one-click local cache deletion
- Open local text/code files directly in the collaborative editor
- Copy and language-aware document downloads (`Ctrl`/`Cmd` + `S`)
- Practical large-document mode: incremental remote edits, deferred zero-allocation statistics, parser fallback, and chunked imports up to 256 MiB
- Live line, word, and character statistics
- Drag-and-drop arbitrary attachments
- Adjustable editor text size, line wrapping, and peer display name
- Dark/light themes with phone, tablet, desktop, and landscape layouts
- Installable PWA shell with offline editing and local recovery
- Touch-friendly mobile action bar, settings sheet, and file drawer
- No runtime external resources

## Privacy lifecycle

There is never a server-side copy. Open peers hold the live document in memory. With **Local recovery** enabled, each browser also holds its own IndexedDB copy so the stable room URL can restore the session. With recovery disabled, existing local data is deleted and future document snapshots are not stored.

The requirements “restore after every user closes the window” and “delete all data when every user closes” cannot both hold for the same local copy. p2p-share exposes the choice directly:

- **Local recovery on**: the browser copy survives closure until the user clears it or browser storage is evicted.
- **Ephemeral mode**: no recovery copy is retained; when the last open peer closes, the live session disappears.

Browsers do not provide a reliable, decentralized way for closed tabs to prove that all other peers have closed, so p2p-share never claims otherwise.

## Offline and installed use

The production build registers a same-origin service worker that caches only the static application shell and assets. It does not create a remote data copy. After the first successful visit, the editor can open offline and restore locally cached rooms. Peer discovery and collaboration still require network connectivity.

On browsers that support installation, open **Settings → Install app**. On iOS/iPadOS, use Safari’s **Share → Add to Home Screen** action.

## File-size behavior

The application accepts individual files up to exactly 1 GiB. The WebRTC sender reads one 48 KiB slice at a time and obeys data-channel backpressure. Chromium’s File System Access API can stream an incoming file directly to a user-selected destination. Other browsers use IndexedDB, where the effective maximum depends on available disk space, browser quota, private-browsing policy, and device memory.

The collaborative editor is intended for text documents. Large or binary content should be shared through the file panel rather than inserted into the editor.

### Large text documents

CodeMirror renders only the visible viewport, remote Yjs edits are applied incrementally, and expensive statistics are deferred while typing. Files above 5 MiB automatically skip syntax parsing to protect responsiveness, while text imports are chunked and capped at 256 MiB. This can accommodate millions of short lines on a sufficiently capable desktop, but the real ceiling depends on RAM, browser limits, document shape, edit history, and the number of peers.

“Trillions of words” would require many terabytes and cannot fit in a browser tab or be synchronized safely by an in-memory CRDT. Content at that scale needs a distributed storage/query system, which would conflict with this project’s static, zero-server architecture.

## Development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm test
npm run build
```

## GitHub Pages deployment

1. Push the repository to GitHub using `master`, the repository's default branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Every push to `master` now runs linting, tests, the production build, and deployment.
   You can also manually run **Build and deploy GitHub Pages** from the Actions tab.

Vite uses a relative asset base, so the build works both at a user/organization domain and under a repository subpath.

## Browser support

Use a current Chromium, Firefox, or Safari release with WebRTC data-channel support. Clipboard access, IndexedDB quota, direct NAT traversal, and the File System Access API vary by browser and security context. GitHub Pages supplies the HTTPS context required by Web Crypto and WebRTC.
