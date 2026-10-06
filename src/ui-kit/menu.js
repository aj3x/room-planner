// @ts-check
/* Dropdown menus: the popup a ⋯ button opens, and the right-click
   variant that has no button to anchor against. (The ⋯ button is
   ui-kit/parts.jsx's MoreButton.)

   What closes a menu from outside it — a click elsewhere, a scroll or a
   resize — is registered in index.html, and Escape is a shortcut
   (app/shortcuts.js): nothing here registers a listener at import time. They
   read menuEl and closeMenu as live imported bindings. */


/* ------------------------- dropdown menus -------------------------
   The ⋯ buttons open a small menu pinned to the button itself. Anything that
   needs more than one click — a text box, a folder picker, a confirmation —
   opens the modal from inside the menu. */
/** One row of a menu: an action, or a separator.
    (The separator names the action's fields as absent so that `if(a.sep)` narrows
    with and without strictNullChecks; see tsconfig.json.)
    @typedef {{label: string, fn: () => void, danger?: boolean, sep?: undefined}
            | {sep: true, label?: undefined, fn?: undefined, danger?: undefined}} MenuAction */

/** @type {HTMLElement|null} */
let menuEl=null;
function closeMenu(){ if(menuEl){ menuEl.remove(); menuEl=null; } }
/** @param {Element} anchor @param {MenuAction[]} actions @param {string} [title] */
function openMenu(anchor, actions, title){
  closeMenu();
  const el=document.createElement('div');
  el.className='menu'; el.setAttribute('role','menu');
  if(title){ const t=document.createElement('div'); t.className='mtitle'; t.textContent=title; el.appendChild(t); }
  for(const a of actions){
    if(a.sep){ const d=document.createElement('div'); d.className='sep'; el.appendChild(d); continue; }
    const b=document.createElement('button');
    b.type='button'; b.textContent=a.label;
    if(a.danger) b.className='danger';
    b.addEventListener('click', ()=>{ closeMenu(); a.fn(); });
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const r=anchor.getBoundingClientRect(), m=el.getBoundingClientRect();
  let x=r.left, y=r.bottom+4;
  if(x+m.width > window.innerWidth-8) x=r.right-m.width;
  if(y+m.height > window.innerHeight-8) y=r.top-m.height-4;
  el.style.left=Math.max(8,Math.round(x))+'px';
  el.style.top=Math.max(8,Math.round(y))+'px';
  menuEl=el;
  const f=el.querySelector('button'); if(f) f.focus();
}
/* a right-click menu has no button to anchor against — plant an invisible point-sized
   one where the pointer was, let openMenu read its rect, then remove it */
/** @param {number} clientX @param {number} clientY @param {MenuAction[]} actions @param {string} [title] */
function menuAtPoint(clientX, clientY, actions, title){
  const a=document.createElement('div');
  a.style.cssText='position:fixed;left:'+clientX+'px;top:'+clientY+'px;width:0;height:0;';
  document.body.appendChild(a);
  openMenu(a, actions, title);
  a.remove();
}

/** @param {string} cls @param {string} [label] */

export {menuEl, closeMenu, openMenu, menuAtPoint};
