import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const fixture=fs.readFileSync('tmp/shipping-viewer-check/main.tsx','utf8').replaceAll("from '/src/","from '../../src/").replaceAll("from '/supabase/","from '../../supabase/").replaceAll("import '/src/","import '../../src/");
fs.writeFileSync('tmp/shipping-viewer-check/offline.tsx',fixture);
const result=await build({entryPoints:['tmp/shipping-viewer-check/offline.tsx'],bundle:true,write:false,outdir:'tmp/shipping-viewer-check/bundle',jsx:'automatic',external:['/module-hub-background.png'],loader:{'.woff':'dataurl','.woff2':'dataurl'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const check=`
const wait=()=>new Promise(r=>setTimeout(r,200));
setTimeout(async()=>{try{
const assert=(v,m)=>{if(!v)throw Error(m)};
assert(document.querySelectorAll('.shipping-3d-package-picker button').length===2,'packages');
document.querySelectorAll('.shipping-3d-package-picker button')[1].click();await wait();
const initial=document.querySelector('canvas').toDataURL();assert(initial.length>3000,'canvas');
document.querySelector('.shipping-3d-controls button:nth-child(2)').click();await wait();
assert(document.querySelector('canvas').toDataURL()!==initial,'top view');
document.querySelector('.shipping-3d-controls button').click();await wait();
assert(document.querySelector('.shipping-3d-controls button').textContent.includes('opaca'),'opacity');
document.querySelector('.shipping-3d-controls button').click();
const select=document.querySelector('.shipping-3d-summary select');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));await wait();
assert(!document.querySelector('.shipping-3d-selection').textContent.includes('Selecciona'),'selection');
const cut=document.querySelector('.shipping-cut-proposal input');assert(cut,'cut proposal');
assert(cut.checked,'default cut enabled');cut.click();await wait();
assert(!document.querySelector('.shipping-cut-proposal strong'),'cut disabled');
const beforeCut=document.querySelector('canvas').toDataURL();cut.click();await wait();
assert(document.querySelector('.shipping-cut-proposal strong').textContent.includes('altura'),'cut height');
assert(document.querySelector('canvas').toDataURL()!==beforeCut,'cut overlay');
assert(document.documentElement.scrollWidth<=innerWidth+1,'horizontal overflow');
document.body.dataset.testResult='PASS';
}catch(e){document.body.dataset.testResult='FAIL: '+e.message;}},500);`;
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body style="margin:0;background:#f4f7fb"><div id="root"></div><script>window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);window.addEventListener("error",e=>document.body.dataset.jsError=e.message)</script><script>'+js.replaceAll('</script','<\\/script')+'</script><script>'+check+'</script></body></html>';
fs.writeFileSync('tmp/shipping-viewer-check/offline.html',html);
for(const width of [1200,390,320]){
const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-renderer-backgrounding','--run-all-compositor-stages-before-draw','--no-first-run','--no-default-browser-check','--allow-file-access-from-files',
'--user-data-dir='+path.resolve('tmp/shipping-viewer-check/offline-profile-'+width),'--window-size='+width+',1000','--virtual-time-budget=4000','--dump-dom',pathToFileURL(path.resolve('tmp/shipping-viewer-check/offline.html')).href];
const child=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
const timer=setTimeout(()=>child.kill(),20000);
await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(timer);
const result=out.match(/data-test-result="([^"]+)"/)?.[1];
if(result!=='PASS'){fs.writeFileSync('tmp/shipping-viewer-check/offline-result.html',out);throw Error('Chrome '+width+': '+(result??err.slice(-500))+' JS: '+out.match(/data-js-error="([^"]+)"/)?.[1]);}
console.log('Chrome offline '+width+'px: PASS (canvas, packages, top view, opacity, selection, layout).');
}
