// @ts-check
/* The drawing tools' state: which of them is live (an outline, a
   freestanding wall, a split line) and where the pointer would put the next
   point. Each is a signal (kernel/signals.js). They are here, not in the tools,
   because the panels read them too — a button shows whether
   its tool is on — and the commands that start and stop each tool cancel the
   others. A drag's own state lives in the tool that runs it.

   The signal changes when a tool starts or stops. While it runs, the tool
   mutates the object in place (drawState.value.pts.push(...)), which
   notifies nobody — on purpose: the frame that changed it already asks for
   a redraw. */

import {signal} from '../../kernel/signals.js';

/** @typedef {import('../../kernel/types.js').Pt} Pt */
/** @template T @typedef {import('@preact/signals-core').Signal<T>} Signal */

const drawState = /** @type {Signal<{pts: Pt[]}|null>} */(signal(null)), drawCursor = /** @type {Signal<Pt|null>} */(signal(null));
const wallDrawState = /** @type {Signal<{a: Pt|null}|null>} */(signal(null)), wallDrawShift = signal(false);
/* pts mixes kinds by position — a wall hit {i,t,len,pt} first (and last, once
   the line ends on a wall), world points between — and is read by position,
   so it is typed loosely rather than as a union nothing narrows. */
const splitDrawState = /** @type {Signal<{pts: any[]}|null>} */(signal(null));   // {pts:[hit, ...world points]} — pts[0] is always a boundary hit

export {drawState, drawCursor, wallDrawState, wallDrawShift, splitDrawState};
