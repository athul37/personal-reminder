// Payments Ahead: app logic. Loaded as an external file so the Content Security Policy can forbid inline scripts.
{
if(window.top!==window.self){/* never run inside another site's frame (clickjacking protection) */
 document.body.replaceChildren();const a=document.createElement('a');a.href=location.href;a.target='_top';a.rel='noopener';a.textContent='Open Payments Ahead';
 a.style.cssText='display:block;padding:24px;font:17px system-ui,sans-serif';document.body.append(a);throw new Error('Payments Ahead will not run inside a frame')}
const CFG=window.PA_CONFIG||{};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const CATS=['Home','Utility','Subscription','Phone','Insurance','Loan / EMI','Credit Card','Tax','Renewal','Fees','Investment','Other'];
const EVERY=[[1,'Monthly'],[-2,'Every Few Months'],[3,'Every 3 Months'],[6,'Every 6 Months'],[12,'Yearly'],[-1,'Every Few Years'],[0,'Never (One Time)']];
const REMS=[0,1,2,3,5,7,14,30,60,90,180];
const PRESETS=[['Rent','Home',1,3],['Electricity','Utility',1,3],['Mobile Recharge','Phone',1,2],['Broadband','Utility',1,3],['Credit Card Bill','Credit Card',1,5],['Loan EMI','Loan / EMI',1,3],['Health Insurance','Insurance',12,30],['Term Insurance','Insurance',12,30],['Vehicle Insurance','Insurance',12,30],['Property Tax','Tax',12,30],['Advance Tax','Tax',3,14],['Passport Renewal','Renewal',120,180],['Driving Licence Renewal','Renewal',240,90],['Domain & Hosting','Subscription',12,14]];
const SCOPE_BASE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email openid';
const SCOPE_CAL='https://www.googleapis.com/auth/calendar.app.created';
const FILE='payments-ahead.json';
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata';
const CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- input validation: everything read from Drive, browser storage or an imported file is cleaned before use ---------- */
const DATE_RE=/^\d{4}-\d\d-\d\d$/,CURS=['INR','USD','EUR','GBP','AED','SAR'];
const str=(v,n)=>String(v??'').slice(0,n),num=(v,lo,hi)=>{v=+v;return Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):lo};
function cleanItem(i,k){if(!i||typeof i!=='object'||!DATE_RE.test(i.due)||!String(i.name??'').trim())return null;
 const o={id:str(i.id,40).replace(/[^\w-]/g,'')||'p'+k,name:str(i.name,120).trim(),cat:CATS.includes(i.cat)?i.cat:'Other',amt:num(i.amt,0,1e12),
  every:Math.round(num(i.every,0,1200)),due:i.due,remind:Math.round(num(i.remind,0,3650)),auto:!!i.auto,notes:str(i.notes,500)};
 if(DATE_RE.test(i.last))o.last=i.last;return o}
function cleanState(s){if(!s||typeof s!=='object')return null;
 const cal=s.cal&&typeof s.cal==='object'?{on:!!s.cal.on,...(typeof s.cal.id==='string'?{id:s.cal.id}:{}),ev:s.cal.ev&&typeof s.cal.ev==='object'?s.cal.ev:{}}:null;
 return{v:1,items:(Array.isArray(s.items)?s.items:[]).slice(0,5000).map(cleanItem).filter(Boolean),cur:CURS.includes(s.cur)?s.cur:'INR',cal,t:num(s.t,0,9e15),dirty:!!s.dirty}}

let S={v:1,items:[],cur:'INR',cal:null,t:0};
let mode=null,token=null,tokenExp=0,user=null,fileId=null,filter='All',undoStack=[],editing=null,pending=false,saving=false,lastSaved=null,calBusy=false;

/* ---------- springs (Apple: damping ratio + response; interruptible, start from the live value, carry velocity) ---------- */
function spring(from,to,{damping=1,response=.35,velocity=0,onUpdate,onDone}){
 if(RM.matches){onUpdate(to);onDone&&onDone();return{stop(){},value:()=>to}}
 const k=(2*Math.PI/response)**2,c=4*Math.PI*damping/response;let x=from,v=velocity,last=performance.now(),raf,live=true;
 const step=now=>{if(!live)return;let dt=Math.min(.064,(now-last)/1000);last=now;
  while(dt>0){const h=Math.min(dt,1/240);const a=-k*(x-to)-c*v;v+=a*h;x+=v*h;dt-=h}
  if(Math.abs(x-to)<.3&&Math.abs(v)<5){x=to;onUpdate(x);live=false;onDone&&onDone();return}
  onUpdate(x);raf=requestAnimationFrame(step)};
 raf=requestAnimationFrame(step);
 return{stop(){live=false;cancelAnimationFrame(raf)},value:()=>x,velocity:()=>v}}
const project=(v,d=.998)=>(v/1000)*d/(1-d);
const rubber=(o,dim,c=.55)=>(o*dim*c)/(dim+c*Math.abs(o));
function tracker(){const h=[];return{add(p){const t=performance.now();h.push([p,t]);while(h.length&&t-h[0][1]>100)h.shift()},v(){if(h.length<2)return 0;const[a,b]=[h[0],h[h.length-1]];return(b[0]-a[0])/Math.max(1,(b[1]-a[1]))*1000}}}
const haptic=()=>{try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}};

/* ---------- dates & formatting ---------- */
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const pd=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const days=s=>Math.round((pd(s)-today())/864e5);
const addD=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return iso(d)};
const addM=(s,m)=>{const d=pd(s),day=d.getDate();const t=new Date(d.getFullYear(),d.getMonth()+m,1);t.setDate(Math.min(day,new Date(t.getFullYear(),t.getMonth()+1,0).getDate()));return iso(t)};
const longD=s=>pd(s).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const sym=()=>{try{return(0).toLocaleString('en',{style:'currency',currency:S.cur||'INR',maximumFractionDigits:0}).replace(/[\d\s.,]/g,'')}catch(e){return''}};
const fmt=n=>{try{return new Intl.NumberFormat(S.cur==='INR'?'en-IN':'en',{style:'currency',currency:S.cur||'INR',maximumFractionDigits:0}).format(n||0)}catch(e){return String(Math.round(n||0))}};
const evLabel=m=>m===0?'One time':m===1?'Monthly':m===12?'Yearly':m%12===0?'Every '+m/12+' years':'Every '+m+' months';
const remLabel=d=>d===0?'On the Day':d===1?'1 Day Before':d<14||d%7?d+' Days Before':d===14?'2 Weeks Before':d<60?Math.round(d/30)+' Month Before':Math.round(d/30)+' Months Before';
const rel=n=>n===0?'Today':n===1?'Tomorrow':n<0?Math.abs(n)+(n===-1?' day':' days')+' overdue':n<60?'in '+n+' days':n<730?'in '+Math.round(n/30.4)+' months':'in '+(n/365.25).toFixed(1).replace('.0','')+' years';
const ORDER=['Overdue','Next 30 Days','Within 3 Months','Later This Year','Years Ahead'];
const grp=n=>n<0?ORDER[0]:n<=30?ORDER[1]:n<=90?ORDER[2]:n<=365?ORDER[3]:ORDER[4];

/* ---------- render ---------- */
function render(){
 const it=[...S.items].sort((a,b)=>a.due<b.due?-1:1);
 const nx=it.find(i=>days(i.due)>=0)||it[0];
 if(nx){const n=days(nx.due);$('next').innerHTML=`<div><div class="k">${n<0?'Overdue':'Next Up'}</div><div class="n">${esc(nx.name)}</div></div><div class="d">${n<0?Math.abs(n)+'<small> days late</small>':n===0?'Today':n+'<small> day'+(n===1?'':'s')+'</small>'}</div><div class="m"><b>${esc(fmt(nx.amt))}</b> · ${longD(nx.due)}${nx.auto?' · Autopay':''}</div>`}
 else $('next').innerHTML=`<div><div class="k">Next Up</div><div class="n">Nothing Yet</div></div><div class="m">Add your first payment and the countdown starts here.</div>`;
 const in30=it.filter(i=>days(i.due)<=30).reduce((s,i)=>s+(+i.amt||0),0),yr=it.reduce((s,i)=>s+(i.every>0?i.amt*12/i.every:0),0);
 $('stats').innerHTML=`<div><b>${esc(fmt(in30))}</b><span class="fn">Due in 30 days</span></div><div><b>${esc(fmt(yr))}</b><span class="fn">Per year</span></div><div><b>${it.filter(i=>days(i.due)>180).length}</b><span class="fn">Over 6 months away</span></div>`;
 const cats=['All',...CATS.filter(c=>S.items.some(i=>i.cat===c))];if(!cats.includes(filter))filter='All';
 $('filters').innerHTML=S.items.length>2?cats.map(c=>`<button class="chip" aria-pressed="${c===filter}" data-f="${esc(c)}">${esc(c)}</button>`).join(''):'';
 const shown=it.filter(i=>filter==='All'||i.cat===filter);
 $('hint').classList.toggle('hidden',!S.items.length);
 $('list').innerHTML=!S.items.length?`<div class="card empty" style="margin-top:22px"><h2 class="t3">No Payments Yet</h2><p class="sub">Add rent, insurance premiums, renewals — anything that comes due.</p><div class="ebtns"><button class="btn pri" data-add>Add Payment</button>${mode==='local'?'<button class="btn sec" data-samples>Show Examples</button>':''}</div></div>`:
  ORDER.map(g=>{const rows=shown.filter(i=>grp(days(i.due))===g);if(!rows.length)return'';
  return `<section class="sec"><h2><span class="t3">${g}</span><span class="sub">${esc(fmt(rows.reduce((s,i)=>s+(+i.amt||0),0)))}</span></h2><div class="list">${rows.map(i=>{const n=days(i.due),cls=n<0?'over':n<=i.remind?'soon':'';
  return `<div class="row ${cls}" data-id="${esc(i.id)}"><div class="acts" aria-hidden="true"><button class="pd" tabindex="-1" data-act="paid">${i.every?'Paid':'Done'}</button><button class="dl" tabindex="-1" data-act="del">Delete</button></div>
  <div class="rc" tabindex="0" role="button" aria-label="${esc(i.name)}, ${esc(fmt(i.amt))}, due ${longD(i.due)}, ${rel(n)}. Edit."><button class="tick" data-tick aria-label="Mark ${esc(i.name)} ${i.every?'Paid':'Done'}"><span>${CHECK}</span></button>
  <div><div class="ti">${esc(i.name)}${i.auto?'<span class="tag">Autopay</span>':''}</div><div class="sub">${evLabel(i.every)} · ${esc(i.cat)}${i.notes?' · '+esc(i.notes):''}</div></div>
  <div class="tr"><div class="a">${esc(fmt(i.amt))}</div><div class="sub">${n<0?'<span>'+rel(n)+'</span>':n<=i.remind?'<b>'+rel(n)+'</b>':longD(i.due)}</div></div></div></div>`}).join('')}</div></section>`}).join('');
 draw();status();
}
const svg=$('svg');
function xOf(n,W){const L=8,w=W-18,a=.34,b=.36;if(n<=30)return L+w*a*Math.max(0,n)/30;if(n<=365)return L+w*(a+b*(n-30)/335);return L+w*(a+b+(1-a-b)*Math.min(1,Math.log(n/365)/Math.log(10)))}
function draw(){const W=svg.clientWidth,H=svg.clientHeight;if(!W)return;const narrow=W<520,base=H-32;
 const ticks=[[0,'Today'],[3652,'10 yr'],[30,'1 mo'],[365,'1 yr'],[182,'6 mo'],[91,'3 mo'],[1826,'5 yr'],[730,'2 yr'],[7,'1 wk']].filter(t=>!narrow||[0,30,182,365,3652].includes(t[0])),placed=[];
 let o=`<rect x="0" y="${base}" width="${W}" height="1.5" fill="currentColor"/>`;
 [[30,365,.035],[365,3652,.07]].forEach(([a,b,op])=>{o+=`<rect x="${xOf(a,W)}" y="8" width="${xOf(b,W)-xOf(a,W)}" height="${base-8}" rx="8" fill="currentColor" opacity="${op}"/>`});
 for(let d=0;d<=30;d+=narrow?7:1){const x=xOf(d,W),h=d%7?4:8;o+=`<rect x="${x}" y="${base-h}" width="1" height="${h}" fill="currentColor" opacity=".45"/>`}
 ticks.forEach(([d,l])=>{const x=xOf(d,W),w=l.length*6.6,an=d===0?'start':d===3652?'end':'middle',L=an==='start'?x:an==='end'?x-w:x-w/2;
  o+=`<rect x="${x-.5}" y="${base-12}" width="1.5" height="13" fill="currentColor"/>`;
  if(placed.some(([a,b])=>L<b+8&&L+w>a-8))return;placed.push([L,L+w]);/* labels go in priority order and skip any that would overlap */
  o+=`<text x="${x}" y="${base+19}" font-size="12" text-anchor="${an}" fill="currentColor" opacity=".7">${l}</text>`});
 const it=[...S.items].sort((a,b)=>a.due<b.due?-1:1),nx=it.find(i=>days(i.due)>=0),rows=[],boxes=[],leads=[];let lbl='',txt='';
 let top='';
 it.forEach(i=>{const n=Math.max(0,days(i.due)),x=xOf(n,W),isN=i===nx,r=Math.max(4,Math.min(11,Math.sqrt((+i.amt||0)/120)));
  const cir=`<circle cx="${x}" cy="${base-r-3}" r="${r}" fill="${isN?'#FFE600':'currentColor'}" stroke="${isN?'#111':'none'}" stroke-width="1.5" opacity="${isN?1:.85}"><title>${esc(i.name)} — ${esc(fmt(i.amt))}, ${longD(i.due)}</title></circle>`;if(isN)top=cir;else o+=cir;
  if(n<45&&!isN)return;
  const t=narrow?(i.name.length>16?i.name.slice(0,15).trimEnd()+'…':i.name):i.name+' · '+fmt(i.amt),tw=t.length*6.8+8;let lv=-1;const end=x+tw>W,left=end?x-tw:x;
  for(let k=0;k<5;k++){if(!rows[k]||rows[k]<left-2){lv=k;break}}if(lv<0)return;
  const y=base-38-lv*23;rows[lv]=end?x+8:x+tw+6;
  leads.push([x,y+4,base-r*2-4,boxes.length]);boxes.push([end?x-tw+4:x+2,y-12,tw-6,17]);txt+=`<text class="l" x="${end?x-4:x+4}" y="${y}" font-size="12.5" text-anchor="${end?'end':'start'}" fill="currentColor" font-weight="${isN?700:500}">${esc(t)}</text>`});
 /* leader lines are cut wherever they would pass behind another label */
 leads.forEach(([x,a,b,k])=>{let seg=[[a,b]];boxes.forEach(([bx,by,bw,bh],j)=>{if(j===k||x<bx||x>bx+bw)return;
  seg=seg.flatMap(([p,q])=>q<=by||p>=by+bh?[[p,q]]:[[p,by],[by+bh,q]].filter(([u,v])=>v-u>1))});
  seg.forEach(([p,q])=>lbl+=`<line x1="${x}" y1="${p}" x2="${x}" y2="${q}" stroke="currentColor" opacity=".3"/>`)});
 svg.innerHTML=o+top+lbl+txt}
const ro=new ResizeObserver(draw);ro.observe(svg);
function status(){
 const s=$('saveStat');
 if(mode==='local')s.innerHTML='<span class="dot warn"></span>Saved on this device only. Export a backup in Settings, or sign in to keep it in Google Drive.';
 else if(saving||pending)s.innerHTML='<span class="spin" style="width:12px;height:12px;border-width:2px;margin-right:6px"></span>Saving to Google Drive…';
 else if(S.dirty)s.innerHTML='<span class="dot err"></span>Not saved to Drive yet. Kept on this device.';
 else if(lastSaved)s.innerHTML='<span class="dot"></span>Saved to Google Drive at '+lastSaved.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 else s.innerHTML='<span class="dot"></span>In sync with Google Drive';
 if(!calBusy)$('calStat').innerHTML=S.cal&&S.cal.on?'<span class="dot"></span>Calendar reminders on':'';
}
/* scroll edge effect: hairline only when content is under the bar */
addEventListener('scroll',()=>$('nav').classList.toggle('edge',scrollY>40),{passive:true});

/* ---------- local cache ---------- */
const lkey=()=>'pa:'+(mode==='local'?'local':(user&&user.email||'anon'));
const cacheSave=()=>{if(!mode)return;try{localStorage.setItem(lkey(),JSON.stringify(S))}catch(e){}};
const cacheLoad=(k=lkey())=>{try{return cleanState(JSON.parse(localStorage.getItem(k)||'null'))}catch(e){return null}};

/* ---------- Google auth ---------- */
const gisReady=()=>window.google&&google.accounts&&google.accounts.oauth2;
function getToken(scope,hint){return new Promise((res,rej)=>{
 if(!CFG.clientId||/YOUR_CLIENT_ID/.test(CFG.clientId))return rej(new Error('config'));
 if(!gisReady())return rej(new Error('gis'));
 const tc=google.accounts.oauth2.initTokenClient({client_id:CFG.clientId,scope,include_granted_scopes:true,
  callback:r=>{if(r.error)return rej(new Error(r.error));token=r.access_token;tokenExp=Date.now()+(r.expires_in-60)*1000;res(r)},
  error_callback:e=>rej(new Error(e&&e.type||'popup'))});
 tc.requestAccessToken(hint?{login_hint:hint,prompt:''}:{prompt:'select_account'});})}
async function api(url,opt={}){
 if(!token||Date.now()>tokenExp){$('reauth').classList.remove('hidden');throw Object.assign(new Error('expired'),{expired:1})}
 const r=await fetch(url,{...opt,headers:{Authorization:'Bearer '+token,...(opt.headers||{})}});
 if(r.status===401){token=null;$('reauth').classList.remove('hidden');throw Object.assign(new Error('expired'),{expired:1})}
 if(!r.ok){const t=await r.text();throw Object.assign(new Error('HTTP '+r.status+' '+t.slice(0,200)),{status:r.status})}
 return r.status===204?null:(r.headers.get('content-type')||'').includes('json')?r.json():r.text()}

/* ---------- Drive appData storage ---------- */
async function driveFind(){const q=encodeURIComponent(`name='${FILE}' and trashed=false`);
 const r=await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);return r.files&&r.files[0]}
async function driveLoad(){const f=await driveFind();if(!f)return null;fileId=f.id;
 const txt=await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);return cleanState(typeof txt==='string'?JSON.parse(txt):txt)}
async function driveSave(){const body=JSON.stringify({...S,dirty:false});
 if(!fileId){const b='pa'+Date.now(),meta={name:FILE,parents:['appDataFolder'],mimeType:'application/json'};
  const r=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},
   body:`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`});fileId=r.id}
 else await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body})}

/* ---------- Google Calendar sync ---------- */
const CAL='https://www.googleapis.com/calendar/v3';
const rrule=i=>i.every?[(i.every%12===0?`RRULE:FREQ=YEARLY;INTERVAL=${i.every/12}`:`RRULE:FREQ=MONTHLY;INTERVAL=${i.every}`)]:undefined;
function evBody(i,head){const date=head?addD(i.due,-i.remind):i.due,t=(CFG.reminderTime||'09:00');
 const [hh,mm]=t.split(':').map(Number),endT=String(hh).padStart(2,'0')+':'+String(Math.min(59,mm+15)).padStart(2,'0');
 return {summary:head?`Heads-up: ${i.name} due in ${i.remind} day${i.remind===1?'':'s'} (${fmt(i.amt)})`:`Pay: ${i.name} (${fmt(i.amt)})`,
  description:`${i.cat} · ${evLabel(i.every)}${i.auto?' · autopay':''}${i.notes?'\n'+i.notes:''}\n\nFrom Payments Ahead. Edit in the app, not here.`,
  start:{dateTime:`${date}T${t}:00`,timeZone:TZ},end:{dateTime:`${date}T${endT}:00`,timeZone:TZ},
  recurrence:rrule(i),reminders:{useDefault:false,overrides:[{method:'popup',minutes:0}]},transparency:'transparent',colorId:head?'5':'11'}}
async function calEnsure(){
 if(S.cal&&S.cal.id){try{await api(`${CAL}/calendars/${encodeURIComponent(S.cal.id)}`);return}catch(e){if(e.expired)throw e;if(e.status!==404&&e.status!==410)throw e;S.cal.ev={}}}
 const c=await api(`${CAL}/calendars`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({summary:'Payments',description:'Bills, premiums and renewals from Payments Ahead',timeZone:TZ})});
 S.cal={...(S.cal||{}),on:true,id:c.id,ev:{}}}
async function upsert(id,body){const base=`${CAL}/calendars/${encodeURIComponent(S.cal.id)}/events`;
 if(id){try{const r=await api(`${base}/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.id}catch(e){if(e.status!==404&&e.status!==410)throw e}}
 const r=await api(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.id}
async function del(id){try{await api(`${CAL}/calendars/${encodeURIComponent(S.cal.id)}/events/${encodeURIComponent(id)}`,{method:'DELETE'})}catch(e){if(e.status!==404&&e.status!==410)throw e}}
async function calSync(){if(!S.cal||!S.cal.on||mode!=='google')return;
 if(calBusy){calAgain=true;return}/* a change arrived mid-sync: run again when this one ends, so it isn't dropped */
 calBusy=true;calAgain=false;calPending=false;$('calStat').innerHTML='<span class="spin" style="width:12px;height:12px;border-width:2px;margin-right:6px"></span>Updating Google Calendar…';
 try{await calEnsure();const ev=S.cal.ev||(S.cal.ev={}),ids=new Set(S.items.map(i=>i.id));
  for(const k of Object.keys(ev))if(!ids.has(k)){if(ev[k].m)await del(ev[k].m);if(ev[k].h)await del(ev[k].h);delete ev[k]}
  for(const i of S.items){const sig=JSON.stringify([i.name,i.amt,i.every,i.due,i.remind,i.auto,i.notes,i.cat,S.cur]),e=ev[i.id]||{};
   if(e.sig===sig&&e.m)continue;
   e.m=await upsert(e.m,evBody(i,false));
   if(i.remind>0)e.h=await upsert(e.h,evBody(i,true));else if(e.h){await del(e.h);delete e.h}
   e.sig=sig;ev[i.id]=e}
  calBusy=false;await persist(true);status()}
 catch(e){calBusy=false;$('calStat').innerHTML='<span class="dot err"></span>Calendar not updated'+(e.expired?'. Reconnect to retry.':'. It will retry on your next change.');console.warn(e)}
 finally{calBusy=false;if(calAgain&&mode==='google'){calAgain=false;calSync()}}}

/* "Add to Google Calendar" link: opens Google Calendar with the event filled in (repeats included). Needs no sign-in in this app. */
function gcalUrl(i,head){const b=evBody(i,head),f=s=>s.replace(/[-:]/g,'').slice(0,15);
 const p=new URLSearchParams({action:'TEMPLATE',text:b.summary,dates:f(b.start.dateTime)+'/'+f(b.end.dateTime),ctz:TZ,
  details:`${i.cat} · ${evLabel(i.every)}${i.auto?' · autopay':''}${i.notes?'\n'+i.notes:''}\n\nAdded from Payments Ahead.`});
 if(i.every)p.set('recur',rrule(i)[0]);return 'https://calendar.google.com/calendar/render?'+p}

/* ---------- save pipeline ---------- */
let saveT=null;
async function persist(now){S.t=Date.now();if(mode==='google')S.dirty=true;/* unsaved until Drive confirms: a quick close can't lose it */cacheSave();if(mode!=='google')return;
 pending=true;status();clearTimeout(saveT);
 const go=async()=>{if(saving){saveT=setTimeout(go,800);return}saving=true;pending=false;const t0=S.t;
  try{await driveSave();lastSaved=new Date();if(S.t===t0)S.dirty=false;$('reauth').classList.add('hidden')}catch(e){S.dirty=true;console.warn(e)}finally{saving=false;cacheSave();status()}};
 if(now)await go();else saveT=setTimeout(go,900)}
let calT=null,calPending=false,calAgain=false;
function commit(msg,undoable=true){render();if(msg)toast(msg,undoable);persist(false);clearTimeout(calT);if(S.cal&&S.cal.on){calPending=true;calT=setTimeout(calSync,1500)}}
/* leaving the app (switching apps, locking the phone, closing the tab): save to Drive and update the calendar now, not after the short delay */
function flush(){if(mode!=='google')return;if(pending){clearTimeout(saveT);persist(true)}if(calPending){clearTimeout(calT);calSync()}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});addEventListener('pagehide',flush);

/* ---------- sign-in flows ---------- */
async function startGoogle(hint){
 const btn=$('signin'),msg=$('gateMsg');btn.disabled=true;$('signinTxt').innerHTML='<span class="spin"></span>';
 const fail=t=>{msg.textContent=t;btn.disabled=false;setSigninLabel()};
 try{await getToken(SCOPE_BASE,hint)}
 catch(e){return fail(e.message==='config'?'This copy of the app isn\'t set up yet. Add your Google client ID to config.js (see README).':e.message==='gis'?'Google sign-in didn\'t load. Check your connection and try again.':'Sign-in was cancelled. If no window opened, allow pop-ups for this site and try again.')}
 try{user=await api('https://www.googleapis.com/oauth2/v3/userinfo');mode='google';
  try{localStorage.setItem('pa:hint',user.email)}catch(e){}
  const cached=cacheLoad();const remote=await driveLoad();let moved=0;
  if(remote&&cached&&cached.dirty&&cached.t>remote.t)S=cached;else if(remote)S=remote;else if(cached)S=cached;
  else{const loc=cacheLoad('pa:local');S={v:1,items:[],cur:'INR',t:Date.now()};if(loc&&loc.items.length){S.items=loc.items;S.cur=loc.cur;moved=loc.items.length}}
  btn.disabled=false;setSigninLabel();showApp();if(!remote||S.dirty)persist(true);if(S.cal&&S.cal.on)calSync();
  if(moved)toast(`Copied ${moved} payment${moved===1?'':'s'} from this device to your Google Drive`,false)}
 catch(e){console.warn(e);fail('Couldn\'t reach your Google Drive. Try again in a moment.')}}
function setSigninLabel(){let h=null;try{h=localStorage.getItem('pa:hint')}catch(e){}$('signinTxt').textContent=h?'Continue as '+h:'Sign in with Google'}
setSigninLabel();
function showApp(){$('gate').classList.add('hidden');$('app').classList.remove('hidden');
 $('who').textContent=mode==='google'?'':'This Device';$('acct').textContent=mode==='google'?user.email:'On This Device (No Account)';
 $('signout').textContent=mode==='google'?'Sign Out':'Sign In with Google…';render();scrollTo(0,0)}
$('signin').onclick=()=>{let h=null;try{h=localStorage.getItem('pa:hint')}catch(e){}startGoogle(h)};
$('localBtn').onclick=()=>{mode='local';S=cacheLoad()||{v:1,cur:'INR',items:[],t:Date.now()};showApp();
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}catch(e){}};/* ask the browser not to evict this data */
/* back to the sign-in screen with nothing of the previous session left in memory (incl. undo history, so it can't leak into another account) */
function toGate(msg){closeSheet(true);clearTimeout(saveT);clearTimeout(calT);calPending=calAgain=false;token=null;tokenExp=0;user=null;fileId=null;mode=null;undoStack=[];filter='All';
 S={v:1,items:[],cur:'INR'};toastTo(false);$('reauth').classList.add('hidden');$('app').classList.add('hidden');$('gate').classList.remove('hidden');
 setSigninLabel();$('gateMsg').textContent=msg;scrollTo(0,0)}
$('signout').onclick=async()=>{
 if(mode!=='google')return toGate('Sign in with Google to keep your payments in your Drive. If your Drive has none yet, the ones on this device are copied over.');
 if(S.dirty||pending||saving){try{await persist(true)}catch(e){}
  if(S.dirty&&!confirm('Some changes haven\'t reached Google Drive yet. Sign out anyway and lose them?'))return}
 try{localStorage.removeItem(lkey());localStorage.removeItem('pa:hint')}catch(e){}/* shared devices: leave no copy behind */
 toGate('Signed out. Your payments are safe in your Google Drive, and this device\'s copy was cleared.')};
async function wipeAll(){const b=$('w_go');b.disabled=true;let note='';
 try{if(mode==='google'){
   if(!token||Date.now()>tokenExp)await getToken(SCOPE_BASE+(S.cal&&S.cal.on?' '+SCOPE_CAL:''),user.email);
   const r=await api('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&pageSize=100');
   for(const f of r.files||[])await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}`,{method:'DELETE'});
   if(S.cal&&S.cal.id){try{await api(`${CAL}/calendars/${encodeURIComponent(S.cal.id)}`,{method:'DELETE'})}catch(e){if(e.status!==404&&e.status!==410)note=' If a "Payments" calendar is still in Google Calendar, delete it there.'}}
   const t=token;await new Promise(res=>{try{google.accounts.oauth2.revoke(t,()=>res())}catch(e){res()}});/* disconnect the app from the Google account */
   try{localStorage.removeItem(lkey());localStorage.removeItem('pa:hint')}catch(e){}
   toGate('All your Payments Ahead data was deleted from Google Drive and this device, and the app was disconnected from your Google account.'+note)}
  else{try{localStorage.removeItem('pa:local')}catch(e){}toGate('Your payments were deleted from this device.')}}
 catch(e){console.warn(e);toast('Couldn\'t finish deleting. Check your connection and try again.',false)}
 finally{b.disabled=false}}
$('wipeBtn').onclick=()=>{$('w_msg').textContent=mode==='google'?'Delete all your payments from Google Drive and this device, remove the Payments calendar, and disconnect your Google account? This can\'t be undone.':'Delete all your payments from this device? This can\'t be undone. Export a backup first if you might need them.';
 $('wipeConfirm').classList.remove('hidden');$('w_keep').focus()};
$('w_keep').onclick=()=>{$('wipeConfirm').classList.add('hidden');$('wipeBtn').focus()};
$('w_go').onclick=wipeAll;
$('reauthBtn').onclick=async()=>{try{await getToken(SCOPE_BASE+(S.cal&&S.cal.on?' '+SCOPE_CAL:''),user&&user.email);$('reauth').classList.add('hidden');persist(true);calSync()}catch(e){toast('Reconnect was cancelled',false)}};
function demoItems(){const t=iso(today());return [
 {id:'d1',name:'Rent',cat:'Home',amt:15000,every:1,due:addD(t,5),remind:3,auto:false,notes:''},
 {id:'d2',name:'Electricity',cat:'Utility',amt:1150,every:1,due:addD(t,14),remind:3,auto:false,notes:''},
 {id:'d3',name:'Mobile Recharge',cat:'Phone',amt:350,every:1,due:addD(t,2),remind:2,auto:true,notes:''},
 {id:'d4',name:'Health Insurance',cat:'Insurance',amt:18000,every:12,due:addM(t,4),remind:30,auto:false,notes:''},
 {id:'d5',name:'Vehicle Insurance',cat:'Insurance',amt:2500,every:12,due:addM(t,8),remind:30,auto:false,notes:''},
 {id:'d6',name:'Passport Renewal',cat:'Renewal',amt:1500,every:120,due:addM(t,78),remind:180,auto:false,notes:''}]}

/* ---------- toast + undo (multiple levels) ---------- */
const toastEl=$('toast');let tT,tA=null,tY=160,tOn=false;
function toastTo(on){tOn=on;tA&&tA.stop();const from=tY,to=on?0:160;tA=spring(from,to,{damping:1,response:.35,onUpdate:y=>{tY=y;toastEl.style.transform=`translate(-50%,${y}%)`;toastEl.style.visibility=y>=159?'hidden':'visible'}})}
toastEl.style.visibility='hidden';
function toast(m,undo=true){$('tmsg').textContent=m;$('undo').classList.toggle('hidden',!undo||!undoStack.length);toastTo(true);clearTimeout(tT);tT=setTimeout(()=>toastTo(false),5000)}
const snap=()=>{undoStack.push(JSON.stringify(S.items));if(undoStack.length>30)undoStack.shift()};
$('undo').onclick=()=>{const s=undoStack.pop();if(!s)return;S.items=JSON.parse(s);commit('Change undone',false)};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!openSheetEl&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$('undo').click()}});

/* ---------- list actions ---------- */
function markPaid(id){const i=S.items.find(x=>x.id===id);if(!i)return;snap();haptic();
 if(i.every){i.last=iso(today());let d=addM(i.due,i.every);while(days(d)<0)d=addM(d,i.every);i.due=d;commit(`${i.name} paid. Next due ${longD(i.due)}.`)}
 else{S.items=S.items.filter(x=>x!==i);commit(`${i.name} done`)}}
function delItem(id){const i=S.items.find(x=>x.id===id);if(!i)return;snap();S.items=S.items.filter(x=>x!==i);commit(`${i.name} deleted`)}
$('filters').onclick=e=>{const b=e.target.closest('[data-f]');if(b){filter=b.dataset.f;render()}};
$('list').addEventListener('click',e=>{
 if(e.target.closest('[data-add]'))return openForm(null);
 if(e.target.closest('[data-samples]')){snap();S.items=demoItems();return commit('Examples added. Delete them when you\'re ready to add your own.')}
 const tk=e.target.closest('[data-tick]');if(tk){const id=tk.closest('.row').dataset.id;tk.classList.add('done');setTimeout(()=>markPaid(id),RM.matches?0:260);return}
 const a=e.target.closest('[data-act]');if(a){const id=a.closest('.row').dataset.id;a.dataset.act==='paid'?markPaid(id):delItem(id);return}
 const rc=e.target.closest('.rc');if(rc&&!rc.dataset.swiped){const id=rc.closest('.row').dataset.id;if(rc.dataset.open){closeRow(rc);return}openForm(S.items.find(x=>x.id===id),rc)}});
$('list').addEventListener('keydown',e=>{const rc=e.target.closest('.rc');if(rc&&e.target===rc&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openForm(S.items.find(x=>x.id===rc.closest('.row').dataset.id),rc)}});

/* swipe rows: 1:1 tracking, 10px hysteresis, rubber-band, momentum projection, spring settle */
const ACTW=168;let openRow=null;
function setX(rc,x){rc._x=x;rc.style.transform=x?`translateX(${x}px)`:'';rc.parentNode.classList.toggle('swiping',Math.abs(x)>.5)}
function settle(rc,to,v=0){rc._a&&rc._a.stop();rc._a=spring(rc._x||0,to,{damping:to===0?1:.86,response:.32,velocity:v,onUpdate:x=>setX(rc,x)});rc.dataset.open=to?'1':'';if(to)openRow=rc;else if(openRow===rc)openRow=null}
function closeRow(rc){settle(rc,0)}
$('list').addEventListener('pointerdown',e=>{const rc=e.target.closest('.rc');if(!rc||e.button>0)return;
 if(openRow&&openRow!==rc)closeRow(openRow);
 const sx=e.clientX,sy=e.clientY,x0=(rc._a&&rc._a.stop(),rc._x||0),tr=tracker();let dir=null,hl=setTimeout(()=>rc.classList.add('hl'),60);delete rc.dataset.swiped;
 const move=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;
  if(!dir){if(Math.abs(dx)<10&&Math.abs(dy)<10)return;dir=Math.abs(dx)>Math.abs(dy)?'x':'y';clearTimeout(hl);rc.classList.remove('hl');if(dir==='x'){try{rc.setPointerCapture(e.pointerId)}catch(_){}}}
  if(dir!=='x')return;ev.preventDefault();rc.dataset.swiped='1';
  let x=x0+dx;if(x>0)x=rubber(x,rc.offsetWidth);if(x<-ACTW*1.9)x=-ACTW*1.9-rubber(-(x+ACTW*1.9),rc.offsetWidth);
  setX(rc,x);tr.add(x)};
 const up=()=>{clearTimeout(hl);rc.classList.remove('hl');removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
  if(dir!=='x')return;const v=tr.v(),proj=(rc._x||0)+project(v,.99);
  if(proj<-rc.offsetWidth*.62){haptic();settle(rc,-rc.offsetWidth,v);setTimeout(()=>markPaid(rc.closest('.row').dataset.id),RM.matches?0:180)}
  else settle(rc,proj<-ACTW/2?-ACTW:0,v);
  setTimeout(()=>delete rc.dataset.swiped,0)};
 addEventListener('pointermove',move,{passive:false});addEventListener('pointerup',up);addEventListener('pointercancel',up)});

/* ---------- sheets: spring in from the bottom, follow the finger, dismiss along the same path ---------- */
let openSheetEl=null,sheetA=null,sheetY=1,returnFocus=null;
const desk=()=>innerWidth>=700;
function sheetPos(el,p){/* p: 0 = open, 1 = closed */
 if(desk()){el.style.transform=`translate(-50%,-50%) scale(${.96+.04*(1-p)})`;el.style.opacity=String(1-p)}
 else{el.style.transform=`translateY(${p*el.offsetHeight+(p>0?24*p:0)}px)`;el.style.opacity=''}
 $('scrim').style.opacity=String(1-Math.min(1,Math.max(0,p)))}
function openSheet(el,from){returnFocus=from||document.activeElement;openSheetEl=el;el.classList.add('open');$('scrim').style.pointerEvents='auto';
 document.body.style.overflow='hidden';sheetY=1;sheetPos(el,1);sheetA&&sheetA.stop();
 sheetA=spring(1,0,{damping:1,response:desk()?.3:.38,onUpdate:p=>{sheetY=p;sheetPos(el,p)}});
 setTimeout(()=>{const f=el.querySelector('[data-autofocus]')||el.querySelector('.sbar button');f&&f.focus({preventScroll:true})},desk()?60:350)}
function closeSheet(force,v=0){const el=openSheetEl;if(!el)return;
 if(!force&&el===$('sheet')&&dirty()){$('confirm').classList.remove('hidden');$('c_keep').focus();sheetA&&sheetA.stop();sheetA=spring(sheetY,0,{onUpdate:p=>{sheetY=p;sheetPos(el,p)}});return}
 $('confirm').classList.add('hidden');$('wipeConfirm').classList.add('hidden');openSheetEl=null;$('scrim').style.pointerEvents='none';document.body.style.overflow='';
 sheetA&&sheetA.stop();const h=el.offsetHeight||1;
 sheetA=spring(sheetY,1,{damping:1,response:.32,velocity:desk()?0:v/h,onUpdate:p=>{sheetY=p;sheetPos(el,p)},onDone:()=>{el.classList.remove('open');if(el===$('sheet'))editing=null}});
 returnFocus&&returnFocus.focus&&returnFocus.focus({preventScroll:true})}
$('scrim').onclick=()=>closeSheet();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openSheetEl){e.preventDefault();if(!$('wipeConfirm').classList.contains('hidden'))$('w_keep').click();else $('confirm').classList.contains('hidden')?closeSheet():$('c_keep').click()}
 if(e.key==='Tab'&&openSheetEl){const f=[...openSheetEl.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.closest('.hidden')&&x.offsetParent);if(!f.length)return;
  if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}}});
document.querySelectorAll('.sheet').forEach(el=>{
 const startDrag=e=>{if(desk()||e.button>0)return;if(e.target.closest('button,input,select,textarea'))return;
  sheetA&&sheetA.stop();const sy=e.clientY,p0=sheetY,h=el.offsetHeight,tr=tracker();let on=false;
  const move=ev=>{const dy=ev.clientY-sy;if(!on){if(Math.abs(dy)<6)return;on=true;try{el.setPointerCapture(e.pointerId)}catch(_){}}
   let y=p0*h+dy;if(y<0)y=-rubber(-y,h,.3);sheetY=y/h;sheetPos(el,Math.max(sheetY,0));if(y<0)el.style.transform=`translateY(${y}px)`;tr.add(y)};
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);if(!on)return;
   const v=tr.v(),proj=sheetY*h+project(v);
   if(proj>h*.45)closeSheet(false,v);else{sheetA=spring(sheetY,0,{damping:1,response:.32,velocity:v/h,onUpdate:p=>{sheetY=p;sheetPos(el,p)}})}};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up)};
 el.querySelectorAll('[data-grab]').forEach(g=>g.addEventListener('pointerdown',startDrag));
 el.querySelector('.grab').addEventListener('click',()=>closeSheet())});
addEventListener('resize',()=>{if(openSheetEl)sheetPos(openSheetEl,sheetY)});

/* ---------- editor ---------- */
$('f_cat').innerHTML=CATS.map(c=>`<option>${c}</option>`).join('');
$('f_every').innerHTML=EVERY.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
$('f_years').innerHTML=[2,3,4,5,6,7,8,10,15,20].map(y=>`<option value="${y}">${y} Years</option>`).join('');
$('f_months').innerHTML=[2,4,5,7,8,9,10,11,18].map(m=>`<option value="${m}">${m} Months</option>`).join('');
$('f_rem').innerHTML=REMS.map(d=>`<option value="${d}">${remLabel(d)}</option>`).join('');
$('presets').innerHTML=PRESETS.map((p,k)=>`<button type="button" class="chip" data-pr="${k}">${esc(p[0])}</button>`).join('');
const nearestRem=d=>REMS.reduce((a,b)=>Math.abs(b-d)<Math.abs(a-d)?b:a,REMS[0]);
function setEvery(v){const std=EVERY.some(e=>e[0]===v&&v>=0);const yrs=v%12===0&&v>=24;
 $('f_every').value=std?v:(yrs?-1:-2);
 if(yrs){if(![...$('f_years').options].some(o=>+o.value===v/12))$('f_years').insertAdjacentHTML('beforeend',`<option value="${v/12}">${v/12} Years</option>`);$('f_years').value=v/12}
 if(!std&&!yrs){if(![...$('f_months').options].some(o=>+o.value===v))$('f_months').insertAdjacentHTML('beforeend',`<option value="${v}">${v} Months</option>`);$('f_months').value=v}
 syncEvery()}
function syncEvery(){const ev=$('f_every').value;$('f_nw').classList.toggle('hidden',ev!=='-1');$('f_nm').classList.toggle('hidden',ev!=='-2')}
$('f_every').onchange=()=>{syncEvery();if(!editing){const v=+$('f_every').value;$('f_rem').value=v===1?3:v===-1?90:v===0?7:v>=12?30:7}};
$('presets').onclick=e=>{const b=e.target.closest('[data-pr]');if(!b)return;const[p,c,ev,r]=PRESETS[+b.dataset.pr];
 $('f_name').value=p;$('f_cat').value=c;setEvery(ev);$('f_rem').value=r;$('f_amt').focus()};
let formSnap='';const formVal=()=>JSON.stringify(['f_name','f_amt','f_due','f_every','f_years','f_months','f_rem','f_cat','f_notes'].map(k=>$(k).value).concat($('f_auto').checked));
const dirty=()=>formVal()!==formSnap;
function openForm(i,from){editing=i||null;$('ft').textContent=i?'Edit Payment':'New Payment';$('f_save').textContent=i?'Save':'Add';$('presets').classList.toggle('hidden',!!i);
 $('f_cur').textContent=sym();$('f_err').textContent='';
 $('f_name').value=i?i.name:'';$('f_cat').value=i?i.cat:'Insurance';$('f_amt').value=i?i.amt:'';setEvery(i?i.every:12);
 $('f_due').value=i?i.due:iso(today());$('f_rem').value=nearestRem(i?i.remind:30);
 if(i&&!REMS.includes(i.remind)){$('f_rem').insertAdjacentHTML('beforeend',`<option value="${i.remind}">${remLabel(i.remind)}</option>`);$('f_rem').value=i.remind}
 $('f_auto').checked=!!(i&&i.auto);$('f_notes').value=i?i.notes:'';$('f_delg').classList.toggle('hidden',!i);
 const showG=!!i&&!(mode==='google'&&S.cal&&S.cal.on);$('f_gcal').classList.toggle('hidden',!showG);
 if(showG){$('f_gc_due').href=gcalUrl(i,false);$('f_gc_head').href=gcalUrl(i,true);$('f_gc_head').textContent='Add Heads-Up, '+remLabel(i.remind);$('f_gc_head').parentNode.classList.toggle('hidden',!(i.remind>0))}
 formSnap=formVal();$('sheet').querySelector('.sbody').scrollTop=0;openSheet($('sheet'),from);if(!i)setTimeout(()=>$('f_name').focus({preventScroll:true}),desk()?80:400)}
$('add').onclick=e=>openForm(null,e.currentTarget);
$('f_x').onclick=()=>closeSheet();
$('c_discard').onclick=()=>closeSheet(true);
$('c_keep').onclick=()=>{$('confirm').classList.add('hidden');$('f_name').focus()};
function save(){const ev=+$('f_every').value,err=$('f_err');
 const every=ev===-1?(+$('f_years').value)*12:ev===-2?+$('f_months').value:ev;
 const rec={name:$('f_name').value.trim(),cat:$('f_cat').value,amt:+$('f_amt').value||0,every,due:$('f_due').value,remind:+$('f_rem').value||0,auto:$('f_auto').checked,notes:$('f_notes').value.trim()};
 if(!rec.name){err.textContent='Add a name so you know what to pay.';$('f_name').focus();return}
 if(!/^\d{4}-\d\d-\d\d$/.test(rec.due)){err.textContent='Choose the next due date.';$('f_due').focus();return}
 snap();if(editing)Object.assign(editing,rec);else S.items.push({id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),...rec});
 closeSheet(true);commit(editing?`${rec.name} updated`:`${rec.name} added`)}
$('f_save').onclick=save;$('f').onsubmit=e=>{e.preventDefault();save()};
$('f_name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('f_amt').focus()}});
$('f_del').onclick=()=>{if(!editing)return;const id=editing.id;closeSheet(true);delItem(id)};

/* ---------- settings ---------- */
function setUI(){const on=!!(S.cal&&S.cal.on),g=mode==='google';
 $('cur').value=S.cur||'INR';$('calSw').checked=on;$('calSw').disabled=!g;$('calSyncRow').classList.toggle('hidden',!on);
 $('calInfo').textContent=g?'Adds a calendar called "Payments" with each due date and a heads-up before it. Google Calendar sends the alerts on Android and iPhone. Payments Ahead can only change that one calendar.':'Automatic sync needs Google sign-in. Without an account, open any payment and tap Add to Google Calendar, or use the calendar file below.';
 $('dataInfo').textContent=g?'Saved in a private app folder in your Google Drive that only Payments Ahead can open.':'Saved in this browser only. Clearing browser data deletes it, and Safari can clear it if you don\'t open the app for about a week, unless you add it to your Home Screen. Export a backup now and then.';
 $('wipeBtn').textContent=g?'Delete All My Data…':'Delete All Payments on This Device…';
 $('wipeInfo').textContent=g?'Deletes your payments from Google Drive and this device, removes the Payments calendar, and disconnects Payments Ahead from your Google account.':'Removes every payment saved in this browser.'}
$('settingsBtn').onclick=e=>{setUI();$('setSheet').querySelector('.sbody').scrollTop=0;openSheet($('setSheet'),e.currentTarget)};
$('setX').onclick=()=>closeSheet();
$('cur').onchange=()=>{S.cur=$('cur').value;commit(null)};
$('calSw').onchange=async()=>{const sw=$('calSw');
 if(sw.checked){try{const r=await getToken(SCOPE_BASE+' '+SCOPE_CAL,user.email);
   if(!google.accounts.oauth2.hasGrantedAllScopes(r,SCOPE_CAL)){sw.checked=false;toast('Calendar access wasn\'t allowed',false);return}
   S.cal={...(S.cal||{}),on:true};setUI();await calSync();toast('Reminders added to Google Calendar',false)}catch(e){sw.checked=false;toast('Calendar permission was cancelled',false)}}
 else{const id=S.cal&&S.cal.id;S.cal={on:false};setUI();
  if(id){try{await api(`${CAL}/calendars/${encodeURIComponent(id)}`,{method:'DELETE'});toast('Payments calendar removed',false)}catch(e){toast('Reminders off. Delete the "Payments" calendar in Google Calendar if it\'s still there.',false)}}
  persist(true);status()}};
$('calSync').onclick=()=>{if(S.cal)Object.values(S.cal.ev||{}).forEach(e=>delete e.sig);calSync()};
function dlFile(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
$('exportBtn').onclick=()=>dlFile('payments-ahead.json',JSON.stringify({v:1,cur:S.cur,items:S.items},null,2),'application/json');
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2e6)throw 0;const d=JSON.parse(await f.text());if(!Array.isArray(d.items))throw 0;
 snap();const have=new Set(S.items.map(i=>i.id));let n=0;
 d.items.slice(0,5000).forEach((x,k)=>{const i=cleanItem(x,k);if(!i)return;if(have.has(i.id))i.id='p'+Date.now().toString(36)+k;have.add(i.id);S.items.push(i);n++});
 closeSheet(true);commit(`Imported ${n} payment${n===1?'':'s'}`)}catch(err){toast('That file isn\'t a Payments Ahead export',false)}e.target.value=''};
function ics(){const c=s=>String(s).replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n'),d8=s=>s.replace(/-/g,''),st=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
 const ev=(i,head)=>{const d=head?addD(i.due,-i.remind):i.due,rr=rrule(i);return ['BEGIN:VEVENT',`UID:${i.id}${head?'-h':''}@payments-ahead`,`DTSTAMP:${st}`,`DTSTART;VALUE=DATE:${d8(d)}`,`DTEND;VALUE=DATE:${d8(addD(d,1))}`,rr?rr[0]:'',
  `SUMMARY:${c(head?`Heads-up: ${i.name} due in ${i.remind} days (${fmt(i.amt)})`:`Pay: ${i.name} (${fmt(i.amt)})`)}`,`DESCRIPTION:${c(i.cat+' · '+evLabel(i.every)+(i.notes?' · '+i.notes:''))}`,
  'BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${c(i.name)}`,'TRIGGER:PT9H','END:VALARM','END:VEVENT'].filter(Boolean).join('\r\n')};
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Payments Ahead//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:Payments',...S.items.flatMap(i=>i.remind?[ev(i,false),ev(i,true)]:[ev(i,false)]),'END:VCALENDAR'].join('\r\n')+'\r\n'}
$('icsBtn').onclick=()=>dlFile('payments.ics',ics(),'text/calendar');

/* ---------- PWA ---------- */
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
addEventListener('beforeunload',e=>{if(pending||saving){e.preventDefault();e.returnValue=''}});
}
