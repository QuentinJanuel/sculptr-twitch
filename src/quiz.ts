/**
 * The round chat competes in: a real fangame out of the catalogue, and how good or how
 * hard it is.
 *
 * ## Why this and not a sum
 *
 * Arithmetic was the original game's question, and a calculator answers it before a person can
 * read it -- so the race went to whoever was quickest to paste, and knowing anything about
 * fangames counted for nothing. This asks something a viewer of an I Wanna stream might actually
 * have an opinion about, and ten seconds is not long enough to go and look it up.
 *
 * ## Closest wins, not exact
 *
 * Nobody knows that *I wanna kantoku colors* is rated 7.02. Everybody can tell it is probably not a
 * 2. Scoring by distance means every guess is worth making, which is the difference between a
 * question chat plays along with and one only the fastest bot answers. Ties go to whoever said it
 * first, so being right *and* quick still beats being right and slow.
 *
 * The game is fetched per round rather than shipped as a list: the catalogue is twenty thousand
 * games and growing, its ratings move, and a list baked into a published mod would be a snapshot
 * of the day it was built.
 */

export interface QuizGame {
  id: string;
  title: string;
  creator: string | null;
  /** Out of 10. */
  rating: number;
  /** Out of 100. */
  difficulty: number;
}

export type QuizKind = "rating" | "difficulty";

export interface Round {
  kind: QuizKind;
  game: QuizGame;
  /** The number to be closest to, on `max`'s scale. */
  answer: number;
  max: number;
}

/** How long chat has to answer. Long enough to read the title and think, short enough that looking
 *  it up on Delicious Fruit is a losing strategy. */
export const ROUND_MS = 10_000;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A random rated game from the catalogue. Throws if the API is unreachable or answers oddly. */
export const fetchQuizGame = async function (apiBase: string): Promise<QuizGame> {
  const response = await fetch(`${apiBase.replace(/\/$/u, "")}/api/games/quiz`);
  if (!response.ok) throw new Error(`the catalogue answered ${response.status}`);
  const body = (await response.json()) as Partial<QuizGame>;
  if (
    typeof body.id !== "string" ||
    typeof body.title !== "string" ||
    !isNumber(body.rating) ||
    !isNumber(body.difficulty)
  ) {
    throw new Error("the catalogue sent a game with no usable numbers");
  }
  return {
    id: body.id,
    title: body.title,
    creator: typeof body.creator === "string" ? body.creator : null,
    rating: body.rating,
    difficulty: body.difficulty,
  };
};

export const startRound = function (game: QuizGame): Round {
  const kind: QuizKind = Math.random() < 0.5 ? "rating" : "difficulty";
  return kind === "rating"
    ? { kind, game, answer: game.rating, max: 10 }
    : { kind, game, answer: game.difficulty, max: 100 };
};

/** What the bot posts to open a round. */
export const roundText = function (round: Round): string {
  const by = round.game.creator ? ` by ${round.game.creator}` : "";
  const what = round.kind === "rating" ? "RATING" : "DIFFICULTY";
  return (
    `Guess the ${what} (0-${round.max}) of "${round.game.title}"${by} -- ` +
    `closest guess in ${Math.round(ROUND_MS / 1000)} seconds wins!`
  );
};

/** The answer, rounded the way a person would say it rather than to the catalogue's precision. */
export const answerText = function (round: Round): string {
  return `${Math.round(round.answer * 100) / 100}/${round.max}`;
};

/**
 * The number a chat message is offering, or null when it is not offering one.
 *
 * The whole message has to be the number, for the same reason the arithmetic round required it: a
 * viewer saying "is it 7?" should not beat the one answering "7". A stray `%` or `/10` is allowed
 * through, since people write those without thinking and plainly mean the number.
 */
export const guessIn = function (text: string, max: number): number | null {
  const trimmed = text.trim().replace(/\s*(%|\/\s*\d+)$/u, "");
  if (!/^\d{1,3}([.,]\d{1,2})?$/u.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > max) return null;
  return value;
};
