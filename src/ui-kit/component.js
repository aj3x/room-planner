// @ts-check
/* Rendering a Preact component into an element the shell owns — a pane's
   section, which the shell's partial declares and a feature fills.

   A component reads the signals it shows while it renders (`rev.room.value`,
   `pref('unit')`, the selection) and re-renders when one of them changes:
   @preact/signals makes a component subscribe exactly the way an `effect`
   does. That binding installs itself as Preact option hooks when its module
   is evaluated, so it is imported here, by the one function every component
   is mounted through, rather than left to whichever module happens to load
   first. The bundle carries one copy of the signals core (kernel/signals.js
   and @preact/signals import the same @preact/signals-core).

   No focus rule is needed here, unlike mountPanel (ui-kit/mount.js): Preact
   patches the elements that are already on screen instead of re-setting
   innerHTML, so a field someone is typing in is the same element after a
   repaint, with its caret and selection, and a value a component does not
   own (an uncontrolled field, a rename box) is never written to.

   Called from a section's fill function at boot, never at import time. */
import '@preact/signals';
import {render} from 'preact';

/** A pane section's filler: renders (and binds) the section's contents into
    the <section data-sec> element the shell provides. app/slots.js calls it
    before the saved project is loaded, so it must not read S; a component
    shows its contents once `loaded` (kernel/signals.js) is true, and what
    has to wait for the project (a mountPanel effect) goes in the function
    the filler returns, which runs once the project is in.
    @typedef {(section: HTMLElement) => void | (() => void)} FillSection */
/** What a feature fills, by `data-sec` name. @typedef {Record<string, FillSection>} Sections */

/** Render vnode into el, replacing what Preact rendered there before.
    @param {HTMLElement} el @param {import('preact').ComponentChild} vnode */
function mountComponent(el, vnode){ render(vnode, el); }

export {mountComponent};
