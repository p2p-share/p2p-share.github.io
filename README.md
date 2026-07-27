# ShareCode

A private, static, peer-to-peer code room that runs entirely from GitHub Pages. It combines a CodeMirror editor, Yjs conflict-free collaboration, direct WebRTC data channels, optional password-derived AES-256-GCM encryption, arbitrary file transfer, and browser-local recovery.

## What “serverless” means here

ShareCode makes no API calls and uses no database, analytics endpoint, signaling service, STUN server, TURN relay, WebSocket server, tracker, or CDN at runtime. The production bundle is self-contained.

That architecture has one deliberate tradeoff: peers pair manually.

1. The host chooses **Share** and creates a one-time invite link.
2. The guest opens the link and creates a connection answer.
3. The guest sends the answer to the host through any channel they already trust.
4. The host pastes the answer to complete the direct WebRTC connection.

Automatic “open one URL and appear in the room” discovery cannot be implemented on a static host without introducing a signaling service. Omitting STUN/TURN also means direct connections may fail across restrictive or symmetric NATs. This is the cost of a genuinely infrastructure-free runtime.

## Features

- Real-time multi-peer code and text editing with Yjs CRDT updates
- Syntax modes for plain text, JavaScript, TypeScript, Python, Java, C/C++, HTML, CSS, JSON, Markdown, and SQL
- Arbitrary files up to 1 GiB per file, streamed in backpressured chunks over WebRTC
- File System Access streaming on supporting browsers; IndexedDB fallback elsewhere
- Optional password protection using PBKDF2-SHA-256 and AES-256-GCM
- WebRTC DTLS encryption even when application password protection is off
- Local IndexedDB recovery by stable room URL
- Ephemeral mode and one-click local cache deletion
- Dark/light themes and responsive mobile layout
- No runtime external resources

## Privacy lifecycle

There is never a server-side copy. Open peers hold the live document in memory. With **Local recovery** enabled, each browser also holds its own IndexedDB copy so the stable room URL can restore the session. With recovery disabled, existing local data is deleted and future document snapshots are not stored.

The requirements “restore after every user closes the window” and “delete all data when every user closes” cannot both hold for the same local copy. ShareCode exposes the choice directly:

- **Local recovery on**: the browser copy survives closure until the user clears it or browser storage is evicted.
- **Ephemeral mode**: no recovery copy is retained; when the last open peer closes, the live session disappears.

Browsers do not provide a reliable, decentralized way for closed tabs to prove that all other peers have closed, so ShareCode never claims otherwise.

## File-size behavior

The application accepts individual files up to exactly 1 GiB. The WebRTC sender reads one 48 KiB slice at a time and obeys data-channel backpressure. Chromium’s File System Access API can stream an incoming file directly to a user-selected destination. Other browsers use IndexedDB, where the effective maximum depends on available disk space, browser quota, private-browsing policy, and device memory.

The collaborative editor is intended for text documents. Large or binary content should be shared through the file panel rather than inserted into the editor.

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
