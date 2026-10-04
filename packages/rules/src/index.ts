/**
 * @sve/rules - the Shadowverse: Evolve rules engine (Comprehensive Rules Ver. 1.23.0).
 *
 * Imported by the server (to commit) and by the client (to type and fold what it receives).
 * Pure and deterministic: no I/O, no clock, no ambient randomness.
 */

// Model
export {
  CARD_CLASSES,
  KEYWORDS,
  cardKey,
  hasKeyword,
  keywordsFromText,
  type CardCatalog,
  type CardClass,
  type CardDefinition,
  type CardKind,
  type Keyword,
  type SpecialType,
} from './model/cards';
export { sizeOf, validateDeck, type DeckEntry, type DeckIssue, type DeckList } from './model/deck';
export {
  SEATS,
  asCardDefId,
  asCardId,
  assertNever,
  opponentOf,
  type CardDefId,
  type CardId,
  type CardRef,
  type Seat,
} from './model/ids';
export {
  DECK_RULES,
  MAX_PLAY_POINTS_CEILING,
  OPENING_HAND_SIZE,
  STARTING_LEADER_DEFENSE,
  STARTING_LIMITS,
} from './model/limits';

// State, events, engine
export {
  definitionOf,
  effectiveDefinition,
  fieldCard,
  isBoxed,
  refOf,
  type MatchState,
  type Outcome,
  type Phase,
  type Placement,
  type Prompt,
  type PromptKind,
  type GameOverReason,
  type ResourceName,
  type Resources,
  type SeatState,
  type StepId,
  type ZoneLimits,
  type FieldCard,
  type MainOption,
  type ShownStats,
  type Duration,
  type TimingPoint,
} from './state/state';
export type { CardScript, Ability, Instr, CardFilter } from './abilities/spec';
export { scriptKey } from './abilities/spec';
export { textHash, parseEvolveCost, parseServeCost } from './abilities/generic';
export { DEFAULT_TOKENS } from './abilities/tokens';
export {
  overflow,
  sanguine,
  combo,
  necrocharge,
  spellchain,
  earthRite,
  lesson,
  fuseCost,
  onDrive,
  onRace,
  onUnionBurst,
} from './abilities/modules';
export type { DrawCause, EngineEvent, EngineEventType, LoggedEvent } from './events/events';
export { replay, applyEvent, stateFromCreation } from './events/apply';
export type { Action, Choice, Intent, IntentType, RejectionReason } from './actions/intents';
export { reduce, type ReduceResult } from './engine/reduce';
export {
  InvalidDeckError,
  createMatch,
  type CreatedMatch,
  type MatchSetup,
  type PlayerSetup,
} from './engine/create';

// Views: what a client may know, and how it stays in sync
export { project, snapshot } from './views/project';
export {
  projectEvent,
  type ClientEnvelope,
  type ClientEvent,
  type ClientEventType,
  type SeatIntro,
} from './views/events';
export { foldView } from './views/fold';
export type {
  BanishedView,
  CountedZone,
  EvolveDeckView,
  EvolveLinkView,
  ExCardView,
  FieldCardView,
  MatchView,
  PromptSummary,
  ResolutionView,
  SeatView,
  Snapshot,
} from './views/view';
export {
  canSeeEvolveDeck,
  canSeeHand,
  seatViewer,
  spectatorViewer,
  type Viewer,
} from './views/viewer';
