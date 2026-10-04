import { NAMEPLATE, OVERLAY, viewpointOf } from '@sve/playmat';
import type { CardId, CardRef, Intent, MainOption, Seat } from '@sve/rules';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useServices } from '../app/Services';
import { definitionsIn } from '../catalog/view-cards';
import { placeAt, useDesignFit } from '../hooks/useDesignFit';
import type { MatchSession } from '../net/match-session';
import { navigate } from '../route';
import { Button, Splash } from '../ui/primitives';
import { orElse } from '../ui/text';
import { ActionMenu, labelsFor, type ActionItem } from './ActionMenu';
import { AllocateBar } from './AllocateBar';
import { CardBrowser } from './CardBrowser';
import { CardInspector } from './CardInspector';
import { ChatPanel } from './ChatPanel';
import { GameOver } from './GameOver';
import { Hourglass } from './Hourglass';
import { JoinPanel } from './JoinPanel';
import { MatchMenu } from './MatchMenu';
import { Nameplate } from './Nameplate';
import { describeOutcome } from './outcome-text';
import { PlaymatCanvas } from './PlaymatCanvas';
import { PromptBar, NumberBar, TextBar } from './PromptBar';
import { promptUi, waitingLabel } from './prompt-model';
import { tableNotice } from './table-notice';
import { WaitingTable } from './WaitingTable';
import { useMatchSession, useSessionState } from './useMatchSession';

/** A rejection stays up this long unless dismissed. */
const NOTICE_MS = 4000;

/** How long the card text stays once the pointer has left the card, so it can reach the panel. */
const INSPECT_LINGER_MS = 350;

/** A card hovered in this share of the table's width (from the left) gets its text on the right. */
const LEFT_ZONE = 0.3;

export function MatchScreen({ roomId }: { roomId: string }) {
  const acquired = useMatchSession(roomId);
  switch (acquired.status) {
    case 'finding':
      return <Splash>Finding your seat…</Splash>;
    case 'needsJoin':
      return <JoinPanel roomId={roomId} onJoined={acquired.adopt} />;
    case 'ready':
      return <LiveMatch session={acquired.session} />;
  }
}

function LiveMatch({ session }: { session: MatchSession }) {
  const { catalog: cards, user } = useServices();
  const { connection, frame, view, presence, chat, answering, notice } = useSessionState(session);

  // ---- what the mat needs -----------------------------------------------------------------
  const catalog = useSyncExternalStore(cards.subscribe, cards.snapshot);
  useEffect(() => {
    if (view) cards.ensure(definitionsIn(view));
  }, [view, cards]);

  // ---- the question, if there is one ------------------------------------------------------
  const ui = useMemo(() => (view ? promptUi(view) : null), [view]);
  const selectable = ui?.kind === 'pick' ? ui.spec : null;
  const [picked, setPicked] = useState<readonly CardId[]>([]);
  const [clearToken, setClearToken] = useState(0);
  const sending = answering !== null;
  const [menu, setMenu] = useState<{
    readonly items: readonly ActionItem[];
    readonly x: number;
    readonly y: number;
    readonly attack?: { readonly attacker: CardId };
  } | null>(null);
  const [targeting, setTargeting] = useState<{
    readonly promptId: number;
    readonly attacker: CardId;
    readonly targets: readonly (CardId | 'leader')[];
  } | null>(null);
  const [browse, setBrowse] = useState<{
    readonly title: string;
    readonly cards: readonly CardRef[];
  } | null>(null);

  // ---- reading a card ---------------------------------------------------------------------
  // Hovering a card opens its text beside the table. The pointer has to be able to travel from
  // the card to the panel to scroll it, so leaving either one only closes the panel after a beat.
  const [inspected, setInspected] = useState<{
    readonly ref: CardRef;
    readonly side: 'left' | 'right';
  } | null>(null);
  const dismissed = useRef<CardId | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClosing = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  };
  const scheduleClosing = () => {
    cancelClosing();
    closing.current = setTimeout(() => {
      closing.current = null;
      dismissed.current = null;
      setInspected(null);
    }, INSPECT_LINGER_MS);
  };
  const closeInspector = () => {
    cancelClosing();
    // Stay closed while the pointer is still on this card; the next card opens it again.
    dismissed.current = inspected?.ref.id ?? null;
    setInspected(null);
  };
  useEffect(() => () => cancelClosing(), []);
  useEffect(() => {
    if (!inspected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelClosing();
      dismissed.current = inspected.ref.id;
      setInspected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspected]);

  const seat: Seat | null = view?.viewer.kind === 'seat' ? view.viewer.seat : null;
  const options: readonly MainOption[] =
    view?.prompt?.kind === 'main' || view?.prompt?.kind === 'quickWindow'
      ? view.prompt.options
      : [];
  const highlight = targeting
    ? targeting.targets.filter((target): target is CardId => target !== 'leader')
    : [
        ...new Set(
          options.flatMap((option) =>
            option.type === 'attack' ? [option.attacker] : [option.card],
          ),
        ),
      ];
  const opponent: Seat = seat === 0 ? 1 : 0;
  const leaderTargets: readonly Seat[] =
    targeting?.targets.includes('leader') === true ? [opponent] : [];

  const confirmPicks = () => {
    if (ui?.kind !== 'pick') return;
    session.send(ui.intent(picked));
    setClearToken((n) => n + 1);
  };

  const send = (intent: Intent) => {
    setMenu(null);
    setTargeting(null);
    session.send(intent);
  };

  const openMenu = (id: CardId, at: { x: number; y: number }) => {
    if (!view?.prompt || (view.prompt.kind !== 'main' && view.prompt.kind !== 'quickWindow'))
      return;
    const promptId = view.prompt.id;
    const forCard = options.filter((option) =>
      option.type === 'attack' ? option.attacker === id : option.card === id,
    );
    if (forCard.length === 0) return;
    const items = forCard.flatMap((option) => {
      const item = labelsFor(option, promptId);
      return item ? [item] : [];
    });
    const hasAttack = forCard.some((option) => option.type === 'attack');
    setMenu({
      items,
      x: at.x,
      y: at.y,
      ...(hasAttack ? { attack: { attacker: id } } : {}),
    });
  };

  // ---- who is who -------------------------------------------------------------------------
  const names = useMemo<Readonly<Record<Seat, string>>>(
    () => ({
      0: orElse(presence?.seats[0].displayName ?? '', 'Player 1'),
      1: orElse(presence?.seats[1].displayName ?? '', 'Player 2'),
    }),
    [presence],
  );
  const near = view ? viewpointOf(view) : 0;
  const far: Seat = near === 0 ? 1 : 0;

  // ---- overlays positioned against the mat's design area ----------------------------------
  const host = useRef<HTMLDivElement>(null);
  const fit = useDesignFit(host);
  const at = (x: number, y: number) => placeAt(fit, x, y);

  const hoverCard = (ref: CardRef | null, where: { x: number; y: number }) => {
    if (!ref) {
      scheduleClosing();
      return;
    }
    cancelClosing();
    if (dismissed.current === ref.id) return;
    dismissed.current = null;
    const width = host.current?.clientWidth ?? 0;
    setInspected((current) =>
      current?.ref.id === ref.id && current.ref.def === ref.def
        ? current
        : { ref, side: where.x < width * LEFT_ZONE ? 'right' : 'left' },
    );
  };

  // ---- chat -------------------------------------------------------------------------------
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  const unread = chatOpen ? 0 : chat.length - chatSeen;
  const closeChat = () => {
    setChatSeen(chat.length);
    setChatOpen(false);
  };

  // ---- leaving ----------------------------------------------------------------------------
  const leave = async () => {
    await session.leave();
    navigate({ name: 'lobby' });
  };

  const result = view?.outcome ? describeOutcome(view.outcome, seat, names) : null;
  const finished = result !== null;
  const banner = tableNotice({ connection, presence, seat, names, finished });
  const waiting = view ? waitingLabel(view, names) : null;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => session.dismissNotice(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, session]);

  if (!view) {
    // Same host box as the live table, so overlay fit is measured before the match starts.
    // Returning a different root here used to leave prompts in unscaled design space.
    return (
      <div ref={host} className="relative h-full w-full overflow-hidden bg-ink">
        {presence?.status === 'waiting' ? (
          <WaitingTable
            presence={presence}
            seated={presence.seats.some((plate) => plate.userId === user.id)}
            onLeave={() => void leave()}
          />
        ) : (
          <Splash>Taking your seat…</Splash>
        )}
      </div>
    );
  }

  const inspectedDef = inspected ? catalog(inspected.ref.def) : undefined;
  const inspectedShown = inspected
    ? (view.seats.flatMap((s) => s.field).find((entry) => entry.card.id === inspected.ref.id)
        ?.shown ??
      view.seats.flatMap((s) => s.ex).find((entry) => entry.card.id === inspected.ref.id)?.shown)
    : undefined;

  const nameplate = (which: Seat, anchor: { x: number; y: number }) => (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={at(anchor.x, anchor.y)}
    >
      <Nameplate plate={presence?.seats[which]} fallback={names[which]} you={seat === which} />
    </div>
  );

  const attackFromMenu =
    menu?.attack && (view.prompt?.kind === 'main' || view.prompt?.kind === 'quickWindow')
      ? () => {
          const attacker = menu.attack?.attacker;
          const prompt = view.prompt;
          if (!attacker || !prompt || (prompt.kind !== 'main' && prompt.kind !== 'quickWindow')) {
            return;
          }
          const targets = options.flatMap((option) =>
            option.type === 'attack' && option.attacker === attacker ? [option.target] : [],
          );
          setMenu(null);
          if (targets.length === 1 && targets[0]) {
            send({
              type: 'attack',
              promptId: prompt.id,
              attacker,
              target: targets[0],
            });
          } else {
            setTargeting({ promptId: prompt.id, attacker, targets });
          }
        }
      : null;

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-ink">
      <PlaymatCanvas
        className="absolute inset-0"
        frame={frame}
        catalog={catalog}
        selectable={selectable}
        highlight={highlight}
        leaderTargets={leaderTargets}
        onSelectionChange={setPicked}
        onCardPress={(id, at) => {
          if (targeting) {
            if (targeting.targets.includes(id)) {
              send({
                type: 'attack',
                promptId: targeting.promptId,
                attacker: targeting.attacker,
                target: id,
              });
            }
            return;
          }
          if (ui?.kind === 'pick') return;
          openMenu(id, at);
        }}
        onAvatarPress={(which) => {
          if (!targeting || which !== opponent || !targeting.targets.includes('leader')) return;
          send({
            type: 'attack',
            promptId: targeting.promptId,
            attacker: targeting.attacker,
            target: 'leader',
          });
        }}
        onPilePress={(which, kind) => {
          if (!view) return;
          const data = view.seats[which];
          if (kind === 'cemetery') setBrowse({ title: 'Cemetery', cards: data.cemetery });
          else if (kind === 'banished') {
            setBrowse({
              title: 'Banished',
              cards: data.banished.flatMap((entry) => (entry.card ? [entry.card] : [])),
            });
          } else if (kind === 'evolve') {
            const cards = [...(data.evolveDeck.cards ?? []), ...data.evolveDeck.revealed];
            if (cards.length > 0) setBrowse({ title: 'Evolve deck', cards });
          }
        }}
        onCardHover={hoverCard}
        clearToken={clearToken}
      />

      {nameplate(far, NAMEPLATE.far)}
      {nameplate(near, NAMEPLATE.near)}

      {waiting ? (
        <div
          className={`pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border px-5 py-2 text-sm ${
            view.waitingOn?.kind === 'turnOrder'
              ? 'border-gold/50 bg-ink/90 text-parchment'
              : 'border-slab bg-ink/80 text-mist'
          }`}
          style={at(800, OVERLAY.midlineY)}
        >
          {waiting}
        </div>
      ) : null}

      {ui && (ui.kind === 'choice' || ui.kind === 'pick') ? (
        <div
          className={`absolute z-20 ${
            view.prompt?.kind === 'turnOrder'
              ? '-translate-x-1/2 -translate-y-1/2'
              : '-translate-x-1/2 -translate-y-full'
          }`}
          style={at(
            800,
            view.prompt?.kind === 'turnOrder' ? OVERLAY.midlineY : OVERLAY.promptBottomY,
          )}
        >
          <PromptBar
            ui={ui}
            picked={picked.length}
            sending={sending}
            prominent={view.prompt?.kind === 'turnOrder'}
            onChoose={(intent) => send(intent)}
            onConfirm={confirmPicks}
          />
        </div>
      ) : null}

      {ui?.kind === 'number' ? (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full"
          style={at(800, OVERLAY.promptBottomY)}
        >
          <NumberBar ui={ui} sending={sending} onChoose={send} />
        </div>
      ) : null}

      {ui?.kind === 'text' ? (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full"
          style={at(800, OVERLAY.promptBottomY)}
        >
          <TextBar ui={ui} sending={sending} onChoose={send} />
        </div>
      ) : null}

      {ui?.kind === 'allocate' ? (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full"
          style={at(800, OVERLAY.promptBottomY)}
        >
          <AllocateBar
            promptId={ui.promptId}
            title={ui.title}
            total={ui.total}
            targets={ui.targets}
            names={Object.fromEntries(
              ui.targets.map((id) => {
                const defId = view.seats.flatMap((s) => s.field).find((card) => card.card.id === id)
                  ?.card.def;
                return [id, defId ? (catalog(defId)?.name ?? id) : id];
              }),
            )}
            sending={sending}
            onChoose={send}
          />
        </div>
      ) : null}

      {ui?.kind === 'browser' ? (
        <CardBrowser
          title={ui.title}
          cards={ui.cards}
          catalog={catalog}
          min={ui.min}
          max={ui.max}
          onConfirm={(cards) => send(ui.intent(cards))}
          onClose={() => send(ui.intent([]))}
        />
      ) : null}

      {browse ? (
        <CardBrowser
          title={browse.title}
          cards={browse.cards}
          catalog={catalog}
          onClose={() => setBrowse(null)}
        />
      ) : null}

      {menu ? (
        <ActionMenu
          items={menu.items}
          x={menu.x}
          y={menu.y}
          sending={sending}
          onChoose={send}
          {...(attackFromMenu ? { onAttack: attackFromMenu } : {})}
          onDismiss={() => setMenu(null)}
        />
      ) : null}

      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
        {banner ? (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-md border px-4 py-2 text-sm backdrop-blur ${
              banner.tone === 'warn'
                ? 'border-danger/60 bg-ink/90 text-parchment'
                : 'border-slab-raised bg-ink/85 text-mist'
            }`}
          >
            {banner.text}
            {banner.leave ? <Button onClick={() => void leave()}>Back to the lobby</Button> : null}
          </div>
        ) : null}
        {notice ? (
          <button
            type="button"
            onClick={() => session.dismissNotice()}
            className="rounded-md border border-danger/60 bg-ink/90 px-4 py-2 text-sm text-parchment"
          >
            {notice}
          </button>
        ) : null}
      </div>

      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <Button
          onClick={() => (chatOpen ? closeChat() : setChatOpen(true))}
          aria-expanded={chatOpen}
        >
          Chat
          {unread > 0 ? (
            <span className="ml-2 rounded-full bg-gold px-1.5 text-xs text-ink">{unread}</span>
          ) : null}
        </Button>
        <MatchMenu
          playing={seat !== null && !finished}
          onConcede={() => session.send({ type: 'concede' })}
          onLeave={() => void leave()}
        />
      </div>

      {seat !== null && !finished ? (
        <Hourglass
          ready={ui?.kind === 'pass'}
          sending={sending && ui?.kind === 'pass'}
          onPress={() =>
            ui?.kind === 'pass' && session.send({ type: 'pass', promptId: ui.promptId })
          }
        />
      ) : null}

      {inspectedDef && inspected && !browse && ui?.kind !== 'browser' ? (
        <CardInspector
          def={inspectedDef}
          shown={inspectedShown}
          side={inspected.side}
          onClose={closeInspector}
          onPointerEnter={cancelClosing}
          onPointerLeave={scheduleClosing}
        />
      ) : null}

      {chatOpen ? (
        <ChatPanel
          lines={chat}
          spectating={seat === null}
          canSpeak={connection === 'live'}
          onSay={(text) => session.say(text)}
          onClose={closeChat}
        />
      ) : null}

      {result ? <GameOver result={result} onLeave={() => void leave()} /> : null}
    </div>
  );
}
