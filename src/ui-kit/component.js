// @ts-check
/* Rendering a Preact component into an element the shell owns — a pane's
   section, which the shell declares and a feature fills, or a whole page.

   A component reads the signals it shows while it renders (`rev.room.value`,
   `pref('unit')`, the selection) and re-renders when one of them changes:
   @preact/signals makes a component subscribe exactly the way an `effect`
   does. That binding installs itself as Preact option hooks when its module
   is evaluated, so it is imported here, by the one function every component
   is mounted through, rather than left to whichever module happens to load
   first. The bundle carries one copy of the signals core (kernel/signals.js
   and @preact/signals import the same @preact/signals-core).

   @preact/signals memoises two kinds of component: one that reads a signal
   while rendering, and one that holds hook state (useState/useReducer). A
   parent's re-render reaches such a component only if one of its props has
   changed by reference — and the model is edited in place, so the same
   item, opening or folder object is not unchanged data. So such a
   component either reads every revision signal its output depends on, or
   takes a prop that changes whenever that data may have (the Library page
   passes `epoch`, its render count). A component with neither (no signals,
   no hook state) always re-renders with its parent; Field, Select and
   Check are kept that way on purpose.

   Nothing has to be held back while someone types: Preact patches the
   elements already on screen rather than re-setting innerHTML, so a field
   being typed in is the same element after a repaint, with its caret and
   selection, and a value a component does not own (an uncontrolled field,
   a rename box) is never written to. A box over a model value is a Field
   (ui-kit/parts.jsx), which also puts the model's value back after a
   commit, refused or not.

   Called from a section's fill function or from boot(), never at import
   time. */
import '@preact/signals';
import {render} from 'preact';

/** A pane section's filler: renders (and binds) the section's contents into
    the <section data-sec> element the shell provides. app/slots.js calls it
    before the saved project is loaded, so it must not read S; a component
    shows its contents once `loaded` (kernel/signals.js) is true, and what
    has to wait for the project goes in the function the filler returns,
    which runs once the project is in.
    @typedef {(section: HTMLElement) => void | (() => void)} FillSection */
/** What a feature fills, by `data-sec` name. @typedef {Record<string, FillSection>} Sections */

/** Render vnode into el, replacing what Preact rendered there before.
    @param {HTMLElement} el @param {import('preact').ComponentChild} vnode */
function mountComponent(el, vnode){ render(vnode, el); }

export {mountComponent};
