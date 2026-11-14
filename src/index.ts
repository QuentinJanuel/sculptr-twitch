import { createMod, type Mod, pngSize, type Ref, type Sprite } from "@sculptr/sdk";
import { findPlayerObjects } from "@sculptr/detect";
import { initText } from "@sculptr/text";
import { colorFor } from "./color";
import { text, type Text } from "./i18n";
import { connect, type Connection } from "./net";
import type { ServerMessage } from "./protocol";
import { VERSION } from "./protocol";
import {
  answerText,
  fetchQuizGame,
  guessIn,
  type QuizGame,
  type Round,
  ROUND_MS,
  startRound,
} from "./quiz";
/**
 * The companion's frames: every `companion-<n>.png` in `src/sprites`, in numeric order.
 *
 * A glob rather than a list of imports so the artwork is a drop-in: replace the files, and a
 * sprite with a different number of frames works without touching this file. Baked in at build
 * time as data URIs, like every other sprite a mod ships.
 */
const frames: string[] = Object.entries(
  import.meta.glob<string>("./sprites/**/companion-*.png", {
    eager: true,
    query: "?inline",
    import: "default",
  }),
)
  // "companion-10" must not sort before "companion-2", which a plain string sort would do.
  .sort(([a], [b]) => frameNumber(a) - frameNumber(b))
  .map(([, dataUri]) => dataUri);

function frameNumber(path: string): number {
  const match = /companion-(\d+)\.png$/u.exec(path);
  return match ? Number(match[1]) : 0;
}

/**
 * The middle of the companion's frames, which is where the sprite should hang from.
 *
 * Read from the first frame rather than written down, so swapping the artwork for something of a
 * different size needs no other change. Falls back to the middle of a 24x24 if the frames cannot
 * be measured, which is only reachable if the build produced something that is not a PNG.
 */
function frameOrigin(): { x: number; y: number } {
  const first = frames[0];
  if (first === undefined) return { x: 12, y: 12 };
  try {
    const base64 = first.slice(first.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
    const { width, height } = pngSize(bytes);
    return { x: Math.round(width / 2), y: Math.round(height / 2) };
  } catch (error) {
    console.warn("[twitch] could not measure the companion's frames:", error);
    return { x: 12, y: 12 };
  }
}

/**
 * The streamer's chat, in the game: a viewer wins a place beside the player and can talk from
 * there.
 *
 * ## What happens
 *
 * Every few minutes the mod posts a sum in the streamer's Twitch chat. The first viewer to answer
 * it correctly wins the companion -- a spark that trails the player for the rest of the stream,
 * carrying that viewer's name and their own chat colour. They keep it until somebody else wins the
 * next question, and while they have it, `!text something` puts what they said in the game.
 *
 * It is the mechanic from "I wanna play with the viewers", which did this with a bot whose IRC
 * password was compiled into the game, for one game. Here it is a mod, so it works in any game
 * the host can run, and the credentials live on the relay instead. A mod is public code; a bot token cannot be in one.
 *
 * ## Where the channel comes from
 *
 * The player, through this mod's own settings panel (the `channel` setting). Not from the game, not from
 * this browser: a mod's JavaScript runs in the Electron main process on a native install, where
 * there is no `localStorage` to read, and the channel is a fact about the person rather than about
 * the machine. With no channel set -- which is almost everybody -- the mod declares nothing and
 * connects to nothing.
 *
 * ## What the game is asked to do
 *
 * Draw one sprite, two bits of text, and follow the player. Everything else -- when to ask, what
 * counts as an answer, who holds the companion -- is decided in JavaScript, because it is the only
 * side that can talk to the relay and the only side that survives a `game_restart()`.
 */

/** How long after the game starts the first question goes out. Long enough that a stream which is
 *  still alt-tabbed into the launcher does not miss it. */
const FIRST_QUESTION_MS = 20_000;
/** How often a new question replaces the last. Slow: a viewer who wins should get to enjoy it, and
 *  the bot should be a guest in chat rather than a fixture. */
const QUESTION_EVERY_MS = 5 * 60_000;
/** How long the channel field has to be quiet before the relay acts on it. Long enough to type the
 *  rest of a name, short enough that it feels like it took effect when you stopped. */
const CHANNEL_SETTLE_MS = 800;
/** Steps the companion's speech bubble stays up. */
const TEXT_STEPS = 250;
/** The game says it is alive at least this often, even standing still. */
const HEARTBEAT_STEPS = 25;
/**
 * Silence from the game this long means it is gone -- quit, crashed, or a browser tab put in the
 * background -- and the mod leaves the channel until it speaks again. Without this, a mod that
 * outlived its game would keep posting questions into a chat whose stream had ended.
 */
const GAME_SILENCE_MS = 10_000;

/**
 * Sprites a game may offer for the companion, in the order they are tried.
 *
 * A game that has one of these gets its own artwork, which is always going to beat a generic spark
 * drawn by a mod that has never seen it -- and means this mod ships no character of its own beyond
 * the fallback. "I wanna play with the viewers", where the mechanic comes from, has `sprLuma`; the
 * other two are there so a game built later can opt in by naming a sprite.
 *
 * Looked up by name at runtime rather than at build time, because a mod is handed the game's code
 * but not its sprite list.
 */
const GAME_SPRITES = ["sprLuma", "sprCompanion", "sprFollower"] as const;
/** How far up the sprite indices to look for one. Comfortably past any I Wanna game's sprite
 *  count, and it runs once. */
const SPRITE_SCAN = 4096;

/** Where the companion sits relative to the player, and how lazily it gets there. The numbers the
 *  original game used, because that floaty trailing lag is what the feature looks like. */
const OFFSET_X = -40;
const OFFSET_Y = -50;
const EASE = 0.02;
/** The slow vertical bob: degrees per step, and how far it carries. */
const BOB_SPEED = 3;
const BOB_REACH = 10;

/** GameMaker 8 and Studio 1 draw `#` as a line break; nobody's name or message means that. */
const printable = (text: string): string => text.replaceAll(/[\p{Cc}#]/gu, " ").trim();

const serverUrl = function (channel: string): string {
  let base = import.meta.env.VITE_TWITCH_SERVER;
  try {
    base = localStorage.getItem("fruitPie.twitch.server") || base;
  } catch {
    // No storage here (the main process on a native install); the built-in address it is.
  }
  return `${base.replace(/\/$/u, "")}/channel/${encodeURIComponent(channel)}`;
};

/**
 * The catalogue API, which a round asks for a game to guess at.
 *
 * Read once: unlike the relay address, nothing reconnects, so there is no later moment at which a
 * changed value would take effect anyway.
 */
const API_BASE = (() => {
  try {
    return localStorage.getItem("fruitPie.twitch.api") || import.meta.env.VITE_FRUIT_PIE_API;
  } catch {
    return import.meta.env.VITE_FRUIT_PIE_API;
  }
})();

/**
 * A Twitch login, as the relay needs it. Checked here rather than at the relay so a typo is caught
 * while someone is looking at the field, not silently as a channel that never has any chat in it.
 */
const CHANNEL_RE = /^[a-z0-9_]{1,25}$/u;

/**
 * What someone is most likely to paste, reduced to the login it means: the channel URL, an @name,
 * stray case. This used to live in the host's API, which had to know what a Twitch channel was
 * because the setting was a column on the account; the setting is this mod's own now, so the
 * knowledge comes with it. Empty for anything that is not a channel.
 */
export const channelIn = function (raw: string): string {
  const login = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//u, "")
    .replace(/^@/u, "")
    .replace(/\/.*$/u, "");
  return CHANNEL_RE.test(login) ? login : "";
};

/**
 * What the badge at the top is saying.
 *
 * A state rather than the sentence itself, because the sentence depends on the player's language and
 * this is set from wherever the connection happens to be -- a socket callback has no business
 * knowing which language the panel is drawn in. `statusText` turns one of these into words.
 */
export type TwitchStatus =
  | { k: "unsupported" }
  | { k: "noChannel" }
  | { k: "joining"; channel: string }
  | { k: "listening"; channel: string }
  | { k: "reconnecting" }
  | { k: "offline" }
  | { k: "forGame" };

/** What the progress bar is counting down to. See `TwitchStatus` for why it is not a sentence. */
export type TwitchWaiting =
  | { k: "idle" }
  | { k: "forGame" }
  | { k: "closes"; seconds: number }
  | { k: "next"; minutes: number; seconds: number };

const statusText = (t: Text, status: TwitchStatus): string => {
  switch (status.k) {
    case "unsupported":
      return t.status.unsupported;
    case "noChannel":
      return t.status.noChannel;
    case "joining":
      return t.status.joining(status.channel);
    case "listening":
      return t.status.listening(status.channel);
    case "reconnecting":
      return t.status.reconnecting;
    case "offline":
      return t.status.offline;
    case "forGame":
      return t.status.forGame;
  }
};

const waitingText = (t: Text, waiting: TwitchWaiting): string => {
  switch (waiting.k) {
    case "idle":
      return t.waiting.idle;
    case "forGame":
      return t.waiting.forGame;
    case "closes":
      return t.waiting.closes(waiting.seconds);
    case "next":
      return t.waiting.next(waiting.minutes, waiting.seconds);
  }
};

/**
 * The panel's state, handed to `install` rather than built by it.
 *
 * Declared before the game is inspected (see the default export) so the channel can be typed -- and
 * the panel can say why nothing is happening -- even in a game this mod cannot follow a player in.
 */
interface TwitchPanel {
  /** The channel to listen to, as typed. `channelIn` is what turns it into a login. */
  channel: Ref<string>;
  status: Ref<TwitchStatus>;
  /** Who holds the companion, for the button that takes it off them. Empty when nobody does. */
  holding: Ref<string>;
  /** 0 to 1, and what it is counting down to. See `progress` in `install`. */
  waiting: Ref<number>;
  waitingFor: Ref<TwitchWaiting>;
  /** What the *player* reads, and what the *channel* reads: the same unless `botTranslate` is off. */
  t: () => Text;
  bot: () => Text;
  /** Told when the player edits the channel. */
  onChannelChanged: (handler: () => void) => void;
  /** The two buttons. `install` owns the round loop and the chat connection, so it fills these in. */
  onAskNow: (handler: () => void) => void;
  onKick: (handler: () => void) => void;
}

const install = function (mod: Mod, players: string[], panel: TwitchPanel): void {
  /**
   * The viewer's name and what they said, drawn by the app instead of by the game.
   *
   * Twitch display names are whatever their owner picked -- Japanese, Cyrillic, an accent -- and
   * `draw_text` draws with the *game's* font, which in a fangame holds the characters its author
   * needed and little else. A name it cannot draw came out blank, which looked like the mod
   * losing the viewer rather than the font missing a glyph.
   */
  const { drawText, createText, textWidth, textHeight } = initText(mod);
  /** Over the companion, in the viewer's own chat colour, which the drawing state carries. */
  const NAME = { size: 16, align: "center", valign: "middle" } as const;
  /** In the speech bubble under it. */
  const SAID = { size: 16, align: "center", wrap: 240 } as const;

  // Centred on whatever the frames actually are, rather than a number that happens to suit the
  // ones this mod ships: the artwork is meant to be swapped, and a replacement of a different
  // size would otherwise hang off to one side of where the companion is supposed to be.
  const spark: Sprite = mod.resource.sprite.create("spark", { origin: frameOrigin() });
  void spark.load(frames);

  // -- GML ---------------------------------------------------------------------------------------

  mod.resource.script.create({
    name: "field",
    args: ["text", "n"],
    body: ({ a }) => `var tw_s, tw_n, tw_at;
tw_s = ${a.text};
tw_n = ${a.n};
while (tw_n > 1) {
  tw_at = string_pos(" ", tw_s);
  if (tw_at == 0) return "";
  tw_s = string_delete(tw_s, 1, tw_at);
  tw_n -= 1;
}
tw_at = string_pos(" ", tw_s);
if (tw_at > 0) tw_s = string_copy(tw_s, 1, tw_at - 1);
return tw_s;`,
  });

  /** Field n and everything after it: the free text at the end of a message. */
  mod.resource.script.create({
    name: "rest",
    args: ["text", "n"],
    body: ({ a }) => `var tw_s, tw_n, tw_at;
tw_s = ${a.text};
tw_n = ${a.n};
while (tw_n > 1) {
  tw_at = string_pos(" ", tw_s);
  if (tw_at == 0) return "";
  tw_s = string_delete(tw_s, 1, tw_at);
  tw_n -= 1;
}
return tw_s;`,
  });

  // The newest instance: a respawn that destroys the player and makes a new one leaves both alive
  // for the rest of the step, and `with` skips only the destroyed one.
  mod.resource.script.create({
    name: "me",
    body: () => `global.twitch_found = noone;
${players
  .map(
    (object) => `with (${object}) {
  if (global.twitch_found == noone || id > global.twitch_found) global.twitch_found = id;
}`,
  )
  .join("\n")}
return global.twitch_found;`,
  });

  /**
   * The index of a sprite the game already has, by name, or -1.
   *
   * A scan rather than `asset_get_index`, which GameMaker 8 does not have -- and `sprite_get_name`
   * is the same call on both engines. Run once, from Create, never per frame.
   */
  mod.resource.script.create({
    name: "findspr",
    args: ["name"],
    body: ({ a }) => `var tw_i;
for (tw_i = 0; tw_i < ${SPRITE_SCAN}; tw_i += 1) {
  if (sprite_exists(tw_i)) {
    if (sprite_get_name(tw_i) == ${a.name}) return tw_i;
  }
}
return -1;`,
  });

  mod.resource.script.create({
    name: "label",
    args: ["x", "y", "text", "color"],
    // One picture, blitted five times: the four black offsets are an outline, so a name in a dark
    // chat colour still reads over dark scenery. The centring is part of the picture now, so
    // nothing here touches halign.
    body: ({ a }) => `var tw_c;
tw_c = draw_get_color();
draw_set_color(c_black);
${drawText(`${a.x} + 1`, a.y, a.text)}
${drawText(`${a.x} - 1`, a.y, a.text)}
${drawText(a.x, `${a.y} + 1`, a.text)}
${drawText(a.x, `${a.y} - 1`, a.text)}
draw_set_color(${a.color});
${drawText(a.x, a.y, a.text)}
draw_set_color(tw_c);`,
  });

  /** A speech bubble whose top edge is centred on (x, y). */
  mod.resource.script.create({
    name: "bubble",
    args: ["x", "y", "text", "alpha"],
    body: ({ a }) => `var tw_c, tw_a, tw_w, tw_h, tw_l;
tw_w = ${textWidth(a.text)};
// The box is the picture's size, so there is no box until there is a picture -- a tenth of a
// second after a line is said, and never at all for one that could not be drawn.
if (tw_w <= 0) exit;
tw_h = ${textHeight(a.text)};
tw_c = draw_get_color();
tw_a = draw_get_alpha();
tw_w += 10;
tw_h += 6;
tw_l = ${a.x} - tw_w / 2;
draw_set_alpha(${a.alpha});
draw_set_color(c_white);
draw_rectangle(tw_l, ${a.y}, tw_l + tw_w, ${a.y} + tw_h, false);
draw_set_color(c_black);
draw_rectangle(tw_l, ${a.y}, tw_l + tw_w, ${a.y} + tw_h, true);
${drawText(a.x, `${a.y} + 3`, a.text)}
draw_set_color(tw_c);
draw_set_alpha(tw_a);`,
  });

  mod.resource.object.create({
    name: "twitch",
    persistent: true,
    // In front of the scenery, so a name or a bubble is never hidden behind it.
    depth: -100000,
    vars: [
      "on",
      "col",
      "nm",
      "txt",
      "txtT",
      "cx",
      "cy",
      "yy",
      "ang",
      "placed",
      "tick",
      "who",
      "spr",
      "gspr",
      "dist",
      "lastRoom",
    ],
    events: {
      create: ({ v, send, call }) => `
        ${v.on} = 0;
        ${v.col} = 16777215;
        ${v.nm} = "";
        ${v.txt} = "";
        ${v.txtT} = 0;
        ${v.cx} = 0;
        ${v.cy} = 0;
        ${v.yy} = 0;
        ${v.ang} = 120;
        ${v.placed} = 0;
        ${v.lastRoom} = -1;
        ${v.tick} = 0;
        // Once, here: a game that brought its own companion sprite gets to use it.
        ${v.gspr} = -1;
${GAME_SPRITES.map(
  (name) => `        if (${v.gspr} < 0) ${v.gspr} = ${call("findspr", JSON.stringify(name))};`,
).join("\n")}
        ${send("ready")}
      `,
      step: ({ v, call, send }) => `
        // A new room is a new place entirely, so the companion is put back beside the player
        // rather than gliding the width of it. Death is not that -- see below.
        if (${v.lastRoom} != room) {
          ${v.lastRoom} = room;
          ${v.placed} = 0;
        }
        ${v.who} = ${call("me")};
        if (${v.who} != noone) {
          if (!${v.placed}) {
            ${v.cx} = ${v.who}.x + ${OFFSET_X};
            ${v.cy} = ${v.who}.y + ${OFFSET_Y};
            ${v.placed} = 1;
          }
          // Eased rather than fixed: the lag behind the player is the whole look of it.
          ${v.dist} = abs((${v.who}.x + ${OFFSET_X}) - ${v.cx});
          ${v.cx} += sign((${v.who}.x + ${OFFSET_X}) - ${v.cx}) * ${v.dist} * ${EASE};
          ${v.dist} = abs((${v.who}.y + ${OFFSET_Y}) - ${v.cy});
          ${v.cy} += sign((${v.who}.y + ${OFFSET_Y}) - ${v.cy}) * ${v.dist} * ${EASE};
        }
        // Nothing to follow (a death, a menu, a cutscene): it stays exactly where it was, still
        // bobbing, and eases back over once the player exists again. The viewer who won it does
        // not blink out of the game every time the runner hits a spike.
        ${v.ang} += ${BOB_SPEED};
        ${v.yy} = ${v.cy} - (${BOB_REACH} * sin(degtorad(${v.ang})));
        if (${v.txtT} > 0) ${v.txtT} -= 1;

        // The JavaScript side takes silence to mean the game is gone (see GAME_SILENCE_MS).
        ${v.tick} += 1;
        if (${v.tick} mod ${HEARTBEAT_STEPS} == 0) ${send("tick")}
      `,
      draw: ({ v, call }) => `
        // The game's own companion sprite when it has one, otherwise the spark this mod brings.
        ${v.spr} = ${v.gspr};
        if (${v.spr} < 0) ${v.spr} = ${spark.id};
        if (${v.on} && ${v.placed} && ${v.spr} >= 0) {
          draw_sprite_ext(
            ${v.spr},
            floor(current_time / 120) mod sprite_get_number(${v.spr}),
            ${v.cx}, ${v.yy}, 1, 1, 0, ${v.col}, 1
          );
          ${call("label", v.cx, `${v.cy} - 26`, v.nm, v.col)};
          if (${v.txtT} > 0) {
            ${call("bubble", v.cx, `${v.cy} + 18`, v.txt, `min(1, ${v.txtT} / 25)`)};
          }
        }
      `,
    },
    receive: {
      // "<color> <name>": a new viewer holds the companion.
      win: ({ v, payload, call }) => `
        ${v.col} = real(${call("field", payload, "1")});
        ${v.nm} = ${call("rest", payload, "2")};
        ${v.on} = 1;
        ${v.txt} = "";
        ${v.txtT} = 0;
      `,
      say: ({ v, payload }) => `
        ${v.txt} = ${payload};
        ${v.txtT} = ${TEXT_STEPS};
      `,
      off: ({ v }) => `
        ${v.on} = 0;
        ${v.txtT} = 0;
      `,
    },
  });

  // -- JavaScript --------------------------------------------------------------------------------

  let connection: Connection | null = null;
  let ready = false;

  /** The viewer holding the companion, or null when nobody has won one yet. */
  let holder: { login: string; name: string; color: number } | null = null;
  /** The round on the table, or null between rounds. */
  let round: Round | null = null;
  /** One guess per viewer -- their first, so nobody wins by spraying numbers. Insertion order is
   *  arrival order, which is what breaks ties. */
  let guesses = new Map<string, { name: string; color: number; guess: number }>();
  let asking: ReturnType<typeof setTimeout> | null = null;
  let closing: ReturnType<typeof setTimeout> | null = null;

  const say = (text: string) => connection?.send({ t: "say", text });
  /** What the channel reads, which is English unless the player said otherwise. */
  const b = () => panel.bot();
  /** The question, as the bot asks it. */
  const asked = (round: Round, words: Text) =>
    words.bot.ask(
      round.kind === "rating" ? words.bot.rating : words.bot.difficulty,
      round.max,
      round.game.title,
      round.game.creator,
      Math.round(ROUND_MS / 1000),
    );

  const ask = async () => {
    let game: QuizGame;
    try {
      game = await fetchQuizGame(API_BASE);
    } catch (error) {
      // The catalogue being briefly unreachable is not worth bothering chat about; the next round
      // comes around on its own.
      console.warn("[twitch] could not fetch a game for this round:", error);
      return;
    }
    round = startRound(game);
    guesses = new Map();
    say(asked(round, b()));
    // The log stays English whatever the channel reads: it is for whoever is reading the console.
    console.log(`[twitch] round: ${asked(round, text("en"))} (answer ${answerText(round)})`);
    closesAt = Date.now() + ROUND_MS;
    closing = setTimeout(close, ROUND_MS);
  };

  /** The round is over: closest guess wins, earliest of those on a tie. */
  const close = () => {
    closing = null;
    closesAt = 0;
    const finished = round;
    round = null;
    if (!finished) return;

    let best: { login: string; name: string; color: number; guess: number } | null = null;
    let bestOff = Infinity;
    for (const [login, entry] of guesses) {
      const off = Math.abs(entry.guess - finished.answer);
      // Strictly closer: the first viewer at a given distance keeps it, so ties go to whoever
      // spoke first (a Map iterates in insertion order).
      if (off < bestOff) {
        bestOff = off;
        best = { login, ...entry };
      }
    }

    if (!best) {
      say(b().bot.nobody(finished.game.title, answerText(finished)));
      console.log(`[twitch] nobody guessed; it was ${answerText(finished)}`);
      return;
    }
    win(best.login, best.name, best.color, best.guess, answerText(finished));
  };

  /**
   * When the next question is due, and when the open round closes. Kept as timestamps beside the
   * timers rather than inferred from them, because the panel counts down to them once a second and
   * a `setTimeout` cannot be asked how much of itself is left.
   */
  let asksAt = 0;
  let closesAt = 0;

  /** The round loop, running only while the relay is connected and the game is alive. */
  const startAsking = (delay: number) => {
    if (asking !== null) return;
    const tick = () => {
      void ask();
      asksAt = Date.now() + QUESTION_EVERY_MS;
      asking = setTimeout(tick, QUESTION_EVERY_MS);
    };
    asksAt = Date.now() + delay;
    asking = setTimeout(tick, delay);
  };

  const stopAsking = () => {
    if (asking !== null) {
      clearTimeout(asking);
      asking = null;
    }
    if (closing !== null) {
      clearTimeout(closing);
      closing = null;
    }
    asksAt = 0;
    closesAt = 0;
    round = null;
    guesses = new Map();
  };

  /**
   * Ask now, and start the wait again from here.
   *
   * The timer is restarted rather than left alone, so the button means "ask now" and not "ask now
   * and again in a moment" -- a viewer who has just been given ten seconds should not find the
   * round replaced halfway through it.
   */
  const askNow = () => {
    if (!ready || round) return;
    if (asking !== null) {
      clearTimeout(asking);
      asking = null;
    }
    startAsking(0);
  };

  /** Take the companion off whoever has it. */
  const kick = () => {
    const who = holder;
    if (!who) return;
    holder = null;
    mod.send("off");
    panel.holding.value = "";
    say(b().bot.kicked(who.name));
    console.log(`[twitch] ${who.name} was sent away`);
  };

  panel.onAskNow(askNow);
  panel.onKick(kick);

  const win = (login: string, name: string, color: number, guess: number, answer: string) => {
    holder = { login, name, color };
    panel.holding.value = name;
    mod.send("win", `${color} ${createText(printable(name), NAME)}`);
    say(b().bot.won(name, guess, answer));
    console.log(`[twitch] ${name} won the companion with ${guess}, and it was ${answer}`);
  };

  const onMessage = (message: ServerMessage) => {
    switch (message.t) {
      case "ready":
        ready = true;
        panel.status.value = { k: "listening", channel: message.channel };
        console.log(`[twitch] listening to #${message.channel}`);
        // The first question waits for the game as well as the socket: `heard` starts the loop.
        return;
      case "chat": {
        // Anyone in chat, the streamer included: they are playing too, and being barred from their
        // own game to no benefit was worse than the case the bar was meant to prevent.
        if (round && !guesses.has(message.login)) {
          const guess = guessIn(message.text, round.max);
          // Only their first guess counts, so nobody wins a round by listing every number.
          if (guess !== null) {
            guesses.set(message.login, {
              name: message.name,
              color: colorFor(message.color, message.login),
              guess,
            });
            return;
          }
        }
        if (holder && message.login === holder.login) {
          const said = /^!text\s+([\s\S]+)$/u.exec(message.text);
          if (said) mod.send("say", createText(printable(said[1]!), SAID));
        }
        return;
      }
      case "error":
        console.warn(`[twitch] the relay refused this connection: ${message.reason}`);
        if (message.reason === "unconfigured") {
          console.warn("[twitch] the relay has no bot credentials yet");
        }
        return;
    }
  };

  // -- Wiring ------------------------------------------------------------------------------------

  // Connected on the game's first heartbeat rather than at start: a Studio game in the emulator can
  // be unpacking its assets for a while after it says it is listening, and a question posted into
  // chat before the stream can see the game is a question wasted.
  let lastContact = 0;
  let quiet = false;

  /**
   * The channel the relay is on, or "" for none.
   *
   * **The settled value, never what the field holds this instant.** The panel's input reports every
   * keystroke, and `heard` below runs on every frame the game sends -- so joining whatever the box
   * says would have the relay join #k on its way to #kaki, and then sit in it. `applyChannel` is the
   * only writer, once the typing has stopped.
   *
   * Read live by the closures below rather than captured, which is the other half of the same bug:
   * `reconnect()` asks `url()` again, so a channel captured when the connection was first opened
   * would be re-dialled for the life of the game however often it was edited afterwards.
   */
  let joined = "";

  const join = () => {
    if (!joined || connection) return;
    connection = connect({
      url: () => serverUrl(joined),
      hello: () => ({ t: "hello" as const, v: VERSION, channel: joined }),
      onMessage,
      onOpen: () => {
        panel.status.value = { k: "joining", channel: joined };
        console.log(`[twitch] connected, joining #${joined}`);
      },
      onClose: (retrying) => {
        ready = false;
        stopAsking();
        panel.status.value = retrying ? { k: "reconnecting" } : { k: "offline" };
        if (retrying) console.log("[twitch] connection lost, retrying...");
      },
    });
  };

  const heard = () => {
    lastContact = Date.now();
    if (quiet) {
      quiet = false;
      console.log("[twitch] the game is back");
    }
    if (connection) connection.resume();
    else join();
    if (ready) startAsking(FIRST_QUESTION_MS);
  };

  /**
   * The wait, once a second, as a fraction and a sentence.
   *
   * Two things are being waited for and the bar shows whichever is running: the ten seconds chat
   * has to answer an open round, and the five minutes until the next one. A second is as often as
   * this needs to move -- it is a countdown a person reads, not an animation -- and each tick is one
   * `bind` patch whatever the panel is drawing.
   */
  setInterval(() => {
    const now = Date.now();
    if (closesAt > now) {
      const left = closesAt - now;
      panel.waiting.value = 1 - left / ROUND_MS;
      panel.waitingFor.value = { k: "closes", seconds: Math.ceil(left / 1000) };
      return;
    }
    if (asksAt > now) {
      const left = asksAt - now;
      const minutes = Math.floor(left / 60_000);
      const seconds = Math.ceil((left % 60_000) / 1000);
      panel.waiting.value = 1 - left / QUESTION_EVERY_MS;
      panel.waitingFor.value = { k: "next", minutes, seconds };
      return;
    }
    panel.waiting.value = 0;
    panel.waitingFor.value = ready ? { k: "forGame" } : { k: "idle" };
  }, 1000);

  setInterval(() => {
    if (quiet || !connection || Date.now() - lastContact <= GAME_SILENCE_MS) return;
    quiet = true;
    console.log("[twitch] the game has gone quiet; leaving the channel until it is back");
    stopAsking();
    connection.pause();
  }, 2000);

  mod.on("tick", heard);

  // The game (re)started: a `game_restart()` wiped this mod's object along with everything else, so
  // whoever holds the companion is told to it again. The sprite comes back on its own (the SDK
  // keeps it), so only the bookkeeping is resent.
  mod.on("ready", () => {
    if (holder) mod.send("win", `${holder.color} ${createText(printable(holder.name), NAME)}`);
  });

  /**
   * The channel was edited in the panel.
   *
   * A different channel is a different chat, so the companion goes: it belonged to the old
   * channel's viewers, and leaving it in the game would have a stranger's name following the runner.
   */
  let editing: ReturnType<typeof setTimeout> | null = null;
  panel.onChannelChanged(() => {
    // Settled first. The field reports every keystroke, and every prefix of a channel name is
    // itself a valid channel name -- so acting on each one would have the relay join #k, #ka, #kak
    // on the way to #kaki, four connections to three channels nobody is watching.
    if (editing !== null) clearTimeout(editing);
    editing = setTimeout(applyChannel, CHANNEL_SETTLE_MS);
  });

  const applyChannel = () => {
    editing = null;
    const next = channelIn(panel.channel.value);
    if (next === joined) return;
    joined = next;
    holder = null;
    panel.holding.value = "";
    stopAsking();
    mod.send("off");
    if (!next) {
      panel.status.value = { k: "noChannel" };
      connection?.pause();
      return;
    }
    if (connection) connection.reconnect();
    else join();
  };

  // A channel restored from this mod's own settings is already settled -- nobody is typing it -- so
  // it is committed here rather than waiting for an edit that may never come. `heard` opens the
  // connection on the game's first frame, as it always did.
  joined = channelIn(panel.channel.value);
  if (joined) panel.status.value = { k: "forGame" };
};

export default createMod((mod) => {
  // Read before the panel is declared, so every control is right the first time it is drawn.
  //
  // Declared for every player, not only streamers: what a mod declares is baked into the game at
  // build time, and on a native install that happens once and is then reused by whoever plays it.
  // Deciding here would bake the setting of whoever launched it first into the installed copy.
  // Who to follow. `@sculptr/detect` answers this for every mod that needs it, from the object
  // whose position the game's save routine stores and from objects named the way I Wanna engines
  // name one -- the two sources this mod used to union for itself in its own player.ts.
  //
  // References rather than names: a candidate arrives as its id (`(7)`), which is what `with`
  // wants. I Wanna Kill the Kamilia 3 is why that matters -- it has an object *called*
  // `move_outside_solid`, and GML would read that name as the builtin function.
  const found = findPlayerObjects(mod.content);
  const players = found.ok ? found.value.candidates : [];
  const supported = players.length > 0;

  // The channel lives here, in this mod's own settings, rather than on the host account it
  // used to be a column of. The app storing a field it had to know the meaning of was the coupling
  // the panels exist to remove -- and it could never have worked for a mod we did not write.
  const channel = mod.ui.state("", { persist: "channel" });
  const status = mod.ui.state<TwitchStatus>(supported ? { k: "noChannel" } : { k: "unsupported" });
  const holding = mod.ui.state("");
  const waiting = mod.ui.state(0);
  const waitingFor = mod.ui.state<TwitchWaiting>({ k: "idle" });

  // Which language to read the panel in. A state because the player can change it in the host while
  // the game runs: `getPlayer()` is pinned while this function runs -- which is what keeps the GML
  // this mod bakes and the JavaScript behind it in agreement -- so the live value arrives through
  // `onPlayerChange`, and the panel follows because its labels are bound to functions.
  const language = mod.ui.state(mod.getPlayer().language);
  mod.onPlayerChange((player) => {
    language.value = player.language;
  });
  const t = (): Text => text(language.value);

  /**
   * Whether the bot posts in that language too.
   *
   * A separate question from the panel's language, and off by default, because these lines are
   * read by the channel rather than by whoever set the host's: a French streamer's viewers are
   * probably French, but a French player watching an English-speaking channel is not unusual
   * either. The player is the only one who knows which, so they say.
   */
  const botTranslate = mod.ui.state(false, { persist: "botTranslate" });
  const bot = (): Text => (botTranslate.value ? t() : text("en"));

  // `install` owns the chat connection and the round loop, so the panel calls into it rather than
  // the other way round. No-ops until it runs, which is also the unsupported case: there is nothing
  // listening, and a channel typed then is simply remembered for the next game that can use it.
  let onChannel: () => void = () => {};
  let askNow: () => void = () => {};
  let kick: () => void = () => {};

  // The title is this mod's name, which is why it is the one string here left in English: the catalog
  // lists it that way whatever the page is in, and `panel` takes a plain string, so it could not
  // follow a language change in any case.
  mod.ui.panel({ title: "Twitch" }, (ui) => [
    ui.section({}, [
      ui.dynamic(() => [
        ui.badge(statusText(t(), status.value), {
          tone: !supported ? "danger" : status.value.k === "listening" ? "ok" : "muted",
        }),
      ]),
    ]),

    ui.section({ title: () => t().channel }, [
      ui.input({
        value: channel,
        placeholder: () => t().channelPlaceholder,
        disabled: !supported,
        onChange: () => onChannel(),
      }),
      ui.dynamic(() => {
        const login = channelIn(channel.value);
        if (channel.value.trim() === "") {
          return [ui.text(t().channelHint, { tone: "muted" })];
        }
        return login === ""
          ? [ui.text(t().channelBad, { tone: "danger" })]
          : [ui.text(t().channelOk(login), { tone: "muted" })];
      }),
      ui.toggle({ label: () => t().botTranslate, value: botTranslate }),
    ]),

    ui.section({ title: () => t().round }, [
      ui.progress(waiting, { label: () => waitingText(t(), waitingFor.value) }),
      ui.row([
        ui.button({
          label: () => t().askNow,
          variant: "primary",
          disabled: () => !supported || status.value.k !== "listening",
          onClick: () => askNow(),
        }),
        // Named, because "kick" alone does not say who is being sent away -- and there is usually
        // exactly one person it could mean.
        ui.dynamic(() => [
          ui.button({
            label: holding.value === "" ? t().nobodyFollowing : t().kick(holding.value),
            disabled: holding.value === "",
            onClick: () => kick(),
          }),
        ]),
      ]),
    ]),
  ]);

  if (!supported) {
    console.warn("[twitch] no player object found in this game, so there is nothing to follow");
    return;
  }
  console.log(`[twitch] following ${players.map((p) => `${p.ref} "${p.name}"`).join(", ")}`);
  install(mod, players.map((p) => p.ref), {
    t,
    bot,
    channel,
    status,
    holding,
    waiting,
    waitingFor,
    onChannelChanged: (handler) => (onChannel = handler),
    onAskNow: (handler) => (askNow = handler),
    onKick: (handler) => (kick = handler),
  });
});
