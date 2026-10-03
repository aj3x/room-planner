/* The drawing tools' state: which of them is live (an outline, a
   freestanding wall, a split line) and where the pointer would put the next
   point. Each is a signal (core/signals.js). They are here, not in the tools
   (canvas/tools/), because the panels read them too — a button shows whether
   its tool is on — and the commands that start and stop each tool cancel the
   others. A drag's own state lives in the tool that runs it.

   The signal changes when a tool starts or stops. While it runs, the tool
   mutates the object in place (drawState.value.pts.push(...)), which
   notifies nobody — on purpose: the frame that changed it already asks for
   a redraw. */

import {signal} from '../core/signals.js';

const drawState = signal(null), drawCursor = signal(null);
const wallDrawState = signal(null), wallDrawShift = signal(false);
const splitDrawState = signal(null);   // {pts:[hit, ...world points]} — pts[0] is always a boundary hit

export {drawState, drawCursor, wallDrawState, wallDrawShift, splitDrawState};
