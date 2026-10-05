// @ts-check
/* The tick-box list Export and Import share (and the Library's export and
   a floor's rooms): a head with All and None, and a row per thing. A row
   can be locked — ticked and not un-tickable — which is how a room drags
   the items standing in it along. The list holds no state: what is ticked
   is the dialog's, handed in and handed back. */

/** A row of a tick-box list. @typedef {{value: string, label: string, sub?: string}} PickRow */

/** @param {{title: string, rows: PickRow[], ticked: Set<string>, locked?: Set<string>, emptyMsg?: string,
      onChange: (ticked: Set<string>) => void}} p */
function Picker({title, rows, ticked, locked, emptyMsg, onChange}){
  const isLocked = (/** @type {string} */v) => !!locked && locked.has(v);
  /* a locked row is ticked whatever All or None say */
  /** @param {boolean} on */
  const all = on => onChange(new Set(rows.filter(r=>on || isLocked(r.value)).map(r=>r.value)));
  return <div class="picker">
    <div class="picker-head"><span class="grow">{title}</span>
      <button type="button" class="btn quiet sm" onClick={()=>all(true)}>All</button>
      <button type="button" class="btn quiet sm" onClick={()=>all(false)}>None</button></div>
    <div class="picker-body">{rows.length
      ? rows.map(r=>{
          const lock=isLocked(r.value);
          return <label key={r.value} class={'pick'+(lock?' locked':'')}>
            <input type="checkbox" value={r.value} checked={lock || ticked.has(r.value)} disabled={lock}
              onChange={e=>{ const s=new Set(ticked); if(e.currentTarget.checked) s.add(r.value); else s.delete(r.value); onChange(s); }}/>
            <span class="nm" title={r.label}>{r.label}</span>
            {r.sub ? <span class="dim" title={r.sub}>{r.sub}</span> : null}
          </label>;
        })
      : <div class="empty">{emptyMsg||'Nothing here'}</div>}</div>
  </div>;
}

export {Picker};
