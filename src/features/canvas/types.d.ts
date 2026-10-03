/* The canvas's two extension points, as declarations: a Layer paints one
   concern of the plan, a Tool handles one kind of gesture. draw.js and
   interaction.js describe each in prose; these are the same contracts in a
   form tsc checks. A layer or tool module states which it is with
   `/** @satisfies {import('../canvas/types.js').Layer} *\/` on the object,
   which types its methods' parameters and keeps its own extra members (a
   hitTest, a stop) visible to whoever imports it.

   Like kernel/types.d.ts this is declarations only; nothing imports it at
   runtime. It is part of the canvas feature's public surface, alongside
   index.js. */

import type {Floor, Mode} from '../../kernel/types.js';
import type {PAL} from './paint.js';
import type {Member} from '../../kernel/floor-place.js';

/** The camera: world mm × scale + offset = screen px. */
export interface View { scale: number; ox: number; oy: number }

/** The canvas palette, light or dark (paint.js PAL()). */
export type Palette = ReturnType<typeof PAL>;

/** What every layer of a room-scene frame shares. */
export interface RoomFrame {
  scene: 'room';
  C: Palette;
  /** placed ids that are not legal where they stand */
  bad: Set<string>;
  /** placed id -> why it cannot open */
  openBad: Map<string, string>;
}
/** What every layer of a floor-scene frame shares: either there is nothing
    to draw (no floor, or no room on it), or there is a floor with rooms. */
export type FloorFrame = EmptyFloorFrame | FullFloorFrame;
export interface EmptyFloorFrame {
  scene: 'floor';
  C: Palette;
  fl: Floor | null | undefined;
  members: Member[];
  empty: true;
  depths: null;
}
export interface FullFloorFrame {
  scene: 'floor';
  C: Palette;
  fl: Floor;
  members: Member[];
  empty: false;
  /** per member, per edge: how deep its wall band runs */
  depths: number[][];
}
export type Frame = RoomFrame | FloorFrame;

interface LayerBase {
  id: string;
  /** paint order; equal z keeps registration order */
  z: number;
  /** read the signals this layer shows, so the canvas repaints when they change */
  deps?(): void;
  /** whatever only this layer knows, e.g. where it last drew a label; tools call it directly */
  hitTest?(...args: never[]): unknown;
}
/** Drawn in Room and Furniture modes. */
export interface RoomLayer extends LayerBase {
  scene: 'room';
  draw(ctx: CanvasRenderingContext2D, view: View, frame: RoomFrame): void;
}
/** Drawn in Floor mode. */
export interface FloorLayer extends LayerBase {
  scene: 'floor';
  draw(ctx: CanvasRenderingContext2D, view: View, frame: FloorFrame): void;
}
/** Drawn in every scene. */
export interface AnyLayer extends LayerBase {
  scene?: undefined;
  draw(ctx: CanvasRenderingContext2D, view: View, frame: Frame): void;
}
export type Layer = RoomLayer | FloorLayer | AnyLayer;

/** The modifier keys a held gesture sees. */
export interface Mods { shiftKey: boolean; altKey: boolean }

/** A gesture handler. See the header of interaction.js for what each member means. */
export interface Tool {
  id: string;
  /** is this the tool in charge right now; asked in registration order */
  active(): boolean;
  /** a press; returns the tool that holds the pointer until it comes up, or null */
  onDown(e: PointerEvent, px: number, py: number): HeldTool | null | undefined;
  onMove?(px: number, py: number, mods: Mods): void;
  onUp?(e: PointerEvent): void;
  onCancel?(): void;
  onHover?(px: number, py: number): void;
  onCursor?(px: number, py: number, mods: Mods): void;
  onLeave?(): void;
  /** true claims the key */
  onKey?(e: KeyboardEvent): boolean | undefined | void;
  /** a held drag near the edge scrolls the canvas */
  autoPan?: boolean;
  cursor?: string;
  /** a layer drawing this tool's gesture */
  overlay?: Layer;
  /** turn a switched-on tool off */
  stop?(): void;
  /** the canvas modes a switched-on tool may stay on in */
  modes?: Mode[];
  /** forget what was picked in the room being left */
  reset?(): void;
}
/** A tool holding the pointer: it gets every move, and the release or the cancel. */
export interface HeldTool {
  id: string;
  onMove(px: number, py: number, mods: Mods): void;
  onUp(e: PointerEvent): void;
  onCancel(): void;
  autoPan?: boolean;
}
