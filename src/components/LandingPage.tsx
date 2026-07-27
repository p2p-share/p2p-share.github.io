import { useMemo, useState } from "react";
import type { RecentProject } from "../lib/crossTab";
import { Icon } from "./Icons";

const featureGroups = [
  {
    icon: "users" as const,
    title: "Live collaboration",
    text: "Yjs editing over a bounded peer overlay designed for rooms of up to 10,000 participants, plus chat, reviews and mentions.",
  },
  {
    icon: "folder" as const,
    title: "Multi-file projects",
    text: "File tree, tabs, create, rename, duplicate, ZIP import/export, drag-and-drop, manifests and language detection.",
  },
  {
    icon: "braces" as const,
    title: "Professional editor",
    text: "Syntax highlighting, folding, minimap, multiple cursors, regex search, command palette, Vim and Emacs modes.",
  },
  {
    icon: "play" as const,
    title: "Browser code runner",
    text: "JavaScript, TypeScript, Python, Ruby, PHP, Lua, R, SQL and C/C++, plus Node and frontend playgrounds.",
  },
  {
    icon: "attachment" as const,
    title: "Encrypted file streams",
    text: "Concurrent direct peer downloads, device streaming, AES-256-GCM, SHA-256 verification and transfer speed status.",
  },
  {
    icon: "video" as const,
    title: "Audio and video meetings",
    text: "Face-to-face WebRTC calls inside the coding room with microphone, camera and multi-peer media controls.",
  },
  {
    icon: "eye" as const,
    title: "Safe local previews",
    text: "Sandboxed web previews, Markdown, SVG, JSON trees, CSV tables, Mermaid, diffs, Base64 and regex tools.",
  },
  {
    icon: "review" as const,
    title: "History and attribution",
    text: "Per-file version logs, author attribution, line-level changes, feedback requests and threaded discussions.",
  },
  {
    icon: "github" as const,
    title: "Git workflows",
    text: "Import public GitHub repositories without sign-in, optional GitHub authentication, Gists and repository export.",
  },
  {
    icon: "shield" as const,
    title: "Privacy by design",
    text: "No code-storage server, optional room passwords, read-only links, local recovery and ephemeral peer sessions.",
  },
  {
    icon: "refresh" as const,
    title: "Reliable rooms",
    text: "Firebase-assisted signaling, immediate reconnect, cross-tab coordination and offline-friendly local editing.",
  },
  {
    icon: "publish" as const,
    title: "Share and publish",
    text: "Short room IDs, editable or read-only links, QR invites, code downloads, ZIP projects and GitHub Pages delivery.",
  },
];

function loadRecentProjects(): RecentProject[] {
  try {
    return (JSON.parse(localStorage.getItem("p2p-share:recent-projects") || "[]") as RecentProject[])
      .filter((project) => project.roomId && project.name)
      .slice(0, 4);
  } catch {
    return [];
  }
}

export function LandingPage({
  onCreate,
  onOpen,
}: {
  onCreate: () => void;
  onOpen: (value: string, password?: string) => string | undefined;
}) {
  const [room, setRoom] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const recent = useMemo(loadRecentProjects, []);
  const join = () => {
    const message = onOpen(room, password);
    if (message) setError(message);
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Main navigation">
        <a className="landing-brand" href="./" aria-label="p2p-share home">
          <img src="./logo.png" alt="" />
          <span>p2p-share</span>
        </a>
        <div>
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <a href="https://github.com/p2p-share/p2p-share.github.io" target="_blank" rel="noreferrer"><Icon name="github" />GitHub</a>
          <button className="landing-nav-cta" onClick={onCreate}>Create room</button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="landing-kicker"><i />Serverless collaborative development</span>
          <h1>Code, talk and share files—directly with your peers.</h1>
          <p>p2p-share is a private, multi-peer coding workspace that runs from GitHub Pages. Collaborate in real time, execute code, review changes, call your team and transfer large files without uploading project data to a storage server.</p>
          <div className="hero-actions">
            <button className="landing-primary" onClick={onCreate}><Icon name="plus" />Create a new room</button>
            <a className="landing-secondary" href="#join"><Icon name="users" />Join a room</a>
          </div>
          <div className="hero-trust">
            <span><Icon name="shield" />Encrypted peer streams</span>
            <span><Icon name="globe" />Works on modern devices</span>
            <span><Icon name="check" />No account required</span>
          </div>
        </div>
        <div className="hero-product" aria-label="Product preview">
          <div className="product-window">
            <header><span /><span /><span /><b>realtime-demo.ts</b><em>3 peers</em></header>
            <div className="product-body">
              <aside><strong>PROJECT</strong><span className="selected"><Icon name="file" />realtime-demo.ts</span><span><Icon name="file" />server.py</span><span><Icon name="file" />README.md</span></aside>
              <pre><code><i>1</i><span className="token-purple">type</span> Room = {"{"}<br/><i>2</i>  peers: <span className="token-blue">Peer</span>[];<br/><i>3</i>  encrypted: <span className="token-purple">true</span>;<br/><i>4</i>{"}"};<br/><i>5</i><br/><i>6</i><span className="token-purple">await</span> room.<span className="token-blue">collaborate</span>();<br/><i>7</i><span className="token-green">// Your code stays with your peers.</span></code></pre>
            </div>
            <footer><span><i />Connected</span><span>TypeScript</span><span>AES-256-GCM</span></footer>
          </div>
          <div className="floating-peer peer-one"><span>AK</span><b>Alex</b><small>Editing line 6</small></div>
          <div className="floating-peer peer-two"><span>JM</span><b>Jamie</b><small>File verified</small></div>
        </div>
      </section>

      <section className="landing-join" id="join">
        <div><span className="landing-kicker">Already invited?</span><h2>Enter a room in seconds</h2><p>Paste a p2p-share link or enter its short room ID.</p></div>
        <div className="join-control">
          <label htmlFor="landing-room" className="sr-only">Invite link or room ID</label>
          <input id="landing-room" value={room} onChange={(event) => { setRoom(event.target.value); setError(""); }} onKeyDown={(event) => event.key === "Enter" && join()} placeholder="Room ID or invite link" />
          <button onClick={join}>Join room <Icon name="chevron" /></button>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="join-password">
          <label htmlFor="landing-password">Room password <span>optional</span></label>
          <input id="landing-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && join()} placeholder="Enter only for a protected room" />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="landing-recent" aria-labelledby="recent-title">
          <div className="section-heading"><span className="landing-kicker">This browser</span><h2 id="recent-title">Recent projects</h2></div>
          <div>{recent.map((project) => (
            <button key={project.roomId} onClick={() => onOpen(project.roomId)}>
              <span><Icon name="braces" /></span>
              <b>{project.name}</b>
              <small>{new Date(project.modifiedAt).toLocaleDateString()}</small>
              <Icon name="chevron" />
            </button>
          ))}</div>
        </section>
      )}

      <section className="landing-features" id="features">
        <div className="section-heading"><span className="landing-kicker">One browser workspace</span><h2>Everything needed to build together</h2><p>From the first shared line to review, execution and delivery—without installing a desktop client.</p></div>
        <div className="feature-grid">{featureGroups.map((feature) => (
          <article key={feature.title}>
            <span><Icon name={feature.icon} /></span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}</div>
      </section>

      <section className="landing-privacy" id="privacy">
        <div>
          <span className="landing-kicker">Private architecture</span>
          <h2>Your workspace is not somebody else’s database.</h2>
          <p>GitHub Pages serves the application. WebRTC carries collaboration, calls and file data between peers. Firebase is used only to help browsers discover each other—never to store your code or files.</p>
          <ul>
            <li><Icon name="check" /><span><b>End-to-end application encryption</b>Optional password-derived room encryption plus unique encrypted file streams.</span></li>
            <li><Icon name="check" /><span><b>Ephemeral by default</b>Close every peer and the live session disappears unless a browser owner enables local recovery.</span></li>
            <li><Icon name="check" /><span><b>Transparent local storage</b>Recovery stays in that browser and can be disabled or deleted from settings.</span></li>
          </ul>
        </div>
        <div className="privacy-flow">
          <span className="flow-peer"><Icon name="braces" /><b>Peer A</b></span>
          <i><em>Encrypted WebRTC</em></i>
          <span className="flow-peer"><Icon name="users" /><b>Peer B</b></span>
          <small><Icon name="shield" />No file-storage server</small>
        </div>
      </section>

      <section className="landing-cta">
        <img src="./logo.png" alt="" />
        <h2>Start collaborating without handing over your code.</h2>
        <p>Create a room, choose your name and invite your peers.</p>
        <button onClick={onCreate}><Icon name="plus" />Create a private room</button>
      </section>

      <footer className="landing-footer">
        <a className="landing-brand" href="./"><img src="./logo.png" alt="" /><span>p2p-share</span></a>
        <p>Peer-to-peer collaborative development from GitHub Pages.</p>
        <div><a href="https://p2p-share.github.io">Website</a><a href="https://github.com/Mr-Jerry-Haxor" target="_blank" rel="noreferrer">Author</a><a href="https://github.com/p2p-share" target="_blank" rel="noreferrer">GitHub</a></div>
      </footer>
    </main>
  );
}
