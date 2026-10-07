// socket.ts — the web LiveSocketService.
//
// Socket.IO connects from the browser straight to the backend host (its
// socket CORS is open; auth is the JWT in the connect payload, exactly as
// the iOS app does with "40{token}"). The token comes from
// /api/auth/socket-token and is held in memory only.
"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let tokenPromise: Promise<string | null> | null = null;

export function socketHost(): string {
  return (process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://esports-app-production.up.railway.app").replace(/\/$/, "");
}

async function fetchToken(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/socket-token", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.token === "string" ? j.token : null;
  } catch {
    return null;
  }
}

/** One shared socket for the app's lifetime (personal room + match rooms). */
export async function getSocket(): Promise<Socket> {
  if (socket) return socket;
  tokenPromise ??= fetchToken();
  const token = await tokenPromise;
  socket = io(socketHost(), {
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  socket.on("connect_error", () => { /* surfaced per screen via "disconnect" */ });
  return socket;
}

/** Refresh the auth token (after a session refresh) and reconnect. */
export async function resetSocket(): Promise<void> {
  tokenPromise = null;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/** join/leave helpers mirroring LiveSocketService's room protocol. */
export const rooms = {
  joinMatch: (s: Socket, matchId: string) => { s.emit("join_match", matchId); s.emit("join_chat", matchId); },
  leaveMatch: (s: Socket, matchId: string) => { s.emit("leave_match", matchId); s.emit("leave_chat", matchId); },
  joinPoll: (s: Socket, pollId: string) => s.emit("join_poll", pollId),
  leavePoll: (s: Socket, pollId: string) => s.emit("leave_poll", pollId),
};
