/* The saved document's shape, and the vocabulary transact() speaks.

   Declarations only: nothing here is code, nothing imports it at runtime, and
   Vite never sees it. JS files name these types through JSDoc,

     /** @param {import('./types.js').Layout} l *\/

   (the `.js` specifier resolves to this file), so the dependency stays
   visible in the file that has it rather than arriving as a global.

   Why a .d.ts rather than @typedef blocks in a kernel/types.js: an interface
   with optional methods, a discriminated union and a `declare global` for the
   host's window.storage read far better as declarations, and a .d.ts cannot
   grow runtime code by accident. It is the one kind of TypeScript file this
   repo has; there are no .ts sources.

   This is the shape save() writes and migrate() repairs. Changing it is a
   change to every user's saved data and needs a migration step in
   kernel/migrate.js first — these types follow the data, never the other way
   round. Field-level documentation of an item is ITEM_SCHEMA.md; of a
   marketplace, MARKET_SCHEMA.md. */

/** A point in world millimetres, [x, y].
    number[] rather than the tuple [number, number]: a JS array literal
    assigned to a local infers as number[], so a tuple type would cost a cast
    at nearly every `const p=[x,y]` in the codebase for no check worth having. */
export type Pt = number[];
/** An axis-aligned box. */
export interface BBox { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
/** A segment, from one point to another. */
export type Seg = [Pt, Pt];

/* ---- items (ITEM_SCHEMA.md) ---- */

export type Shape =
  | {type: 'rect'; w: number; d: number}
  | {type: 'ellipse'; w: number; d: number}
  | {type: 'lshape'; w: number; d: number; cw: number; cd: number; corner?: 'ne' | 'se' | 'sw' | 'nw'}
  | {type: 'poly'; points: Pt[]; w?: number; d?: number};

/** How far an item reaches past its footprint when in use, mm, in its own unrotated frame. */
export interface OpenSpec { top: number; bottom: number; left: number; right: number }

export interface Item {
  id: string;
  name: string;
  shape: Shape;
  color: string;
  passThrough?: boolean;
  count: number;
  /** derived: manualTags plus what the item's Library folder ancestry contributes */
  tags: string[];
  manualTags: string[];
  open: OpenSpec | null;
  /** the Library folder (S.itemFolders) this item is filed under */
  folderId: string | null;
}

/** An item standing in a room. */
export interface Placed { id: string; itemId: string; x: number; y: number; rot: number }

/* ---- rooms ---- */

export interface Pillar { id: string; shape: {type: 'rect' | 'ellipse'; w: number; d: number}; x: number; y: number; rot: number }
export interface IWall { id: string; a: Pt; b: Pt; t: number }

export interface Room {
  /** a closed polygon, clockwise, mm */
  points: Pt[];
  /** wall thickness, mm */
  wall: number;
  /** parallel to points: entry i is true when the edge points[i]→points[i+1] has no wall */
  wallOff?: boolean[];
  /** floor colour, hex */
  floor: string;
  trimOn: boolean;
  trim: number;
  pillars: Pillar[];
  iwalls: IWall[];
}

export type DoorType = 'hinge' | 'slide' | 'bifold' | 'open';
export interface Opening {
  id: string;
  kind: 'door' | 'window';
  /** index of the room wall it is cut into */
  wall: number;
  /** mm from the wall's start corner, always clockwise; `corner` only changes what is displayed */
  offset: number;
  width: number;
  corner: 'cw' | 'ccw';
  dtype: DoorType;
  hinge: 'start' | 'end';
  swing: 'in' | 'out';
  /** windows: sill height, mm — a note, it changes nothing in the plan */
  sill?: number;
}

/* ---- measurements ---- */

export type AnchorKind = 'item' | 'pillar' | 'iwall' | 'open' | 'wall';
interface AnchorEnd {
  part: 'corner' | 'side' | 'whole' | 'swing';
  /** which corner or side, for part 'corner' | 'side' */
  n?: number;
}
/** One end of a measurement: a thing by id, or a room wall by its index. */
export type Anchor =
  | AnchorEnd & {k: 'item' | 'pillar' | 'iwall' | 'open'; id: string}
  | AnchorEnd & {k: 'wall'; id: number};
export interface Measure { id: string; a: Anchor; b: Anchor }

export interface FloorPlace { x: number; y: number; rot: number }

export interface Layout {
  id: string;
  name: string;
  folderId: string | null;
  floorId: string | null;
  floorPlace: FloorPlace;
  room: Room;
  openings: Opening[];
  placed: Placed[];
  measures: Measure[];
  /** what the room is called on paper, when its bbox would say otherwise */
  dimLabel?: string;
  /** not saved meaningfully: bumped by transact() to key the derived caches */
  _rev?: number;
  /** blueprint import in progress: the region this room was traced from, and its outline in photo pixels */
  _bpRegion?: string;
  _bpPx?: Pt[];
}

/* ---- trees ---- */

/** A folder in the room tree (S.folders) or the Library's (S.itemFolders). */
export interface Folder { id: string; name: string; parentId: string | null; tags: string[] }
/** An arrangement of rooms. */
export interface Floor {
  id: string;
  name: string;
  parentId: string | null;
  /** exterior wall thickness for the whole floor, mm; 0 = each room's own */
  extWall: number;
}

/* ---- marketplace (MARKET_SCHEMA.md) ---- */

export interface MarketFolder { id: string; name: string; parentId: string | null }
/** An ad hoc listing: a shared bundle that is not a subscribed marketplace. */
export interface MarketListing {
  id: string;
  name: string;
  parentId: string | null;
  kind: 'file' | 'link' | 'paste';
  url?: string;
  content?: string;
  addedAt?: number;
}
/** A subscribed marketplace. Only this record is saved; its index and items are cached in memory. */
export interface MarketSub {
  id: string;
  url: string;
  name: string;
  version: number;
  itemURL: string;
  addedAt?: number;
}

/* ---- the document ---- */

export type Unit = 'ftin' | 'in' | 'cm' | 'mm' | 'm';
export type Mode = 'room' | 'furniture' | 'floor' | 'inventory' | 'marketplace';
export type CanvasMode = 'room' | 'furniture' | 'floor';
export type InvScope = 'project' | 'folder' | 'room';

/** S: the whole saved project, and the view preferences that travel with it. */
export interface State {
  unit: Unit;
  /** snap grid, mm, as the <select>'s string value; '0' is off */
  snap: string;
  showSwing: boolean;
  showDims: boolean;
  showOpen: boolean;
  showWalk: boolean;
  showMeasure: boolean;
  mode: Mode;
  /** the Room/Furniture/Floor mode to go back to from the Library */
  planMode: CanvasMode;
  inventory: Item[];
  layouts: Layout[];
  /** the active layout's id */
  active: string | null;
  folders: Folder[];
  floors: Floor[];
  tagFilter: string[];
  untaggedOnly: boolean;
  invSearch: string;
  onlyAvailable: boolean;
  invScope: InvScope;
  zoomSpeed: number;
  leftOpen: boolean;
  rightOpen: boolean;
  /** data-sec keys of the folded sections */
  secClosed: string[];
  lastFolderId: string | null | undefined;
  itemFolders: Folder[];
  marketFolders: MarketFolder[];
  marketListings: MarketListing[];
  marketSubs: MarketSub[];
  defaultMarketDismissed: boolean;
  uiLib: {tab: string; libFolderId: string | null; marketFolderId: string | null};
}

/* ---- transact() ---- */

/** What part of the document an edit touches. room/furn/floor have undo stacks. */
export type Scope = 'room' | 'furn' | 'floor' | 'lib' | 'prefs' | 'project';
export interface TransactOpts {
  /** false: no undo step for this call (default true) */
  history?: boolean;
  /** false: the plan does not show this edit, so the canvas need not repaint (default true) */
  canvas?: boolean;
}

/* ---- undo ---- */

/** One undo stack: JSON snapshots, and where in them the document stands. */
export interface Hist { stack: string[]; idx: number }
/** Stacks keyed by layout id (room, furniture) or floor id. */
export type HistMap = Record<string, Hist>;

/* ---- the selection ---- */

/** What is picked in Room mode. */
export type RoomSel =
  | {kind: 'wall' | 'corner'; i: number}
  | {kind: 'opening' | 'pillar' | 'iwall'; id: string};

/* ---- the host ---- */

declare global {
  interface Window {
    /** a key/value store some hosts provide; Store prefers it over localStorage */
    storage?: {get(k: string): Promise<{value?: string} | null>; set(k: string, v: string): Promise<unknown>};
  }
}
