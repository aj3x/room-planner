// @ts-check
/* The canvas's toast: what flash() last said, up for as long as it reads. */
import {toast} from './flash.js';

function Toast(){
  const t=toast.value;
  return <div class={'toast'+(t.on?' on':'')} id="flash" role="status" aria-live="polite">{t.msg}</div>;
}

export {Toast};
