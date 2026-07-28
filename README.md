<p align="center">
  <img src="public/logo.png" width="128" alt="p2p-share logo">
</p>

# p2p-share

**Live app:** [https://p2p-share.github.io](https://p2p-share.github.io)

**Author:** [Mr-Jerry-Haxor](https://github.com/Mr-Jerry-Haxor)

A private, static, peer-to-peer code room hosted by GitHub Pages. It combines a CodeMirror editor, Yjs conflict-free collaboration, direct WebRTC data channels, Firebase-assisted peer discovery, optional password-derived AES-256-GCM encryption, arbitrary file transfer, and browser-local recovery.

The root URL opens a responsive product landing page with generated or custom room creation, room-ID or invitation joining, an optional protected-room password field, recent local projects, the complete feature catalogue, privacy details, and direct room-link routing. Clean room paths and legacy room or invitation hashes bypass the landing page and open the workspace immediately.

## What “serverless” means here

p2p-share uses Firebase Authentication and Cloud Firestore only to discover peers and exchange temporary WebRTC session descriptions. Code, files, chat, editor state, and media are never written to Firebase; they travel over encrypted WebRTC routes and can be recovered from browser-local storage. Public STUN endpoints assist direct NAT discovery. A deployment can configure TURN to relay encrypted WebRTC packets when restrictive networks cannot establish a direct route.

Opening a compact clean-path room link such as `https://p2p-share.github.io/teZAT6` starts automatic multi-peer discovery. Generated IDs contain six alphanumeric characters; custom IDs accept 3–64 letters, numbers, underscores, or hyphens. Existing `#room=` links remain compatible:

1. The visitor receives an anonymous Firebase identity.
2. The browser registers an ephemeral participant in the room.
3. Four indexed ring-neighbor queries discover only a small, deterministic set of nearby peers instead of downloading the room's complete participant list.
4. Peers exchange offers and answers through a short-lived Firestore mailbox.
5. Consumed signals are deleted and collaboration continues over a bounded WebRTC overlay. Deduplicated Yjs, chat, review, and control events propagate across that overlay.

Firebase is signaling infrastructure, so the application is no longer strictly infrastructure-free. STUN improves direct connectivity, but reliable operation across restrictive or symmetric NATs requires a TURN service.

### Reliable NAT traversal with TURN

GitHub Pages cannot safely hold a Cloudflare TURN API token or mint credentials. The repository therefore includes `cloudflare-turn-worker`, a zero-storage credential broker that keeps the TURN key server-side and returns only expiring ICE credentials.

1. Rotate any TURN API token that has been pasted into chat or a terminal transcript.
2. Follow [`cloudflare-turn-worker/README.md`](cloudflare-turn-worker/README.md) to store `TURN_KEY_ID` and `TURN_API_TOKEN` as Worker secrets and deploy the Worker.
3. Add its public URL as the GitHub repository variable `VITE_TURN_CREDENTIALS_URL`.
4. Rerun the GitHub Pages workflow.

The browser fetches a fresh credential set once per page lifetime with a six-second timeout. If the Worker or Cloudflare TURN API is unavailable, the room continues with its public STUN pool instead of failing startup. Credentials are held only in page memory and both Worker and client use `no-store`.

WebRTC tries direct host and STUN paths first and can fall back to Cloudflare TURN over UDP, TCP, or TLS. The relay sees network metadata and encrypted WebRTC packets, but WebRTC DTLS and optional room-level encryption remain end to end; the TURN server does not receive plaintext project content.

Static `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` settings remain supported as a compatibility fallback, but they become visible in the public JavaScript bundle and are not recommended for permanent credentials.

Consumed signaling documents and intentional participant departures are deleted by the browser. Firestore TTL is intentionally not enabled in `firestore.indexes.json` because managed TTL deletion requires billing. Projects on the Blaze plan can opt in by adding TTL policies for the `expiresAt` field on the `rooms` and `signals` collection groups.

## Features

- Real-time multi-peer code and text editing with Yjs CRDT updates
- Bounded WebRTC overlay designed for room occupancy up to 10,000 peers without creating a quadratic full mesh
- First-visit display-name onboarding, connected-peer roster, and synchronized group chat
- One invite per new peer, native device sharing when available, and repeatable multi-peer onboarding
- Multi-peer WebRTC audio meetings and video conferences with mute, camera, and leave controls
- Indexed ring-neighbor discovery keeps each browser to 16 or fewer direct peer routes
- Collaborative code runner with local, time-limited JavaScript/TypeScript execution
- Browser-side runtimes for JavaScript/TypeScript, Python, Ruby, PHP, Lua, R, SQL, C/C++, Node.js projects, and frontend playgrounds
- Shared run status, standard output, errors, author, and timing for every peer
- Hidden-by-default version log with author, timestamp, exact affected lines, and inserted/deleted content
- Collaborative multi-file tabs with per-file language detection and syntax highlighting
- Hierarchical project explorer with create, rename/move, duplicate, delete, folder upload, ZIP import/export, and a synchronized project manifest
- Editable and read-only one-time invites with copy, native sharing, and locally generated QR codes
- Optional password setup inside Invite People and owner controls for changing each connected peer between editable and read-only client access
- Cross-tab duplicate detection, Yjs synchronization, single-tab persistence leadership, snippet handoff, recent-project refreshes, and app-update notices
- CodeMirror folding, bracket matching, automatic indentation, multiple cursors, regex find/replace, optional minimap, command palette, Vim/Emacs bindings, tab width, and high-contrast theme
- Worker-backed formatting and diagnostics: Prettier, SQL formatting, JSON validation, Markdown checks, TODO/FIXME extraction, dependencies, duplicates, indentation, whitespace, counts, and complexity estimates
- Sandboxed HTML/CSS/JavaScript preview with responsive viewports, console capture, DOM inspection, auto-refresh, and a JavaScript-off mode
- Local Markdown, SVG, JSON tree, CSV table, Mermaid, diff/patch, Base64, and regular-expression tools
- Markdown snippet descriptions with public, unlisted, and private visibility semantics
- Threaded code-review discussions, line references, peer mentions, reactions, and feedback requests
- Anonymous public repository import from GitHub and GitLab
- Session-authenticated GitHub Gist publishing and export to new GitHub repositories
- Linked source repository, branch, and commit metadata
- Syntax modes for plain text, JavaScript, JSX, TypeScript, TSX, Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, Ruby, PHP, shell, HTML, CSS, JSON, Markdown, SQL, YAML, XML, TOML, and Dockerfiles
- Arbitrary files up to 1 GiB per file, streamed in backpressured chunks over WebRTC
- Dedicated direct-file workspace with drag-and-drop upload, search, local/remote filters, peer availability, transfer progress/history, retry states, and native file-invite sharing
- Multi-provider file availability: a peer that caches a received file can continue serving it after the original uploader disconnects
- Browser-local previews for images, audio, video, PDF, and text/code files without uploading preview content
- File System Access streaming on supporting browsers; IndexedDB fallback elsewhere
- Optional password protection using PBKDF2-SHA-256 and AES-256-GCM
- WebRTC DTLS encryption even when application password protection is off
- Local IndexedDB recovery by stable room URL
- Ephemeral mode and one-click local cache deletion
- Open local text/code files directly in the collaborative editor
- Copy and language-aware document downloads (`Ctrl`/`Cmd` + `S`)
- Practical large-document mode: incremental remote edits, deferred statistics, parser fallback, and verified streaming imports up to 512 MiB
- Live line, word, and character statistics
- Drag-and-drop project files/folders plus arbitrary attachment sharing
- Adjustable editor text size, opt-in line wrapping (off by default), and peer display name
- Dark/light themes with phone, tablet, desktop, and landscape layouts
- Installable PWA shell with offline editing and local recovery
- Touch-friendly mobile action bar, settings sheet, and file drawer
- No runtime CDN or remotely loaded editor/formatter assets

## Project workspace and limits

### Large-room topology

Rooms use a deterministic ring overlay rather than connecting every browser to every other browser. Each participant watches four bounded Firestore queries, selects up to eight nearby ring neighbors, and maintains no more than 16 direct WebRTC routes including temporary file-transfer routes. Globally collaborative messages carry unique IDs, cross those routes, and are deduplicated by every browser. Presence and initial state-vector responses remain neighbor-only to prevent periodic all-room fan-out, while file bytes always use an on-demand direct connection to a provider.

This architecture is designed to let as many as 10,000 participants register in one room without the roughly 50 million connections a full mesh would require. It is not a claim that 10,000 concurrent clients have been load-tested in production: practical capacity still depends on Firebase quotas, browser and network reliability, event rate, geographic distribution, and NAT traversal. The interface shows locally connected routes and recently observed neighbors, not a costly global presence roster.

The collaborative project stores up to 2,000 UTF-8 text files and 512 MiB total uncompressed project content. The primary streaming importer accepts a single text file up to 512 MiB; bulk folder and ZIP imports retain a 256 MiB per-file guard because those paths must also stage archive or folder data. These are guardrails rather than promises that every mobile device can hold the maximum: Yjs history, browser memory, ZIP decompression, and syntax parsers add overhead. Files with NUL bytes or a high control-character ratio are treated as binary, skipped from the collaborative editor, and reported as warnings. Binary assets can still use the separate direct file-transfer panel.

ZIP exports contain every collaborative text file plus `p2p-share.project.json`. ZIP imports normalize paths, reject traversal components, enforce compressed and expanded limits, skip binary entries, detect languages by filename, and restore a valid project manifest when present.

Read-only invite mode disables editor and project mutations in the receiving interface while retaining viewing, preview, download, chat, review, and call access. Because this is a decentralized browser application with no trusted authorization server, read-only mode is a cooperative access control—not a cryptographic defense against a participant who deliberately modifies the open-source client. Password protection encrypts transport and local recovery but does not turn peers into trusted servers.

## Local analysis and safe previews

Formatting and analysis run in a dedicated Web Worker so parsing does not block the editor. Prettier handles JavaScript, JSX, TypeScript, TSX, HTML, XML-like markup, CSS, SCSS, Markdown, and JSON; SQL uses the bundled SQL formatter. Other languages still receive language-neutral diagnostics such as whitespace, indentation, duplicate lines, TODO/FIXME markers, counts, dependency-like imports, and estimated branch complexity.

HTML/CSS/JavaScript previews use `srcdoc` inside an iframe without `allow-same-origin`, popup, navigation, form, or download privileges. The preview document receives its own restrictive CSP with networking disabled. JavaScript can be disabled completely. Console and DOM-inspection events are copied out as inert text and rendered by React; preview markup never enters the application DOM. SVG and Mermaid output use script-disabled sandboxed frames. The application page also ships a CSP meta policy suitable for GitHub Pages, which cannot set custom response headers.

## Same-browser tab coordination

Each room opens a room-scoped `BroadcastChannel`. Tabs announce short-lived presence, synchronize Yjs updates, and elect the lexicographically lowest live tab as the only IndexedDB snapshot writer. This avoids competing saves while another tab remains available to take leadership after the current leader closes. The channel also supports sending the active snippet to other open tabs, refreshing the browser-local recent-project list, and announcing service-worker updates. BroadcastChannel data never leaves the current browser profile and origin.

## Privacy lifecycle

There is never a server-side copy. Open peers hold the live document in memory. With **Local recovery** enabled, each browser also holds its own IndexedDB copy so the stable room URL can restore the session. With recovery disabled, existing local data is deleted and future document snapshots are not stored.

The requirements “restore after every user closes the window” and “delete all data when every user closes” cannot both hold for the same local copy. p2p-share exposes the choice directly:

- **Local recovery on**: the browser copy survives closure until the user clears it or browser storage is evicted.
- **Ephemeral mode**: no recovery copy is retained; when the last open peer closes, the live session disappears.

Browsers do not provide a reliable, decentralized way for closed tabs to prove that all other peers have closed, so p2p-share never claims otherwise.

Audio and video use WebRTC media tracks over the same direct peer connections as collaboration. Camera and microphone access begins only after the user chooses an audio or video call. No media recorder is included, and media is not written to IndexedDB.

Read-only and editable modes are enforced by the official p2p-share client. Because this is a decentralized static application without a trusted authorization server, they are cooperative client permissions rather than protection against a deliberately modified client. Password encryption is the security boundary for confidential room content.

During active calls and file transfers, p2p-share requests the Screen Wake Lock API where supported. Returning to a visible tab refreshes presence without destroying healthy routes. An eight-second overlay health check repairs missing neighbors locally, initial ICE failures now trigger immediate localized repair, transient WebRTC disconnections receive a 15-second grace period, simultaneous repair offers use deterministic glare resolution, and unanswered automatic offers are removed after 30 seconds. Four STUN endpoints are pooled for endpoint resilience, and configured TURN UDP/TLS routes provide fallback for restrictive NATs and firewalls. Mobile operating systems can still suspend browser execution completely; a static PWA or service worker cannot guarantee a live WebRTC connection while the OS has suspended the page.

Simple JavaScript and TypeScript execute in a disposable Web Worker with a five-second timeout and network APIs disabled. Python uses Pyodide, Ruby uses ruby.wasm, PHP uses PHP Wasm, Lua uses Fengari, R uses WebR, SQL uses an in-memory SQLite Wasm database, and C/C++ use Wasm Clang. Node.js projects with a `package.json` use WebContainers, while frontend projects use Sandpack. Runtime payloads are lazy-loaded on first use; C/C++, R, Ruby, and Python can have substantial first-run downloads. CheerpJ is identified for compiled Java `.class`/`.jar` artifacts, but Java source compilation is not currently provided.

## Calls, execution, and version logs

- Open **Room call** to start an audio-only or video meeting. Calls are intentionally limited to the local small-group mesh (the current browser plus up to eight directly connected participants).
- Open **Code runner** to execute the current document. The latest result is stored in the collaborative Yjs document so output appears for everyone.
- Open **Version logs** to inspect line-level attribution. The panel stays hidden until requested. Clearing it is a shared room action.

Full-mesh video is appropriate only for small collaborative groups because each browser sends one media stream to every other participant. Large conferences need an SFU media server, which would violate this project’s entirely static, zero-storage-server runtime. Restrictive networks require the optional TURN configuration described above.

## Publishing and Git integration

- **Private** content stays in the current P2P room and optional local recovery storage.
- **Unlisted** publishes a secret GitHub Gist URL after explicit user action.
- **Public** publishes a publicly discoverable GitHub Gist.
- Public GitHub and GitLab repositories can be imported directly. The importer reads up to 100 UTF-8 text files of at most 1 MB each and skips binary content.
- GitHub export creates a repository and commits each collaborative file to its default branch. The linked repository, branch, and source commit are synchronized with the room.

GitHub’s OAuth token-exchange endpoints do not support direct browser CORS, and a static GitHub Pages application cannot protect a client secret. p2p-share therefore never embeds an OAuth secret or uses an unofficial token proxy. GitHub write operations accept a fine-grained token, verify it against the authenticated user API, keep it in `sessionStorage` only, and remove it when the tab session ends or the user signs out. Use the narrowest permissions needed: Gists for Gist publishing and repository creation/content permissions for Git repository export.

## Offline and installed use

The production build registers a same-origin service worker that caches only the static application shell and assets. It does not create a remote data copy. After the first successful visit, the editor can open offline and restore locally cached rooms. Peer discovery and collaboration still require network connectivity.

On browsers that support installation, open **Settings → Install app**. On iOS/iPadOS, use Safari’s **Share → Add to Home Screen** action.

## File-size behavior

The application accepts individual files up to exactly 1 GiB. Newly shared files are retained only as device-backed browser `File` references for the lifetime of the tab; their bytes are not copied into memory or IndexedDB. On request, the sender negotiates the peer SCTP message limit and reads the device stream in chunks up to 256 KiB. A bounded four-chunk Web Crypto pipeline overlaps SHA-256 and AES-256-GCM work, progress rendering is throttled, and each data channel uses an 8 MiB high-water backpressure window. Chromium’s File System Access API streams an incoming file directly to a user-selected destination. Other browsers use IndexedDB as a disk-backed receive fallback, where the effective maximum depends on available disk space, browser quota, and private-browsing policy.

Shared-file metadata is synchronized through the room document, while file bytes move only when a peer requests them. Each receiver gets an independent direct binary stream, allowing multiple peers to download concurrently without broadcasting payloads through the room mesh. Every stream uses a unique AES-256-GCM key, authenticated chunk ordering, SHA-256 chunk and transfer verification, and a final receiver acknowledgement. Files cached in IndexedDB advertise the receiving peer as an additional provider, so later requests can use any online provider. A download streamed directly to a user-selected filesystem destination is not advertised because the browser no longer controls or can re-open that file.

The collaborative editor is intended for text documents. Large or binary content should be shared through the file panel rather than inserted into the editor.

### Large text documents

CodeMirror renders only the visible viewport, remote Yjs edits are applied incrementally, and expensive statistics are deferred while typing. Files above 5 MiB automatically skip syntax parsing to protect responsiveness. Imports are decoded incrementally, inserted and synchronized in bounded 1 MiB chunks, expose byte/line progress and cancellation, verify that every source byte was read, and are capped at 512 MiB. Autosave is deferred until the stream is complete, and project strings are no longer rematerialized on every import update. This can accommodate millions of short lines on a sufficiently capable desktop, but the real ceiling depends on RAM, browser storage quota, browser limits, document shape, edit history, and the number and speed of peers.

The searchable language picker includes alphabetically ordered modes for APL, Brainfuck, C, C#, C++, Clojure, CMake, COBOL, CoffeeScript, CSS, D, Dart, Dockerfile, Erlang, Fortran, Go, Groovy, Haskell, HTML, Java, JavaScript, JSX, JSON, Julia, Kotlin, Lua, Markdown, Objective-C, Pascal, Perl, PHP, plain text, PowerShell, Protocol Buffers, Python, R, Ruby, Rust, Sass/SCSS, Scala, Shell, SQL, Swift, TOML, TypeScript, TSX, Visual Basic, XML/SVG, and YAML. Unknown extensions still open safely as plain text.

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

The production build uses root-relative assets and copies the compiled SPA entry to `404.html`. This is the GitHub Pages fallback that lets a first visit to `/teZAT6` boot the room while retaining the clean URL. This repository targets the root user site `https://p2p-share.github.io`; change the Vite base and `<base>` element before deploying under a repository subpath.

After changing `firestore.rules`, deploy the signaling rules separately:

```bash
firebase deploy --only firestore:rules
```

The current rules allow signed-in clients to remove participant records only after they have been stale for ten minutes. This distributed cleanup prevents abandoned participant documents from permanently occupying bounded discovery queries.

## Browser support

Use a current Chromium, Firefox, or Safari release with WebRTC data-channel support. Clipboard access, IndexedDB quota, direct NAT traversal, and the File System Access API vary by browser and security context. GitHub Pages supplies the HTTPS context required by Web Crypto and WebRTC.
