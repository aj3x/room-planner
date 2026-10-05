// @ts-check
/* ---- blueprint: wizard shell ----
   Four steps, one badge list. A step already passed (index < active) reads as done;
   the wizard is strictly linear, including via Back, so nothing can be "done" out of
   order. */
import {Icon} from '../../ui-kit/parts.jsx';

const BP_WIZARD_STEPS=['Upload','Crop','Scale','Review'];
/** @param {{active: number}} p */
function Stepper({active}){
  return <ol class="wizard-steps">{BP_WIZARD_STEPS.map((label,i)=>{
    const state = i<active ? 'done' : i===active ? 'active' : 'upcoming';
    const last = i===BP_WIZARD_STEPS.length-1;
    return <li key={label} data-state={state}>
      <span class="num">{state==='done' ? <Icon name="check"/> : i+1}</span>
      <span class="lbl">{label}</span>
      {last ? null : <span class="bar"></span>}
    </li>;
  })}</ol>;
}

export {BP_WIZARD_STEPS, Stepper};
