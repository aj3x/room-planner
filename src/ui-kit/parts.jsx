// @ts-check
/* The small pieces every pane component is built from, as components: the
   sprite icon, a section's head, the ⋯ row button, an empty list row, and
   the rename box a row swaps its name for. Each renders the markup its
   string twin renders (svgI and esc in dom.js, moreBtn in menu.js, emptyRow
   in panels.js, inlineEdit in inline-edit.js), so the styles and DESIGN.md's
   component rules apply unchanged. */
import {useEffect, useRef} from 'preact/hooks';

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

export {Icon, SecHead, ActButton, MoreButton, EmptyRow, RenameField};
