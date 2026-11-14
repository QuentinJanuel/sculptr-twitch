/**
 * A chatter's colour, as GameMaker counts colours.
 *
 * GameMaker packs a colour as `red + green * 256 + blue * 65536` -- blue in the high byte, the
 * reverse of the `#RRGGBB` Twitch sends. Getting that backwards is invisible in grey and glaring
 * in anything else, which is why it lives here rather than inline in a template string.
 *
 * Twitch leaves the colour tag empty for anyone who never picked one, which is most viewers. Rather
 * than making them all the same, they get one of Twitch's own default palette, chosen from their
 * login -- so a given viewer is always the same colour, and two in a row are rarely the same one.
 */

/** Twitch's default chat colours, which is what an unset colour looks like on the stream itself. */
const DEFAULTS = [
  "#FF0000",
  "#0000FF",
  "#008000",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
] as const;

/** GameMaker's BGR integer for a `#RRGGBB` string. */
const gmColor = function (hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return r + g * 256 + b * 65536;
};

/**
 * The colour to draw a chatter in: their own when they have one, otherwise a stable pick from
 * Twitch's defaults.
 */
export const colorFor = function (color: string | null, login: string): number {
  if (color !== null) return gmColor(color);
  let hash = 0;
  for (let at = 0; at < login.length; at += 1) {
    hash = (hash * 31 + login.charCodeAt(at)) >>> 0;
  }
  return gmColor(DEFAULTS[hash % DEFAULTS.length]!);
};
