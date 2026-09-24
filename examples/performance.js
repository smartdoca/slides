import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { PresentationWorkspace } from '@eppt/editor';
import { createPresentation, createTextElement, createYDocument, EditorController, readDocument, SlidePreviewStore, pxToEmu } from '@eppt/editor/core';
import '@eppt/editor/styles.css';
const h=React.createElement, frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
function Bench(){
 const [test,setTest]=useState(null),[report,setReport]=useState('请选择隔离压测规模'),ref=useRef();
 async function load(pages){
  setReport('正在加载'); await frame(); const t=performance.now();
  if(test){test.a.destroy();test.b.destroy();test.c.dispose();test.cache.dispose();}
  const model=createPresentation();model.slides={};model.slideOrder=[];
  const count=pages===100 ? 100:20;
  for(let i=0;i<pages;i++){
   const id=`perf-${i}`,slide={id,background:'#fff',elementOrder:[],elements:{}};
   for(let j=0;j<count;j++){
    const el=createTextElement(`中文 ${i+1}/${j+1}`);el.transform={x:pxToEmu(35+(j%5)*240),y:pxToEmu(25+Math.floor(j/5)*30),width:pxToEmu(230),height:pxToEmu(30),rotation:0};el.paragraphs[0].children[0].fontSize=16;
    slide.elementOrder.push(el.id);slide.elements[el.id]=el;
   }model.slides[id]=slide;model.slideOrder.push(id);
  }
  const a=createYDocument(model),b=new Y.Doc();Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const cache=new SlidePreviewStore(b),c=new EditorController(a);
  const state={a,b,c,cache,model,writes:0};
  a.on('update',(u,o)=>{if(o!=='remote'){state.writes++;Y.applyUpdate(b,u,'remote');}});
  b.on('update',(u,o)=>{if(o!=='remote')Y.applyUpdate(a,u,'remote');});
  setTest(state);await frame();
  setReport(JSON.stringify({phase:'loaded',pages,elements:pages*count,modelToTwoFramesMs:Math.round(performance.now()-t),previews:document.querySelectorAll('.eppt-preview').length,domNodes:document.querySelectorAll('*').length},null,2));
 }
 async function edit(){
  const durations=[],commands=[],gaps=[];let running=true,last=performance.now();
  const tick=t=>{if(!running)return;gaps.push(t-last);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  const cb=new EditorController(test.b);
  for(let i=0;i<60;i++){
   const sid=i%3===0?'perf-0':`perf-${test.model.slideOrder.length-1}`,id=test.model.slides[sid].elementOrder[0];
   const t=performance.now();(i%2?test.c:cb).patch(sid,id,{fill:`#${(0x123400+i).toString(16)}`});commands.push(performance.now()-t);await frame();durations.push(performance.now()-t);await new Promise(r=>setTimeout(r,40));
  }
  running=false;cb.dispose();
  const p95=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length*.95)];
  setReport(JSON.stringify({phase:'edited',samples:60,commandP95Ms:+p95(commands).toFixed(1),twoFrameP95Ms:+p95(durations).toFixed(1),frameGapP95Ms:+p95(gaps).toFixed(1),frameGapMaxMs:+Math.max(...gaps).toFixed(1),framesOver50ms:gaps.filter(t=>t>50).length,converged:JSON.stringify(readDocument(test.a))===JSON.stringify(readDocument(test.b)),previews:document.querySelectorAll('.eppt-preview').length,domNodes:document.querySelectorAll('*').length},null,2));
 }
 async function idle(){const before=test.writes;setReport('60 秒选区、滚动、面板切换零写入测试中');for(let i=0;i<12;i++){const sid=`perf-${i%2?test.model.slideOrder.length-1:0}`;ref.current.revealAnchor({type:'element',slideId:sid,elementId:test.model.slides[sid].elementOrder[0]});ref.current.setPanels({properties:i%2===0});document.querySelector('.eppt-slides')?.scrollBy(0,300);await new Promise(r=>setTimeout(r,5000));}setReport(JSON.stringify({phase:'idle',seconds:60,contentUpdates:test.writes-before,previews:document.querySelectorAll('.eppt-preview').length,domNodes:document.querySelectorAll('*').length},null,2));}
 return h('div',{style:{height:'100vh',display:'flex',flexDirection:'column'}},h('div',{style:{padding:8,background:'#eef2ff'}},h('button',{onClick:()=>load(100)},'加载 100 页 / 10000 元素'),h('button',{onClick:()=>load(500)},'加载 500 页 / 10000 元素'),h('button',{disabled:!test,onClick:edit},'测试 60 次双向协作编辑'),h('button',{disabled:!test,onClick:idle},'60 秒无正文操作测试'),h('pre',{style:{maxHeight:180,overflow:'auto',margin:4}},report)),test&&h('div',{style:{flex:1,minHeight:0}},h(PresentationWorkspace,{key:test.model.id,document:test.a,ref})));
}createRoot(document.getElementById('root')).render(h(Bench));
