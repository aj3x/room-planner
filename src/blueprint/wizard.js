import {svgI} from '../ui/modal.js';
import {esc} from '../ui/panels.js';

/* ---- blueprint: wizard shell ----
   Four steps, one badge list. A step already passed (index < active) reads as done;
   the wizard is strictly linear, including via Back, so nothing can be "done" out of
   order. */
const BP_WIZARD_STEPS=['Upload','Crop','Scale','Review'];
function bpStepperHTML(active){
  return `<ol class="wizard-steps">${BP_WIZARD_STEPS.map((label,i)=>{
    const state = i<active ? 'done' : i===active ? 'active' : 'upcoming';
    const last = i===BP_WIZARD_STEPS.length-1;
    return `<li data-state="${state}">
      <span class="num">${state==='done'?svgI('check'):i+1}</span>
      <span class="lbl">${esc(label)}</span>
      ${last?'':'<span class="bar"></span>'}
    </li>`;
  }).join('')}</ol>`;
}

export {BP_WIZARD_STEPS, bpStepperHTML};
