/**
 * The socket to a channel's relay, kept open for as long as the game runs.
 *
 * Reconnects on its own, backing off, because the relay drops every connection whenever it is
 * redeployed and a streamer should not have to restart their game for that. Each new connection
 * says hello again with the channel, and the relay joins it; nothing has to be replayed from here,
 * since chat is live by nature and a question nobody saw is not worth asking twice.
 *
 * `pause` closes the socket and stops it coming back until `resume`. The mod pauses when its game
 * has gone quiet, which is what stops a relay sitting in a channel -- and a question loop posting
 * into it -- long after the game it belonged to is gone.
 */

import type { ClientMessage, ServerMessage } from "./protocol";

const PING_MS = 20_000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

export interface Connection {
  send(message: ClientMessage): void;
  /** Drop the connection and open a new one, e.g. after the channel setting changed. */
  reconnect(): void;
  pause(): void;
  resume(): void;
}

export const connect = function (options: {
  /** Asked again on every (re)connect, so a change of channel takes effect on the next one. */
  url: () => string;
  hello: () => Extract<ClientMessage, { t: "hello" }>;
  onMessage: (message: ServerMessage) => void;
  onOpen: () => void;
  /** `retrying` is false when the relay refused this client for good. */
  onClose: (retrying: boolean) => void;
}): Connection {
  let socket: WebSocket | null = null;
  let retry = RETRY_MIN_MS;
  let stopped = false;
  let paused = false;

  const open = () => {
    // A retry scheduled before a pause must not reopen what the pause closed.
    if (paused || stopped || socket) return;
    const ws = new WebSocket(options.url());
    socket = ws;
    ws.addEventListener("open", () => {
      retry = RETRY_MIN_MS;
      ws.send(JSON.stringify(options.hello()));
      options.onOpen();
    });
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      // Nothing the mod can do about any of these by trying again: an out-of-date mod, a channel
      // the relay will not accept, or a relay with no credentials.
      if (
        message.t === "error" &&
        (message.reason === "version" ||
          message.reason === "channel" ||
          message.reason === "unconfigured")
      ) {
        stopped = true;
      }
      options.onMessage(message);
    });
    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      socket = null;
      options.onClose(!stopped && !paused);
      if (stopped || paused) return;
      setTimeout(open, retry);
      retry = Math.min(RETRY_MAX_MS, retry * 2);
    });
  };

  const raw = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  // Keeps proxies from deciding an idle socket is dead. A channel with quiet chat sends nothing
  // for minutes at a time.
  setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
  }, PING_MS);

  open();

  return {
    send: raw,
    reconnect() {
      stopped = false;
      if (socket) socket.close();
      else open();
    },
    pause() {
      if (paused) return;
      paused = true;
      socket?.close();
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (!socket && !stopped) open();
    },
  };
};
