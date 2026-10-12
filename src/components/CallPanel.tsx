import { useEffect, useRef } from "react";
import type { Presence } from "../types";
import { Icon } from "./Icons";

function VideoTile({ stream, muted, name, presenting }: {
  stream: MediaStream;
  muted?: boolean;
  name: string;
  presenting?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className={`video-tile${presenting ? " presenting" : ""}`}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span>{presenting && <Icon name="screen" />} {name}{presenting ? " · Presenting" : ""}</span>
    </div>
  );
}

export function CallPanel({
  open,
  localStream,
  remoteStreams,
  peers,
  mode,
  muted,
  cameraOff,
  screenSharing,
  sharingPeerIds,
  error,
  onStart,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onCopyLink,
  onLeave,
  onClose,
}: {
  open: boolean;
  localStream?: MediaStream;
  remoteStreams: Map<string, MediaStream>;
  peers: Presence[];
  mode?: "audio" | "video";
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  sharingPeerIds: Set<string>;
  error?: string;
  onStart: (mode: "audio" | "video") => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onCopyLink: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const participantCount = remoteStreams.size + (localStream ? 1 : 0);
  return (
    <section className="call-panel" aria-label="Peer call">
      <header>
        <div><span className="eyebrow">Direct WebRTC media</span><h2>Room call</h2></div>
        <span className="call-count"><Icon name="users" /> {participantCount}</span>
        <button className="icon-button" onClick={onCopyLink} aria-label="Copy room link" title="Copy room link"><Icon name="copy" /></button>
        <button className="icon-button" onClick={onClose} aria-label="Minimize call"><Icon name="x" /></button>
      </header>
      {error && <div className="call-error" role="alert">{error}</div>}
      {!localStream && remoteStreams.size === 0 ? (
        <div className="call-start">
          <span><Icon name="video" /></span><strong>Talk while you build</strong><p>Start a direct, peer-to-peer meeting with everyone connected to this room.</p>
          <div>
            <button className="secondary-button" onClick={() => onStart("audio")}><Icon name="mic" /> Audio call</button>
            <button className="primary-button" onClick={() => onStart("video")}><Icon name="video" /> Video call</button>
            <button className="secondary-button" onClick={onToggleScreenShare}><Icon name="screen" /> Present screen</button>
          </div>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {localStream && <VideoTile stream={localStream} muted name="You" presenting={screenSharing} />}
            {[...remoteStreams].map(([peerId, stream]) => <VideoTile key={peerId} stream={stream} presenting={sharingPeerIds.has(peerId)} name={peers.find((peer) => peer.peerId === peerId)?.name || "Peer"} />)}
          </div>
          <div className="call-controls">
            {!localStream ? (
              <>
                <button onClick={() => onStart("audio")} aria-label="Join with audio"><Icon name="mic" /></button>
                <button onClick={() => onStart("video")} aria-label="Join with video"><Icon name="video" /></button>
                <button onClick={onToggleScreenShare} aria-label="Present screen"><Icon name="screen" /></button>
              </>
            ) : (
              <>
                <button className={muted ? "off" : ""} onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}><Icon name={muted ? "mic-off" : "mic"} /></button>
                {mode === "video" && !screenSharing && <button className={cameraOff ? "off" : ""} onClick={onToggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}><Icon name={cameraOff ? "video-off" : "video"} /></button>}
                <button className={screenSharing ? "sharing" : ""} onClick={onToggleScreenShare} aria-label={screenSharing ? "Stop sharing screen" : "Share screen"} title={screenSharing ? "Stop sharing" : "Share screen"}><Icon name="screen" /></button>
                <button className="hangup" onClick={onLeave} aria-label="Leave call"><Icon name="phone-off" /></button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
