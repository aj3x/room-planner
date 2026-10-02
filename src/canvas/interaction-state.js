/* Interaction state: what gesture is in flight. Each is a signal
   (core/signals.js); draw() and the pointer handlers read `.value`.

   The signal changes when a gesture starts, is cancelled or ends. Within one
   gesture the handlers mutate the object in place (drag.value.armed = true,
   drawState.value.pts.push(...)), which notifies nobody — on purpose: the
   frame that changed it already asks for a redraw through preview() or
   scheduleDraw(), and nothing but the canvas reads these. */

import {signal} from '../core/signals.js';

const drawState = signal(null), drawCursor = signal(null);
const wallDrawState = signal(null), wallDrawShift = signal(false);
const splitDrawState = signal(null);   // {pts:[hit, ...world points]} — pts[0] is always a boundary hit
const drag = signal(null);

export {drag, drawState, drawCursor, wallDrawState, wallDrawShift, splitDrawState};
