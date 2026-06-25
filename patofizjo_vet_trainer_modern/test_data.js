const fs = require('fs');
global.window = {};
eval(fs.readFileSync(__dirname + '/data.js','utf8'));
const DATA = window.PATOFIZJO_DATA;
const errors=[];
function norm(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ')}
DATA.items.forEach(it=>{
  if(!it.id || !it.question || !it.answer) errors.push(`Q${it.id}: missing core`);
  if(!Array.isArray(it.order)||it.order.length<2) errors.push(`Q${it.id}: order blocks <2`);
  (it.order||[]).forEach((b,i)=>{ if(!b || b.length<10) errors.push(`Q${it.id}: short order block ${i}`); });
  if(!it.cloze || !Array.isArray(it.cloze.blanks)||it.cloze.blanks.length<3) errors.push(`Q${it.id}: bad cloze`);
  else {
    it.cloze.blanks.forEach((b,i)=>{
      if(!it.cloze.template.includes(`{{${i}}}`)) errors.push(`Q${it.id}: missing placeholder ${i}`);
      if(!b.answer) errors.push(`Q${it.id}: blank ${i} no answer`);
      // ensure answer term appears in original answer (case-insensitive), otherwise that would be dangerous
      if(b.answer && !norm(it.answer).includes(norm(b.answer))) errors.push(`Q${it.id}: blank answer not in own answer: ${b.answer}`);
    });
  }
  if(!Array.isArray(it.mcq)||it.mcq.length<1) errors.push(`Q${it.id}: no mcq`);
  else it.mcq.forEach((q,j)=>{
    if(!Array.isArray(q.options)||q.options.length!==4) errors.push(`Q${it.id}: mcq ${j} not 4 opts`);
    if(q.answerIndex<0||q.answerIndex>3) errors.push(`Q${it.id}: mcq ${j} bad index`);
    const correct=q.options[q.answerIndex];
    if(!correct) errors.push(`Q${it.id}: mcq ${j} missing correct`);
    // correct should be from its own answer or order chunk
    if(correct && !norm(it.answer).includes(norm(correct).replace('…','').slice(0,40))) errors.push(`Q${it.id}: mcq ${j} correct not from own answer`);
    if(new Set(q.options).size !== q.options.length) errors.push(`Q${it.id}: mcq ${j} duplicate options`);
  });
});
console.log(JSON.stringify({items: DATA.items.length, errors: errors.slice(0,100), errorCount: errors.length}, null, 2));
process.exit(errors.length?1:0);
