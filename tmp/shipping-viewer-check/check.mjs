import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-gpu','--remote-debugging-port=9338',
  '--user-data-dir='+path.resolve('tmp/shipping-viewer-check/chrome-profile'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let browserError='';browser.stderr.on('data',b=>{browserError+=b;});browser.on('error',e=>{browserError+=e.message;});
let ws;
try{
let targets;
for(let i=0;i<80;i++){try{targets=await(await fetch('http://127.0.0.1:9338/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await sleep(150);}
if(!targets)throw Error('Chrome unavailable: '+browserError.slice(-2000));
ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0;const waiting=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=waiting.get(m.id);if(p){waiting.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+m.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:5188/tmp/shipping-viewer-check/index.html'});
for(let i=0;i<80;i++){if(await evaluate('!!document.querySelector("canvas")'))break;await sleep(150);}
await sleep(400);
const assert=(v,message)=>{if(!v)throw Error(message);};
assert(await evaluate('document.querySelectorAll(".shipping-3d-package-picker button").length===2'),'Two packages expected');
await evaluate('document.querySelectorAll(".shipping-3d-package-picker button")[1].click()');await sleep(150);
const initial=await evaluate('document.querySelector("canvas").toDataURL()');
assert(initial.length>3000,'Canvas is empty');
await evaluate('document.querySelector(".shipping-3d-controls button:nth-child(2)").click()');await sleep(150);
assert(initial!==await evaluate('document.querySelector("canvas").toDataURL()'),'Top view does not change rendering');
await evaluate('document.querySelector(".shipping-3d-controls button").click()');await sleep(150);
assert(await evaluate('document.querySelector(".shipping-3d-controls button").textContent.includes("opaca")'),'Opacity toggle failed');
await evaluate('document.querySelector(".shipping-3d-controls button").click(); const s=document.querySelector(".shipping-3d-summary select");s.value=s.options[1].value;s.dispatchEvent(new Event("change",{bubbles:true}))');await sleep(150);
assert(await evaluate('!document.querySelector(".shipping-3d-selection").textContent.includes("Selecciona")'),'Product selection failed');
await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync('tmp/shipping-viewer-check/desktop.png',Buffer.from(r.data,'base64')));
for(const width of [768,390,320]){
await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await sleep(200);
assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),'Horizontal overflow at '+width);
}
await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync('tmp/shipping-viewer-check/mobile.png',Buffer.from(r.data,'base64')));
assert(errors.length===0,errors.join('\n'));
console.log('Chrome: two packages, canvas render, top view, opacity, selection; no runtime errors or overflow at 1200/768/390/320px.');
await send('Browser.close').catch(()=>{});
}finally{ws?.close();browser.kill();}
