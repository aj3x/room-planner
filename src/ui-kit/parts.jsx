// @ts-check
/* The small pieces every pane component is built from, as components: the
   sprite icon, a section's head, the ⋯ row button, an empty list row, the
   rename box a row swaps its name for, and the form boxes a properties
   panel is made of (Field, Select, Check). Icon renders what svgI in dom.js
   renders for the innerHTML that is left (dialogs), so the styles and
   DESIGN.md's component rules apply to both. */
import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';

/** @typedef {import('preact').ComponentChildren} Children */

/** An icon from the <symbol> sprite at the top of <body>. @param {{name: string}} p */
function Icon({name}){
  return <svg class="i" aria-hidden="true"><use href={'#i-'+name}/></svg>;
}

/** A section's head: the title (ui-kit/panels.js makes it the collapse
    toggle) and the section's actions on the right.
    @param {{title: string, children?: Children}} p */
function SecHead({title, children}){
  return <div class="sec-head"><h2>{title}</h2>{children ? <div class="sec-act">{children}</div> : null}</div>;
}

/** A quiet icon button in a section's head. @param {{icon: string, label: string, onClick: (e: MouseEvent) => void}} p */
function ActButton({icon, label, onClick}){
  return <button class="btn quiet sm icon" title={label} aria-label={label} onClick={onClick}><Icon name={icon}/></button>;
}

/** The ⋯ button a row's menu hangs off. @param {{cls?: string, label?: string, onClick?: (e: MouseEvent) => void}} p */
function MoreButton({cls='', label='More actions', onClick}){
  return <button type="button" class={'btn quiet sm icon '+cls} data-act="more" title={label} aria-label={label} onClick={onClick}><Icon name="more"/></button>;
}

/** A list with nothing in it. @param {{children: Children}} p */
function EmptyRow({children}){
  return <li class="list-empty"><div class="empty">{children}</div></li>;
}

/** Rename in place: the box a row shows instead of its name. Enter keeps
    it, Esc and an empty box both leave the name alone, and leaving the box
    keeps what is in it. `done` gets the trimmed new name, or null for
    nothing to commit (also when the box is unmounted while still open); the
    caller stops rendering the box either way.

    Keys stop here, so the document's shortcuts (Delete, the arrows) never
    see typing; clicks stop here too, so the row underneath does not take
    them as a click on itself.
    @param {{value: string, done: (v: string|null) => void}} p */
function RenameField({value, done}){
  const ref = useRef(/** @type {HTMLInputElement|null} */(null));
  const closed = useRef(false);
  /* The value is set once, not rendered: the box is the user's while it is
     open, whatever repaints around it. */
  useEffect(() => {
    const inp = ref.current; if(!inp) return;
    inp.value = value;
    inp.focus(); try{ inp.select(); }catch(e){}
    /* The row went away with the box still open (deleted, filtered out,
       folded away) and no blur came: give up the rename, so whatever says
       "renaming this row" is cleared rather than bringing the box back
       when the row returns. */
    return () => { if(!closed.current){ closed.current = true; done(null); } };
  }, []);
  /** @param {boolean} ok */
  function finish(ok){
    const inp = ref.current;
    if(closed.current || !inp) return;
    closed.current = true;
    const v = inp.value.trim();
    inp.blur();
    done(ok && v ? v : null);
  }
  /** @param {Event} e */
  const stop = e => e.stopPropagation();
  return <input type="text" class="inline-edit" ref={ref}
    onKeyDown={e => {
      e.stopPropagation();
      if(e.key==='Enter'){ e.preventDefault(); finish(true); }
      else if(e.key==='Escape'){ e.preventDefault(); finish(false); }
    }}
    onBlur={() => finish(true)}
    onClick={stop} onDblClick={stop} onPointerDown={stop}/>;
}

/** What a Field passes through to its <input>: the attributes a form box
    in a pane uses.
    @typedef {{id?: string, class?: string, type?: string, step?: number|string, maxLength?: number,
      placeholder?: string, disabled?: boolean, spellcheck?: boolean, title?: string,
      'aria-label'?: string}} FieldAttrs */

/** A text or number box over a value the model holds — the shape every
    length, angle and name box in the panes has. `value` is what the model
    says, formatted for showing; `onCommit` gets what was typed when the box
    commits (Enter, or leaving an edited box), and commits it through
    transact() or turns it down. Either way the box then shows the model's
    value again: the normalised one ("5" becomes "5 m"), or the old one when
    the edit was refused — selected, if the box still has focus, so the next
    keystroke retypes it.

    While the box has focus and something has been typed in it, it is the
    user's: a repaint (their own `onInput` committing, as the floor colour's
    hex box does on every keystroke, or anything else) leaves the text, the
    caret and the selection alone. Without typing, or once focus leaves, it
    follows the model. The element is the same one across repaints, so Tab
    goes on to the next box.
    @param {FieldAttrs & {value: string, onCommit: (text: string) => void,
      onInput?: (e: Event & {currentTarget: HTMLInputElement}) => void, onBlur?: () => void}} p */
function Field({value, onCommit, onInput, onBlur, type='text', ...attrs}){
  const ref = useRef(/** @type {HTMLInputElement|null} */(null));
  const typed = useRef(false), committed = useRef(false);
  const [, repaint] = useState(0);
  useLayoutEffect(() => {
    const inp = ref.current; if(!inp) return;
    const focused = inp === document.activeElement;
    if(focused && typed.current) return;
    if(inp.value !== value) inp.value = value;
    if(committed.current){
      committed.current = false;
      if(focused) try{ inp.select(); }catch(e){}   // a number box has no selection
    }
  });
  return <input type={type} ref={ref} {...attrs}
    onInput={e => { typed.current = true; if(onInput) onInput(e); }}
    onChange={e => {
      typed.current = false; committed.current = true;
      onCommit(e.currentTarget.value);
      repaint(n => n+1);   // a refused edit changes nothing the panel reads
    }}
    onBlur={() => { typed.current = false; if(onBlur) onBlur(); repaint(n => n+1); }}/>;
}

/** A <select> over a value the model holds; after `onCommit` it shows the
    model's value again, so a choice the model turns down does not stay.
    @param {{value: string, onCommit: (v: string) => void, id?: string, class?: string, 'aria-label'?: string, children: Children}} p */
function Select({value, onCommit, children, ...attrs}){
  const [, repaint] = useState(0);
  return <select value={value} {...attrs} onChange={e => { onCommit(e.currentTarget.value); repaint(n => n+1); }}>{children}</select>;
}

/** A checkbox in a label, over a flag the model holds.
    @param {{checked: boolean, onCommit: (on: boolean) => void, children: Children}} p */
function Check({checked, onCommit, children}){
  const [, repaint] = useState(0);
  return <label class="check"><input type="checkbox" checked={checked}
    onChange={e => { onCommit(e.currentTarget.checked); repaint(n => n+1); }}/>{children}</label>;
}

export {Icon, SecHead, ActButton, MoreButton, EmptyRow, RenameField, Field, Select, Check};
