import type { DeckIssue } from '@sve/rules';

/** A deck problem in plain words, for the deck picker. Exhaustive over the rules' issue codes. */
export function describeDeckIssue(issue: DeckIssue): string {
  switch (issue.code) {
    case 'unknownCard':
      return 'Contains a card this game does not know.';
    case 'invalidCount':
      return 'Has a card with an impossible copy count.';
    case 'leaderNotLeader':
      return 'The chosen leader is not a leader card.';
    case 'mainSize':
      return `Main deck has ${issue.size} cards; it needs ${issue.min === issue.max ? issue.min : `${issue.min} to ${issue.max}`}.`;
    case 'evolveSize':
      return `Evolve deck has ${issue.size} cards; the most allowed is ${issue.max}.`;
    case 'notMainDeckCard':
      return `Main deck contains a card that cannot be there (${issue.reason}).`;
    case 'notEvolveDeckCard':
      return 'Only evolved followers can be in the evolve deck.';
    case 'tooManyCopies':
      return `${issue.count} copies of ${issue.name}; the limit is ${issue.limit}.`;
    case 'wrongClass':
      return `Contains ${issue.cardClass} cards in a ${issue.leaderClass} deck.`;
    case 'wrongUniverse':
      return issue.leaderUniverse === null
        ? `Contains a ${issue.universe ?? 'universe'} card in a class deck.`
        : `Contains a card that is not ${issue.leaderUniverse}, in a ${issue.leaderUniverse} deck.`;
    case 'universeUnsupported':
      return `${issue.universe} universe decks are not supported yet.`;
  }
}
