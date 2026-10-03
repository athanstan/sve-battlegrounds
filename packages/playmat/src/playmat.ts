import type { CardCatalog, CardId, CardRef, ClientEvent, MatchView, Seat } from '@sve/rules';
import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { createCamera, DEFAULT_CAMERA, type Camera, type CameraOptions } from './camera';
import { cuesFromEvents, type Cue } from './cues';
import { CardTextures } from './draw/cards';
import { createHudTextures, type HudTextures } from './draw/hud';
import { createVignetteTexture } from './draw/stone';
import { computeLayout, type Layout, type PileKind } from './layout';
import { Board } from './scene/board';
import { Floor } from './scene/floor';
import { Motion } from './scene/motion';
import { sameSpec, toggle, type SelectionSpec } from './selection';
import { COLOR, DESIGN, FONT_FACES } from './theme';

/**
 * The playmat: a PixiJS canvas that shows one `MatchView` and nothing else.
 *
 * It owns the picture and only the picture. It never sees an intent, a socket or a prompt; the
 * page hands it views and events, and gets back the cards the player picked. Everything on it
 * is a function of the view (`computeLayout`); the animations are the way the picture changes,
 * never a second source of truth.
 */

export interface PlaymatOptions {
  /** Looks up a card's definition. Faces are drawn from it, and redrawn when it learns more. */
  readonly catalog: CardCatalog;
  /** Fetch a card's art. Defaults to the Pixi asset loader; a failure leaves the emblem. */
  readonly loadArt?: (url: string) => Promise<Texture | null>;
  /** Skip movement. Defaults to the viewer's `prefers-reduced-motion`. */
  readonly reducedMotion?: boolean;
  /** Tweak the camera (the dev lab does; the product uses the defaults). */
  readonly camera?: Partial<Omit<CameraOptions, 'viewport'>>;
  /** The player's picks changed. */
  readonly onSelectionChange?: (picked: readonly CardId[]) => void;
  /** A face-up card was pressed outside a pick prompt. `at` is in canvas CSS pixels. */
  readonly onCardPress?: (id: CardId, at: { x: number; y: number }) => void;
  readonly onAvatarPress?: (seat: Seat) => void;
  readonly onPilePress?: (seat: Seat, kind: PileKind) => void;
  /** The pointer is over a face-up card, or (`null`) has left it. `at` is in canvas CSS pixels. */
  readonly onCardHover?: (ref: CardRef | null, at: { x: number; y: number }) => void;
}

const MAX_RESOLUTION = 2;
const DIM_ON_GAME_OVER = 0.3;

const defaultLoadArt = async (url: string): Promise<Texture | null> => {
  try {
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
};

/** Everything that exists only once Pixi has finished starting. */
interface Scene {
  readonly app: Application;
  readonly world: Container;
  readonly floor: Floor;
  readonly vignette: Sprite;
  readonly dim: Graphics;
  readonly textures: CardTextures;
  readonly hud: HudTextures;
  readonly board: Board;
  readonly tick: (ticker: { lastTime: number }) => void;
}

export class Playmat {
  /** Resolves when the first view can be shown. Safe to ignore; `update` before it is buffered. */
  readonly ready: Promise<void>;

  readonly #host: HTMLElement;
  readonly #options: PlaymatOptions;
  readonly #motion: Motion;
  #catalog: CardCatalog;
  #camera: Camera;
  #scene: Scene | null = null;
  #destroyed = false;

  /** The newest view, kept so a late scene or a camera change can show it. */
  #view: MatchView | null = null;
  #shown = false;
  #spec: SelectionSpec | null = null;
  #picked: readonly CardId[] = [];
  #highlight: readonly CardId[] = [];
  #leaderTargets: readonly Seat[] = [];
  #motionQuery: MediaQueryList | null = null;
  readonly #onMotionPreference = (event: MediaQueryListEvent): void => {
    this.#motion.enabled = !event.matches;
  };

  private constructor(host: HTMLElement, options: PlaymatOptions) {
    this.#host = host;
    this.#options = options;
    this.#catalog = options.catalog;
    this.#camera = createCamera({ viewport: DESIGN, ...DEFAULT_CAMERA, ...options.camera });

    if (options.reducedMotion === undefined && typeof matchMedia === 'function') {
      this.#motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
      this.#motionQuery.addEventListener('change', this.#onMotionPreference);
    }
    this.#motion = new Motion(!(options.reducedMotion ?? this.#motionQuery?.matches ?? false));
    this.ready = this.#start();
  }

  /** Put a playmat in `host`. Returns at once; the canvas appears when Pixi is ready. */
  static mount(host: HTMLElement, options: PlaymatOptions): Playmat {
    return new Playmat(host, options);
  }

  // ---- what the page tells it -------------------------------------------------------------

  /** The match moved on: show `view`, animating from what was there, and cue what `events` say. */
  update(view: MatchView, events: readonly ClientEvent[] = []): void {
    this.#view = view;
    if (this.#scene) this.#show(this.#scene, view, cuesFromEvents(events), this.#shown);
  }

  /** Show `view` as it is, without animation: a first look, a resync, a changed seat. */
  reset(view: MatchView): void {
    this.#view = view;
    if (this.#scene) this.#show(this.#scene, view, [], false);
  }

  /** The catalog learned about cards it did not know: redraw them. */
  setCatalog(catalog: CardCatalog): void {
    this.#catalog = catalog;
    if (!this.#scene) return;
    this.#scene.textures.setCatalog(catalog);
    this.#scene.board.refreshFaces();
  }

  /**
   * Ask the player to pick cards. A re-sent identical request keeps what is already picked;
   * a different one starts fresh. `null` ends picking.
   */
  setSelectable(spec: SelectionSpec | null): void {
    const unchanged = sameSpec(this.#spec, spec);
    this.#spec = spec;
    if (!unchanged) this.#setPicked([]);
    else this.#scene?.board.setSelection(spec, this.#picked);
  }

  clearSelection(): void {
    this.#setPicked([]);
  }

  /** Cards that have a legal action. Distinct from the pick-prompt glow. */
  setHighlight(ids: readonly CardId[], leaders: readonly Seat[] = []): void {
    this.#highlight = ids;
    this.#leaderTargets = leaders;
    this.#scene?.board.setHighlight(ids, leaders);
  }

  get selection(): readonly CardId[] {
    return this.#picked;
  }

  /** Move the camera (dev lab). */
  setCamera(camera: Partial<Omit<CameraOptions, 'viewport'>>): void {
    this.#camera = createCamera({ ...this.#camera.options, ...camera });
    const scene = this.#scene;
    if (!scene) return;
    scene.floor.setCamera(this.#camera);
    if (this.#view) this.#show(scene, this.#view, [], false);
  }

  get camera(): Camera {
    return this.#camera;
  }

  setReducedMotion(reduced: boolean): void {
    this.#motion.enabled = !reduced;
  }

  /** The canvas, once it exists. For tests and screenshots. */
  get canvas(): HTMLCanvasElement | null {
    return this.#scene?.app.canvas ?? null;
  }

  /** Safe at any time, including before Pixi has finished starting. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#motionQuery?.removeEventListener('change', this.#onMotionPreference);
    const scene = this.#scene;
    this.#scene = null;
    if (scene) this.#teardown(scene);
    // Otherwise `#start` is still waiting on Pixi or on fonts, and tears down after itself.
  }

  // ---- startup and teardown ---------------------------------------------------------------

  async #start(): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: this.#host,
      background: COLOR.ink,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, MAX_RESOLUTION),
    });
    if (this.#destroyed) {
      app.destroy(true, { children: true });
      return;
    }

    // Text is baked into card textures once, so the fonts have to be in before anything is drawn.
    await Promise.all(FONT_FACES.map((face) => document.fonts.load(face))).catch(() => undefined);
    if (this.#destroyed) {
      app.destroy(true, { children: true });
      return;
    }

    const scene = this.#build(app);
    this.#scene = scene;
    this.#host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    this.#fit(scene);
    scene.board.setSelection(this.#spec, this.#picked);
    scene.board.setHighlight(this.#highlight, this.#leaderTargets);
    if (this.#view) this.#show(scene, this.#view, [], false);
  }

  #build(app: Application): Scene {
    const textures = new CardTextures(
      app.renderer,
      (id) => this.#catalog(id),
      this.#options.loadArt ?? defaultLoadArt,
    );
    const hud = createHudTextures(app.renderer);

    const world = new Container();
    const floor = new Floor(this.#camera);
    const piles = new Container();
    const hudLayer = new Container();
    const cards = new Container();
    world.addChild(floor, piles, hudLayer, cards);

    const vignette = new Sprite(createVignetteTexture());
    const dim = new Graphics();
    dim.alpha = 0;
    // The vignette and the dim belong to the screen, not the table: they never scale with the fit.
    vignette.eventMode = 'none';
    dim.eventMode = 'none';
    app.stage.addChild(world, vignette, dim);

    const board = new Board({
      layers: { piles, cards, hud: hudLayer },
      art: {
        textures,
        hud,
        catalog: () => this.#catalog,
        camera: () => this.#camera,
        onFaceChange: () => {
          this.#scene?.board.refreshFaces();
        },
      },
      motion: this.#motion,
      onPick: (id) => {
        if (this.#spec) this.#setPicked(toggle(this.#picked, id, this.#spec));
      },
      onCardPress: (id, at) => this.#options.onCardPress?.(id, at),
      onAvatarPress: (seat) => this.#options.onAvatarPress?.(seat),
      onPilePress: (seat, kind) => this.#options.onPilePress?.(seat, kind),
      onCardHover: (ref, at) => this.#options.onCardHover?.(ref, at),
    });

    const tick = (ticker: { lastTime: number }): void => board.tick(ticker.lastTime);
    app.ticker.add(tick);
    app.renderer.on('resize', () => {
      if (this.#scene) this.#fit(this.#scene);
    });

    return { app, world, floor, vignette, dim, textures, hud, board, tick };
  }

  #teardown(scene: Scene): void {
    scene.app.ticker.remove(scene.tick);
    scene.board.destroy();
    scene.floor.destroy();
    scene.textures.destroy();
    scene.hud.destroy();
    scene.vignette.texture.destroy(true);
    scene.app.destroy({ removeView: true }, { children: true });
  }

  /** Fit the design area inside the canvas, centred; the floor bleeds past it on every side. */
  #fit(scene: Scene): void {
    const { width, height } = scene.app.screen;
    const scale = Math.min(width / DESIGN.width, height / DESIGN.height);
    scene.world.scale.set(scale);
    scene.world.position.set(
      (width - DESIGN.width * scale) / 2,
      (height - DESIGN.height * scale) / 2,
    );
    scene.vignette.width = width;
    scene.vignette.height = height;
    scene.dim.clear().rect(0, 0, width, height).fill(0x000000);
  }

  // ---- showing a view ---------------------------------------------------------------------

  #show(scene: Scene, view: MatchView, cues: readonly Cue[], animate: boolean): void {
    const layout: Layout = computeLayout(view, this.#camera);
    scene.board.apply(layout, animate);
    for (const cue of unique(cues)) scene.board.cue(cue);
    this.#shown = true;

    const dimmed = layout.over ? DIM_ON_GAME_OVER : 0;
    this.#motion.to(scene.dim, { alpha: dimmed, duration: 1.2 }, !animate);
  }

  #setPicked(picked: readonly CardId[]): void {
    const changed =
      picked.length !== this.#picked.length || picked.some((id, i) => id !== this.#picked[i]);
    this.#picked = picked;
    this.#scene?.board.setSelection(this.#spec, picked);
    if (changed) this.#options.onSelectionChange?.(picked);
  }
}

/** One event batch can say "playPoints changed" three times; the board needs to hear it once. */
function unique(cues: readonly Cue[]): Cue[] {
  const seen = new Set<string>();
  return cues.filter((cue) => {
    const key = JSON.stringify(cue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
