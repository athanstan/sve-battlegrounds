import { JoinError, type RejectionCode } from '@sve/protocol';

/** What to tell the player when the server turns an answer down. Exhaustive over the protocol. */
const REJECTIONS: Readonly<Record<RejectionCode, string>> = {
  gameOver: 'The match is over.',
  noPromptOpen: 'Nothing is waiting on an answer right now.',
  notYourPrompt: 'It is not your turn to answer.',
  stalePrompt: 'That question has already been answered.',
  invalidAnswer: 'That answer is not allowed.',
  notSeated: 'Only the players can do that.',
  noMatch: 'The match has not started yet.',
  malformed: 'That could not be understood.',
};

export const describeRejection = (code: RejectionCode): string => REJECTIONS[code];

/** Why a join or create was refused, from the code the server threw. */
export function describeJoinError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? Number(error.code) : NaN;
  switch (code) {
    case JoinError.badOptions:
      return 'That request was not valid.';
    case JoinError.alreadySeated:
      return 'You already have a seat at this table.';
    case JoinError.deckNotFound:
      return 'That deck could not be found on shadowshowdown.com.';
    case JoinError.seatTaken:
      return 'Both seats at this table are taken.';
    case JoinError.deckIllegal:
      return 'That deck is not legal to play.';
    case JoinError.unavailable:
      return 'shadowshowdown.com is not answering, so decks cannot be loaded. Try again shortly.';
    default:
      return error instanceof Error && error.message ? error.message : 'Could not join the match.';
  }
}
