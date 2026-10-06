// @ts-check
/* The item editor: the same dialog Furniture mode's "New item" and the
   Library's edit both open. It commits through transact('lib'); the item
   list, the Selection panel and the Library grid are effects on that scope
   and repaint themselves, so this module names none of them. */
import {useRef, useState} from 'preact/hooks';
import {normHex} from '../../kernel/color.js';
import {idFolder, idLeaf, idProblem, retagItem} from '../../kernel/ids.js';
import {hasOpen, normOpen} from '../../kernel/model/open-state.js';
import {PALETTE, S, isCanvasMode, itemOf, uid} from '../../kernel/state.js';
import {transact} from '../../kernel/tx.js';
import {fmtLen, parseLen, unitWord} from '../../kernel/units.js';
import {applyTags, rehomeItemId} from './item-folders.js';
import {nav} from './nav.js';
import {moError, openDialog, useDialogOk} from '../../ui-kit/modal.jsx';
import {TagField} from '../../ui-kit/tag-field.jsx';

/** @typedef {import('../../kernel/types.js').Item} Item */
/** @typedef {'rect'|'ellipse'|'lshape'|'poly'} ShapeType */
/** What the shape's boxes say, as typed. @typedef {{w: string, d: string, cw: string, cd: string, corner: string, pts: string}} ShapeText */

/* ------------------------- item dialog ------------------------- */
/** @param {Item|null|undefined} it @param {keyof import('../../kernel/types.js').OpenSpec} k */
const openV = (it,k) => fmtLen((it&&it.open&&it.open[k])||0, S.unit);
/** The shape boxes for `type`, filled from the item's shape when it is of that type.
    @param {Item|null|undefined} it @param {string} type @returns {ShapeText} */
function shapeText(it, type){
  const sh = it && it.shape.type===type ? it.shape : null;
  const v=(/** @type {string} */k,/** @type {number} */def)=>{ const r=/** @type {Record<string, number>|null} */(/** @type {unknown} */(sh)); return fmtLen(r&&r[k]!==undefined?r[k]:def,S.unit); };
  return {
    w: v('w',900), d: v('d',600), cw: v('cw',400), cd: v('cd',300),
    corner: (sh && sh.type==='lshape' && sh.corner) || 'nw',
    pts: sh && sh.type==='poly'
      ? sh.points.map(p=>fmtLen(p[0],S.unit)+', '+fmtLen(p[1],S.unit)).join('\n')
      : '0, 0\n36", 0\n36", 20"\n0, 20"',
  };
}

/** @param {{label: string, id: string, value: string, set: (v: string) => void}} p */
function LenBox({label, id, value, set}){
  return <div class="field"><label for={id}>{label}</label><input type="text" class="len" id={id} value={value} onInput={e=>set(e.currentTarget.value)}/></div>;
}

/** @param {{id: string|null, newId: string}} p the item being edited (none for a new one), and the id a new one starts with */
function ItemBody({id, newId}){
  const it = id ? itemOf(id) : null;
  const [name, setName] = useState(it ? it.name : '');
  const [type, setType] = useState(/** @type {string} */(it ? it.shape.type : 'rect'));
  const [sh, setSh] = useState(() => shapeText(it, it ? it.shape.type : 'rect'));
  const [color, setColor] = useState(() => (it&&normHex(it.color)) || PALETTE[S.inventory.length%PALETTE.length]);
  /* the hex box is left alone while it is being typed in; the swatches and the picker always show the live colour */
  const [hex, setHex] = useState(color);
  const [hexBad, setHexBad] = useState(false);
  const [count, setCount] = useState(String(it&&it.count!=null?it.count:1));
  const [pass, setPass] = useState(!!(it&&it.passThrough));
  const [openOn, setOpenOn] = useState(hasOpen(it));
  const [open, setOpen] = useState(() => ({top: openV(it,'top'), bottom: openV(it,'bottom'), left: openV(it,'left'), right: openV(it,'right')}));
  const [idText, setIdText] = useState(newId);
  const tags = useRef(/** @type {(() => string[])|null} */(null));
  const adv = useRef(/** @type {HTMLDetailsElement|null} */(null));
  const advOpen = useRef(!!idProblem(newId)).current;

  /** @param {string} c */
  const pickColor = c => { setColor(c); setHex(c); setHexBad(false); };
  /** @param {Partial<ShapeText>} p */
  const shape = p => setSh(Object.assign({}, sh, p));
  /** @param {Partial<typeof open>} p */
  const opens = p => setOpen(Object.assign({}, open, p));

  useDialogOk(() => {
    /** @type {import('../../kernel/types.js').Shape} */
    let shapeV;
    if(type==='poly'){
      const pts=sh.pts.split('\n').map(line=>{
        const [a,b]=line.split(',');
        return [parseLen(a,S.unit), parseLen(b,S.unit)];
      }).filter(p=>isFinite(p[0])&&isFinite(p[1]));
      if(pts.length<3){ moError('An outline needs at least 3 corners'); return false; }
      shapeV={type:'poly', points:pts};
    } else {
      const w=parseLen(sh.w,S.unit), d=parseLen(sh.d,S.unit);
      if(!isFinite(w)||!isFinite(d)||w<=0||d<=0){ moError('Width and depth must be positive'); return false; }
      if(type==='lshape') shapeV={type,w,d,
        cw:Math.max(1,Math.min(parseLen(sh.cw,S.unit)||w/2, w-1)),
        cd:Math.max(1,Math.min(parseLen(sh.cd,S.unit)||d/2, d-1)),
        corner:/** @type {'nw'|'ne'|'se'|'sw'} */(sh.corner)};
      else shapeV={type:/** @type {'rect'|'ellipse'} */(type),w,d};
    }
    const nm=(name||'').trim()||'Untitled';
    const n=Math.max(1, Math.round(parseFloat(count))||1);
    const manualTags=tags.current ? tags.current() : [];
    const openSpec = openOn ? normOpen({
      top:parseLen(open.top,S.unit),    bottom:parseLen(open.bottom,S.unit),
      left:parseLen(open.left,S.unit),  right:parseLen(open.right,S.unit)
    }) : null;
    const nid=(idText||'').trim();
    const bad=idProblem(nid);
    if(bad){ if(adv.current) adv.current.open=true; moError(bad); return false; }
    if(S.inventory.some(x=>x.id===nid && x.id!==id)){ if(adv.current) adv.current.open=true; moError('Another item already uses that id'); return false; }
    transact('lib', ()=>{
      if(id){
        const cur=/** @type {Item} */(itemOf(id));   // editing one that exists, so it is there
        Object.assign(cur,{name:nm,color,shape:shapeV,passThrough:pass,count:n,manualTags,open:openSpec});
        applyTags(cur);
        retagItem(id,nid);
      }
      else {
        /** @type {Item} */
        const nit={id:nid,name:nm,color,shape:shapeV,passThrough:pass,count:n,manualTags,folderId:(isCanvasMode(S.mode)?null:nav.libFolderId)||null,open:openSpec,tags:[]};   // tags: applyTags fills them, next line
        applyTags(nit);
        S.inventory.push(nit);
        // an untouched id is filed under the folder it was created in, same as moving it there
        if(nit.folderId && nid===newId) rehomeItemId(nit, nit.folderId);
      }
    });
  });

  const idT=idText.trim(), idBad=idProblem(idT), idF=idFolder(idT);
  const idNote = idBad ? (idT?idBad:'') : idF ? 'Filed under '+idF+', as '+idLeaf(idT) : 'No folder — sits at the top level.';
  return <>
    <div class="field"><label for="iName">Name</label><input type="text" id="iName" value={name} placeholder="Sofa" onInput={e=>setName(e.currentTarget.value)}/></div>
    <div class="field"><label for="iShape">Shape</label><select id="iShape" value={type}
      onChange={e=>{ const t=e.currentTarget.value; setType(t); setSh(shapeText(it, t)); }}>
      <option value="rect">Rectangle</option><option value="ellipse">Circle / oval</option>
      <option value="lshape">L-shape</option><option value="poly">Custom outline</option></select></div>
    <div id="shapeFields">{type==='poly' ? <>
        <div class="field top"><label for="pPts">Corners</label>
          <textarea id="pPts" spellcheck={false} value={sh.pts} onInput={e=>shape({pts: e.currentTarget.value})}/></div>
        <p class="hint">One corner per line as <code>across, down</code>, in order around the outline.</p>
      </> : <>
        <LenBox label="Width" id="fW" value={sh.w} set={w=>shape({w})}/>
        <LenBox label="Depth" id="fD" value={sh.d} set={d=>shape({d})}/>
        {type==='lshape' ? <>
          <LenBox label="Notch across" id="fCW" value={sh.cw} set={cw=>shape({cw})}/>
          <LenBox label="Notch down" id="fCD" value={sh.cd} set={cd=>shape({cd})}/>
          <div class="field"><label for="fCorner">Notch at</label><select id="fCorner" value={sh.corner} onChange={e=>shape({corner: e.currentTarget.value})}>
            <option value="nw">Top left</option><option value="ne">Top right</option>
            <option value="se">Bottom right</option><option value="sw">Bottom left</option></select></div>
        </> : null}
      </>}</div>
    <p class="hint">{'Plain numbers are '+unitWord()+'; 6\'2", 30in, 75cm and 1.2m also work.'}</p>
    <div class="field mt"><label>Colour</label><div class="swatches" id="iSwatches">
      {PALETTE.map(c=><button key={c} type="button" data-c={c} style={'background:'+c} aria-pressed={c===color} title={c} onClick={()=>pickColor(c)}></button>)}
    </div></div>
    <div class="field"><label for="iHex">Custom</label>
      <input type="color" id="iColPick" aria-label="Pick a colour" value={color} onInput={e=>pickColor(normHex(e.currentTarget.value)||color)}/>
      <input type="text" class={'hex'+(hexBad?' bad':'')} id="iHex" maxLength={7} spellcheck={false} placeholder="#6e8b7a" value={hex}
        onInput={e=>{ const v=e.currentTarget.value, c=normHex(v); setHex(v); setHexBad(!c); if(c) setColor(c); }}
        onChange={()=>pickColor(color)} onBlur={()=>pickColor(color)}/></div>
    <div class="field"><label for="iCount">Owned</label><input type="number" id="iCount" min="1" step="1" value={count} onInput={e=>setCount(e.currentTarget.value)}/></div>
    <label class="stack-label mt" for="iTagsInput">Tags</label>
    <TagField id="iTags" initialTags={(it&&it.manualTags)||[]} placeholder="living room, seating, IKEA" read={tags}/>
    <p class="hint">Tab or comma adds a tag. Tags filter the item list.</p>

    <div class="group">
      <p class="group-title">Behaviour</p>
      <label class="check"><input type="checkbox" id="iPass" checked={pass} onChange={e=>setPass(e.currentTarget.checked)}/>Other items can sit on it (rugs, mats)</label>
      <label class="check"><input type="checkbox" id="iOpenOn" checked={openOn} onChange={e=>setOpenOn(e.currentTarget.checked)}/>Opens out when in use (drawers, leaves, recliners)</label>
      <div id="openFields" class="sub" hidden={!openOn}>
        <LenBox label="Up" id="oTop" value={open.top} set={top=>opens({top})}/>
        <LenBox label="Down" id="oBottom" value={open.bottom} set={bottom=>opens({bottom})}/>
        <LenBox label="Left" id="oLeft" value={open.left} set={left=>opens({left})}/>
        <LenBox label="Right" id="oRight" value={open.right} set={right=>opens({right})}/>
        <p class="hint">How far it reaches past its footprint, before turning — a dresser with 20" drawers opens down 20". This only warns; it never blocks a placement.</p>
      </div>
    </div>

    <details class="adv" open={advOpen} ref={adv}>
      <summary>Advanced</summary>
      <div class="advbody">
        <div class="field"><label for="iId">Id</label><input type="text" class={'id'+(idBad && idT ? ' bad' : '')} id="iId" spellcheck={false} autocapitalize="off" autocorrect="off" value={idText} onInput={e=>setIdText(e.currentTarget.value)}/></div>
        <p class="hint">{idNote}</p>
        <p class="hint">Letters, digits and <code>! - _ . * ' ( )</code>. A <code>/</code> files it like a folder, so <code>ikea/kallax/4x2</code> and <code>ikea/kallax/2x4</code> sit together. Rooms using it follow a rename.</p>
      </div>
    </details>
  </>;
}

/** Add an item (no id) or edit one. @param {string|null} [id] */
function itemDialog(id){
  const it=id?itemOf(id):null;
  openDialog({title: it?'Edit “'+it.name+'”':'New item', ok: 'Save', body: <ItemBody id={it ? it.id : null} newId={it ? it.id : uid()}/>});
}
export {itemDialog};
