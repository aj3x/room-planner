// @ts-check
/* The item editor: the same modal Furniture mode's "Add a thing" and the
   Library tab's edit both open. It commits through transact('lib'); the item
   list, the Selection panel and the Library grid are effects on that scope
   and repaint themselves, so this module names none of them.

   dlgColor is written only from inside itemDialog and its mounted listeners,
   so it is a plain module-private `let`.
*/
import {normHex} from '../../kernel/color.js';
import {idFolder, idLeaf, idProblem, retagItem} from '../../kernel/ids.js';
import {hasOpen, normOpen} from '../../kernel/open-state.js';
import {PALETTE, S, isCanvasMode, itemOf, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen, unitWord} from '../../kernel/units.js';
import {applyTags, rehomeItemId} from './item-folders.js';
import {nav} from './nav.js';
import {$, moError, openModal} from '../../ui-kit/modal.js';
import {esc} from '../../ui-kit/panels.js';
import {mountTagField, tagFieldHTML, tagFieldValue} from '../../ui-kit/tag-input.js';

/* ------------------------- item dialog ------------------------- */
let dlgColor=PALETTE[0];
/** @param {import('../../kernel/types.js').Item|null|undefined} it @param {keyof import('../../kernel/types.js').OpenSpec} k */
const openV = (it,k) => fmtLen((it&&it.open&&it.open[k])||0, S.unit);
/** @param {string} type @param {import('../../kernel/types.js').Shape|null} sh the item's shape, when it is of this type */
function shapeFieldHTML(type,sh){
  const v=(/** @type {string} */k,/** @type {number} */def)=>{ const r=/** @type {Record<string, number>|null} */(sh); return fmtLen(r&&r[k]!==undefined?r[k]:def,S.unit); };
  if(type==='poly'){
    const pts = sh&&sh.type==='poly'
      ? sh.points.map(p=>fmtLen(p[0],S.unit)+', '+fmtLen(p[1],S.unit)).join('\n')
      : '0, 0\n36", 0\n36", 20"\n0, 20"';
    return `<div class="field top"><label for="pPts">Corners</label>
      <textarea id="pPts" spellcheck="false">${esc(pts)}</textarea></div>
      <p class="hint">One corner per line as <code>across, down</code>, in order around the outline.</p>`;
  }
  let h=`<div class="field"><label for="fW">Width</label><input type="text" class="len" id="fW" value="${esc(v('w',900))}"></div>
         <div class="field"><label for="fD">Depth</label><input type="text" class="len" id="fD" value="${esc(v('d',600))}"></div>`;
  if(type==='lshape'){
    h+=`<div class="field"><label for="fCW">Notch across</label><input type="text" class="len" id="fCW" value="${esc(v('cw',400))}"></div>
        <div class="field"><label for="fCD">Notch down</label><input type="text" class="len" id="fCD" value="${esc(v('cd',300))}"></div>
        <div class="field"><label for="fCorner">Notch at</label><select id="fCorner">
          <option value="nw">Top left</option><option value="ne">Top right</option>
          <option value="se">Bottom right</option><option value="sw">Bottom left</option></select></div>`;
  }
  return h;
}

/** Add an item (no id) or edit one. @param {string|null} [id] */
function itemDialog(id){
  const it=id?itemOf(id):null;
  dlgColor = (it&&normHex(it.color)) || PALETTE[S.inventory.length%PALETTE.length];
  const dlgId = it ? it.id : uid();
  const type0 = it?it.shape.type:'rect';
  openModal(it?'Edit “'+it.name+'”':'New item', `
    <div class="field"><label for="iName">Name</label><input type="text" id="iName" value="${esc(it?it.name:'')}" placeholder="Sofa"></div>
    <div class="field"><label for="iShape">Shape</label><select id="iShape">
      <option value="rect">Rectangle</option><option value="ellipse">Circle / oval</option>
      <option value="lshape">L-shape</option><option value="poly">Custom outline</option></select></div>
    <div id="shapeFields"></div>
    <p class="hint">Plain numbers are ${unitWord()}; 6'2", 30in, 75cm and 1.2m also work.</p>
    <div class="field mt"><label>Colour</label><div class="swatches" id="iSwatches"></div></div>
    <div class="field"><label for="iHex">Custom</label><input type="color" id="iColPick" aria-label="Pick a colour"><input type="text" class="hex" id="iHex" maxlength="7" spellcheck="false" placeholder="#6e8b7a"></div>
    <div class="field"><label for="iCount">Owned</label><input type="number" id="iCount" min="1" step="1" value="${it&&it.count!=null?it.count:1}"></div>
    <label class="stack-label mt" for="iTagsInput">Tags</label>
    ${tagFieldHTML('iTags','living room, seating, IKEA')}
    <p class="hint">Tab or comma adds a tag. Tags filter the item list.</p>

    <div class="group">
      <p class="group-title">Behaviour</p>
      <label class="check"><input type="checkbox" id="iPass" ${it&&it.passThrough?'checked':''}>Other items can sit on it (rugs, mats)</label>
      <label class="check"><input type="checkbox" id="iOpenOn" ${hasOpen(it)?'checked':''}>Opens out when in use (drawers, leaves, recliners)</label>
      <div id="openFields" class="sub" ${hasOpen(it)?'':'hidden'}>
        <div class="field"><label for="oTop">Up</label><input type="text" class="len" id="oTop" value="${esc(openV(it,'top'))}"></div>
        <div class="field"><label for="oBottom">Down</label><input type="text" class="len" id="oBottom" value="${esc(openV(it,'bottom'))}"></div>
        <div class="field"><label for="oLeft">Left</label><input type="text" class="len" id="oLeft" value="${esc(openV(it,'left'))}"></div>
        <div class="field"><label for="oRight">Right</label><input type="text" class="len" id="oRight" value="${esc(openV(it,'right'))}"></div>
        <p class="hint">How far it reaches past its footprint, before turning — a dresser with 20" drawers opens down 20". This only warns; it never blocks a placement.</p>
      </div>
    </div>

    <details class="adv"${idProblem(dlgId)?' open':''}>
      <summary>Advanced</summary>
      <div class="advbody">
        <div class="field"><label for="iId">Id</label><input type="text" class="id" id="iId" spellcheck="false" autocapitalize="off" autocorrect="off" value="${esc(dlgId)}"></div>
        <p class="hint" id="iIdNote"></p>
        <p class="hint">Letters, digits and <code>! - _ . * ' ( )</code>. A <code>/</code> files it like a folder, so <code>ikea/kallax/4x2</code> and <code>ikea/kallax/2x4</code> sit together. Rooms using it follow a rename.</p>
      </div>
    </details>
`,
    'Save',
    ()=>{
      const type=$('iShape').value;
      /** @type {import('../../kernel/types.js').Shape} */
      let shape;
      if(type==='poly'){
        const pts=$('pPts').value.split('\n').map((/** @type {string} */line)=>{
          const [a,b]=line.split(',');
          return [parseLen(a,S.unit), parseLen(b,S.unit)];
        }).filter((/** @type {number[]} */p)=>isFinite(p[0])&&isFinite(p[1]));
        if(pts.length<3){ moError('An outline needs at least 3 corners'); return false; }
        shape={type:'poly', points:pts};
      } else {
        const w=parseLen($('fW').value,S.unit), d=parseLen($('fD').value,S.unit);
        if(!isFinite(w)||!isFinite(d)||w<=0||d<=0){ moError('Width and depth must be positive'); return false; }
        if(type==='lshape') shape={type,w,d,
          cw:Math.max(1,Math.min(parseLen($('fCW').value,S.unit)||w/2, w-1)),
          cd:Math.max(1,Math.min(parseLen($('fCD').value,S.unit)||d/2, d-1)),
          corner:$('fCorner').value};
        else shape={type,w,d};
      }
      const name=($('iName').value||'').trim()||'Untitled';
      const count=Math.max(1, Math.round(parseFloat($('iCount').value))||1);
      const manualTags=tagFieldValue('iTags');
      const open = $('iOpenOn').checked ? normOpen({
        top:parseLen($('oTop').value,S.unit),    bottom:parseLen($('oBottom').value,S.unit),
        left:parseLen($('oLeft').value,S.unit),  right:parseLen($('oRight').value,S.unit)
      }) : null;
      const newId=($('iId').value||'').trim();
      const bad=idProblem(newId);
      if(bad){ $('iId').closest('details').open=true; moError(bad); return false; }
      if(S.inventory.some(x=>x.id===newId && x.id!==id)){ $('iId').closest('details').open=true; moError('Another item already uses that id'); return false; }
      transact('lib', ()=>{
        if(id){
          const cur=/** @type {import('../../kernel/types.js').Item} */(itemOf(id));   // editing one that exists, so it is there
          Object.assign(cur,{name,color:dlgColor,shape,passThrough:$('iPass').checked,count,manualTags,open});
          applyTags(cur);
          retagItem(id,newId);
        }
        else {
          /** @type {import('../../kernel/types.js').Item} */
          const nit={id:newId,name,color:dlgColor,shape,passThrough:$('iPass').checked,count,manualTags,folderId:(isCanvasMode(S.mode)?null:nav.libFolderId)||null,open,tags:[]};   // tags: applyTags fills them, next line
          applyTags(nit);
          S.inventory.push(nit);
          // an untouched id is filed under the folder it was created in, same as moving it there
          if(nit.folderId && newId===dlgId) rehomeItemId(nit, nit.folderId);
        }
      });
    },
    ()=>{
      const sel2=$('iShape');
      sel2.value=type0;
      const fill=()=>{
        const t=sel2.value, sh=it&&it.shape.type===t?it.shape:null;
        $('shapeFields').innerHTML=shapeFieldHTML(t,sh);
        if(t==='lshape'&&sh) $('fCorner').value=/** @type {{corner?: string}} */(sh).corner;
      };
      sel2.addEventListener('change',fill);
      fill();
      const sw=$('iSwatches'), pick=$('iColPick'), hx=$('iHex');
      /* swatches + picker always show the live colour; the hex box is left alone while it's being typed in */
      const syncSw=()=>{
        sw.innerHTML=PALETTE.map(c=>`<button type="button" data-c="${c}" style="background:${c}" aria-pressed="${c===dlgColor}" title="${c}"></button>`).join('');
        pick.value=dlgColor;
      };
      const paint=()=>{ syncSw(); hx.value=dlgColor; hx.classList.remove('bad'); };
      sw.addEventListener('click',(/** @type {MouseEvent} */e)=>{ const b=/** @type {Element} */(e.target).closest('button'); if(b){ dlgColor=/** @type {string} */(b.dataset.c); paint(); } });
      pick.addEventListener('input',()=>{ dlgColor=normHex(pick.value)||dlgColor; paint(); });
      hx.addEventListener('input',()=>{ const c=normHex(hx.value); hx.classList.toggle('bad',!c); if(c){ dlgColor=c; syncSw(); } });
      hx.addEventListener('change',paint);
      hx.addEventListener('blur',paint);
      paint();
      const oc=$('iOpenOn');
      oc.addEventListener('change',()=>{ $('openFields').hidden=!oc.checked; });
      mountTagField('iTags', (it&&it.manualTags)||[]);
      const idIn=$('iId'), idNote=$('iIdNote');
      const sayId=()=>{
        const v=idIn.value.trim(), bad=idProblem(v);
        idIn.classList.toggle('bad', !!bad && !!v);
        if(bad){ idNote.textContent=v?bad:''; return; }
        const f=idFolder(v);
        idNote.textContent = f ? 'Filed under '+f+', as '+idLeaf(v) : 'No folder — sits at the top level.';
      };
      idIn.addEventListener('input',sayId);
      sayId();
    });
}
export {itemDialog};
