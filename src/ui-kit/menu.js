/* Dropdown menus: the ⋯ button, the popup it opens, and the right-click
   variant that has no button to anchor against.

   Extracted from index.html in Phase 3, move-only: the code below is
   byte-identical to what stood there, and the `export` block at the end is the
   only line added.

   The four listener registrations that follow the region (document pointerdown
   / keydown / scroll and window resize, all of which just close the menu) stay
   in index.html: registering them at import time would be a top-level side
   effect (plan §4 rule 6) and would move them ahead of every other listener in
   the file. They read menuEl and closeMenu as live imported bindings.

   moreBtn is the one line here that did not come from this banner — it sits in
   the layout-tree region — but §3 files it under ui/menu.js, and it is the ⋯
   button every one of these menus hangs off. */

import {svgI} from './modal.js';

/* ------------------------- dropdown menus -------------------------
   The ⋯ buttons open a small menu pinned to the button itself. Anything that
   needs more than one click — a text box, a folder picker, a confirmation —
   opens the modal from inside the menu. */
let menuEl=null;
function closeMenu(){ if(menuEl){ menuEl.remove(); menuEl=null; } }
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
function menuAtPoint(clientX, clientY, actions, title){
  const a=document.createElement('div');
  a.style.cssText='position:fixed;left:'+clientX+'px;top:'+clientY+'px;width:0;height:0;';
  document.body.appendChild(a);
  openMenu(a, actions, title);
  a.remove();
}

const moreBtn = (cls,label) => `<button type="button" class="btn quiet sm icon ${cls}" data-act="more" title="${label||'More actions'}" aria-label="${label||'More actions'}">${svgI('more')}</button>`;

export {menuEl, closeMenu, openMenu, menuAtPoint, moreBtn};
