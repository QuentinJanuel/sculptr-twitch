/**
 * What crosses the socket between the Twitch mod and a channel's relay. JSON text frames, one
 * message each.
 *
 * A copy of the relay's own `protocol.ts`, which is the
 * contract: the two are kept identical by hand, the way the online mod and its relay do. `VERSION` is
 * what lets the relay tell an outdated copy of this mod so, rather than both sides quietly
 * misreading each other.
 *
 * The relay is deliberately dumb: it holds the bot's credentials, keeps one IRC connection per
 * channel, and passes messages both ways. Everything the feature actually *is* -- when to ask a
 * question, what counts as an answer, who the follower belongs to -- lives in the mod, which is the
 * only side that knows whether a game is even running.
 */

export const VERSION = 1;

/** A Twitch chat message, flattened to what the mod uses. */
export interface Chat {
  /** The sender's login (lowercase, stable). What the mod matches answers against. */
  login: string;
  /** Their display name -- same letters as the login for most people, but not all. Shown. */
  name: string;
  /** Their chat colour as `#RRGGBB`, or null when they never picked one. */
  color: string | null;
  text: string;
}

export type ClientMessage =
  /** First message on a socket. `channel` is the Twitch login of the channel to watch. */
  | { t: "hello"; v: number; channel: string }
  /** Post this in the channel's chat, as the bot. Throttled by the relay (see `channel.ts`). */
  | { t: "say"; text: string };

export type ServerMessage =
  /** The relay is in the channel and chat is on its way. */
  | { t: "ready"; channel: string }
  | ({ t: "chat" } & Chat)
  /**
   * Sent right before the relay closes the socket, so the mod can say why.
   * `version`: the mod is out of date. `channel`: the name is not a usable Twitch login.
   * `unconfigured`: the relay has no bot credentials. `full`: too many clients on one channel.
   * `flood`: this client sent too much.
   */
  | { t: "error"; reason: "version" | "channel" | "unconfigured" | "full" | "flood" };
