export type RoomRecord = {
  roomId: string;
  name: string;
  language: string;
  locked: boolean;
  salt?: string;
  payload: string;
  iv?: string;
  modifiedAt: number;
};

export type SharedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  owner: string;
  addedAt: number;
};

export type Presence = {
  peerId: string;
  name: string;
  color: string;
  lastSeen: number;
  local?: boolean;
};

export type Transfer = {
  id: string;
  fileId: string;
  name: string;
  direction: "send" | "receive";
  transferred: number;
  total: number;
  status: "running" | "done" | "failed";
  error?: string;
};
