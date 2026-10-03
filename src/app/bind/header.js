/* The header's wiring: the section nav, the unit select, and the two
   import/export buttons with the hidden file input they drive.

   One of the per-pane bind modules. Each HTML partial ends with a module
   script that imports its bind function and calls it, so a pane's markup and
   the list of things listening to it sit in the same file. index.html keeps
   only what is genuinely app-global.

   Why a function rather than registrations at import time: a module that
   calls addEventListener while it is being evaluated is a top-level side
   effect, which nothing in src/ is allowed to have, and it would also bind at
   import-hoist time rather than at the point in the document its markup
   occupies. Exporting a function and letting the partial call it keeps both
   properties — the same trade app/boot.js already makes.

   Ordering: registration order only decides anything between listeners on the
   SAME element in the SAME phase, and every such group lives in one partial.
   The order within this function is the order these had in index.html. */

import { readImport, importDialog, exportDialog } from '../../features/io/index.js';
import { transact } from '../../kernel/tx.js';
import { S, isCanvasMode } from '../../kernel/state.js';
import { setMode } from '../../features/mode/index.js';
import { flash } from '../../ui-kit/flash.js';
import { $ } from '../../ui-kit/modal.js';

function bindHeader(){
  $('navSeg').addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return;
    const n=b.dataset.nav;
    if(n==='plan'){ if(!isCanvasMode(S.mode)) setMode(S.planMode||'furniture'); }
    else if(n!==S.mode) setMode(n);
  });

  $('unitSel').addEventListener('change', e=>transact('prefs', ()=>{ S.unit=e.target.value; }));

  $('btnExport').addEventListener('click', exportDialog);

  $('btnImport').addEventListener('click',()=>$('fileIn').click());
  $('fileIn').addEventListener('change', e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      let inc=null;
      try{ inc=readImport(JSON.parse(rd.result)); }catch(err){ inc=null; }
      if(!inc){ flash("That file isn't a Room Planner export"); return; }
      importDialog(inc);
    };
    rd.readAsText(f);
    e.target.value='';
  });
}

export {bindHeader};
