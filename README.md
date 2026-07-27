<p align="center">
  <img src="public/logo.png" width="128" alt="p2p-share logo">
</p>

# p2p-share

**Live app:** [https://p2p-share.github.io](https://p2p-share.github.io)

**Author:** [Mr-Jerry-Haxor](https://github.com/Mr-Jerry-Haxor)

A private, static, peer-to-peer code room that runs entirely from GitHub Pages. It combines a CodeMirror editor, Yjs conflict-free collaboration, direct WebRTC data channels, optional password-derived AES-256-GCM encryption, arbitrary file transfer, and browser-local recovery.

## What “serverless” means here

p2p-share uses no application database, analytics endpoint, signaling service, STUN server, TURN relay, WebSocket server, tracker, or runtime CDN. The production bundle is self-contained. Optional, explicit Git publishing/import and Judge0 execution use the provider endpoint selected by the user; core editing, project tools, previews, storage, and collaboration do not.

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
- Multi-peer WebRTC audio meetings and video conferences with mute, camera, and leave controls
- Automatic in-room signaling expands the initial connection into a direct full mesh for conference media
- Collaborative code runner with local, time-limited JavaScript/TypeScript execution
- Optional Judge0 CE integration for Python, Java, C/C++, C#, Go, Rust, Kotlin, Swift, Ruby, PHP, and shell code
- Shared run status, standard output, errors, author, and timing for every peer
- Hidden-by-default version log with author, timestamp, exact affected lines, and inserted/deleted content
- Collaborative multi-file tabs with per-file language detection and syntax highlighting
- Hierarchical project explorer with create, rename/move, duplicate, delete, folder upload, ZIP import/export, and a synchronized project manifest
- Editable and read-only one-time invites with copy, native sharing, and locally generated QR codes
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

JavaScript and TypeScript execute locally in a disposable Web Worker with a five-second timeout and network APIs disabled. Other languages require a Judge0 CE endpoint configured by the user. Before each remote run, p2p-share names the endpoint and asks for confirmation because the source code and standard input leave the peer network. For private deployments, self-host [Judge0 CE](https://github.com/judge0/judge0).

## Calls, execution, and version logs

- Open **Room call** to start an audio-only or video meeting. As participants join, p2p-share uses the existing encrypted data mesh to exchange additional WebRTC offers and creates direct media paths between every participant.
- Open **Code runner** to execute the current document. The latest result is stored in the collaborative Yjs document so output appears for everyone.
- Open **Version logs** to inspect line-level attribution. The panel stays hidden until requested. Clearing it is a shared room action.

Full-mesh video is appropriate for small collaborative rooms because each browser sends one media stream to every other participant. Large conferences need an SFU media server, which would violate this project’s entirely static, zero-server runtime. Direct calls can also fail behind restrictive NATs because p2p-share deliberately uses no STUN or TURN service.

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

The application accepts individual files up to exactly 1 GiB. The WebRTC sender reads one 48 KiB slice at a time and obeys data-channel backpressure. Chromium’s File System Access API can stream an incoming file directly to a user-selected destination. Other browsers use IndexedDB, where the effective maximum depends on available disk space, browser quota, private-browsing policy, and device memory.

Shared-file metadata is synchronized through the room document, while file bytes move only when a peer requests them. Files cached in IndexedDB advertise the receiving peer as an additional provider, so later requests can use any online provider. A download streamed directly to a user-selected filesystem destination is not advertised because the browser no longer controls or can re-open that file. Removing a locally owned file clears its IndexedDB copy as well as the shared room listing.

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

Vite uses a relative asset base, so the build works both at a user/organization domain and under a repository subpath.

## Browser support

Use a current Chromium, Firefox, or Safari release with WebRTC data-channel support. Clipboard access, IndexedDB quota, direct NAT traversal, and the File System Access API vary by browser and security context. GitHub Pages supplies the HTTPS context required by Web Crypto and WebRTC.
