import { useEffect, useRef } from "react";
import type { Presence } from "../types";
import { Icon } from "./Icons";

function VideoTile({ stream, muted, name }: { stream: MediaStream; muted?: boolean; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <div className="video-tile"><video ref={ref} autoPlay playsInline muted={muted} /><span>{name}</span></div>;
}

export function CallPanel({
  open,
  localStream,
  remoteStreams,
  peers,
  mode,
  muted,
  cameraOff,
  onStart,
  onToggleMute,
  onToggleCamera,
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
  onStart: (mode: "audio" | "video") => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <section className="call-panel" aria-label="Peer call">
      <header><div><span className="eyebrow">End-to-end WebRTC media</span><h2>Room call</h2></div><button className="icon-button" onClick={onClose} aria-label="Minimize call"><Icon name="x" /></button></header>
      {!localStream && remoteStreams.size === 0 ? (
        <div className="call-start">
          <span><Icon name="video" /></span><strong>Talk while you build</strong><p>Start a direct, peer-to-peer meeting with everyone connected to this room.</p>
          <div><button className="secondary-button" onClick={() => onStart("audio")}><Icon name="mic" /> Audio call</button><button className="primary-button" onClick={() => onStart("video")}><Icon name="video" /> Video call</button></div>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {localStream && <VideoTile stream={localStream} muted name="You" />}
            {[...remoteStreams].map(([peerId, stream]) => <VideoTile key={peerId} stream={stream} name={peers.find((peer) => peer.peerId === peerId)?.name || "Peer"} />)}
          </div>
          <div className="call-controls">
            {!localStream ? (
              <>
                <button onClick={() => onStart("audio")} aria-label="Join with audio"><Icon name="mic" /></button>
                <button onClick={() => onStart("video")} aria-label="Join with video"><Icon name="video" /></button>
              </>
            ) : (
              <>
                <button className={muted ? "off" : ""} onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}><Icon name={muted ? "mic-off" : "mic"} /></button>
                {mode === "video" && <button className={cameraOff ? "off" : ""} onClick={onToggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}><Icon name={cameraOff ? "video-off" : "video"} /></button>}
                <button className="hangup" onClick={onLeave} aria-label="Leave call"><Icon name="phone-off" /></button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
