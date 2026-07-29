"use client";

import {
  io,
  type Socket,
} from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketSubscribeAck,
  SocketSubscribePayload,
  SocketUnsubscribeAck,
} from "@/lib/socket/events";

let socket:
  | Socket<ServerToClientEvents, ClientToServerEvents>
  | null = null;

export function getSocketClient() {
  if (!socket) {
    socket = io({
      autoConnect: false,
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}

export function ensureSocketClient() {
  const nextSocket = getSocketClient();

  if (!nextSocket.active) {
    nextSocket.connect();
  }

  return nextSocket;
}

export function subscribeToSessionSocket(
  payload: SocketSubscribePayload,
) {
  const nextSocket = ensureSocketClient();

  return new Promise<SocketSubscribeAck>((resolve) => {
    nextSocket.emit("session:subscribe", payload, resolve);
  });
}

export function unsubscribeFromSessionSocket(sessionId: string) {
  const nextSocket = getSocketClient();

  return new Promise<SocketUnsubscribeAck>((resolve) => {
    nextSocket.emit("session:unsubscribe", { sessionId }, resolve);
  });
}
