// Tester for analysemotoren: kausalitet (ingen look-ahead), statistikk og sanity.
const MS=require('./engine.js'),fs=require('fs'),assert=require('assert');
const d=JSON.parse(fs.readFileSync('candles_1d.json')),h=JSON.parse(fs.readFileSync('candles_4h.json'));
const D=MS.prep(d); let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FEIL:',m);} };
// 1) Kausalitet: indikatorvektoren på dag t må være identisk om vi kutter bort alle data etter t
for(const s of MS.COINS){ const full=MS.series(D[s]); const N=full.N; let checked=0;
  for(let k=0;k<25;k++){ const t=300+Math.floor((N-301)*k/25); const cut=MS.series(MS.sliceD(D[s],0,t+1));
    const a=MS.vec(full,t), b=MS.vec(cut,t); if(!a||!b) continue; checked++;
    ok(a.every((x,i)=>Math.abs(x-b[i])<1e-9), `${s} vec avviker på t=${t}: ${a.map((x,i)=>(x-b[i]).toExponential(1))}`);
    ok(full.supP[t]===cut.supP[t] && full.resP[t]===cut.resP[t], `${s} støtte/motstand avviker t=${t}`);
    ok(full.str[t]===cut.str[t], `${s} struktur avviker t=${t}`); }
  ok(checked>=20,`${s} for få kontroller (${checked})`); console.log(s,'kausalitet OK på',checked,'datoer'); }
// 2) Wilson-intervall
const [lo,hi]=MS.wilson(5,10); ok(lo>0.2&&lo<0.3&&hi>0.7&&hi<0.8,'wilson 5/10 '+lo+' '+hi);
// 3) Full kjøring
const R=MS.run(d,h);
for(const c of R.coins){ const a=c.analog;
  ok(a.ok,'analog ok '+c.sym);
  // ingen tilfeller fra samme coin de siste 60 dagene, og alle utfall er kjent (t+30 <= siste dag)
  ok(a.cases.every(x=>!(x.sym===c.sym && c.asOf-x.t<60*864e5)), c.sym+' tilfelle for nær nåtid');
  ok(a.cases.every(x=>x.t+30*864e5<=R.asOf), c.sym+' tilfelle uten kjent 30d-utfall');
  // ikke-overlapp: samme coin >= 30 d, alle >= 10 d
  for(let i=0;i<a.cases.length;i++) for(let j=i+1;j<a.cases.length;j++){ const x=a.cases[i],y=a.cases[j]; const dd=Math.abs(x.t-y.t)/864e5; ok(dd>=10 && (x.sym!==y.sym||dd>=30), `${c.sym} overlapp ${x.sym} ${x.date} / ${y.sym} ${y.date}`); }
  ok(a.nEff<=a.n,'nEff<=n'); ok(a.cases.every(x=>x.post.length===31 && Math.abs(x.post[0]-1)<1e-9),'post-sti');
  // utfall stemmer med rå data
  const x=a.cases[0], Dd=D[x.sym], i=Dd.t.indexOf(x.t); ok(Math.abs(((Dd.c[i+30]/Dd.c[i]-1)*100)-x.r30)<0.01, 'r30 avviker');
  ok(c.score>=0&&c.score<=100,'score');
  ok(['buy','wait','sell','none'].includes(c.status.code),'status');
  const w=c.comps.reduce((s,x)=>s+x.w,0); ok(w===100,'vekter summerer til '+w);
  const exp=Math.round(50+50*c.comps.reduce((s,x)=>s+x.w*x.s,0)/100); ok(Math.abs(exp-c.score)<=1,'score-formel '+exp+' vs '+c.score);
  ok(typeof c.text.summary==='string' && c.text.summary.length>40 && !/undefined|NaN|null/.test(JSON.stringify(c.text)),'tekst '+c.sym);
  // nivå-statistikk har n og intervall
  ok(c.keys.nextUp.ci30 && c.keys.nextUp.ci30[0]<=c.keys.nextUp.p30 && c.keys.nextUp.p30<=c.keys.nextUp.ci30[1],'ci nivå '+c.sym);
  // hendelser: utfall kun når kjent
  ok(c.eventsAll.every(e=>e.r30==null || e.t+30*864e5<=R.asOf),'hendelse-utfall');
}
// 4) Ingen NaN i resultatet
const js=JSON.stringify(R); ok(!/NaN|Infinity/.test(js),'NaN/Infinity i resultat');
console.log(fails? fails+' feil':'Alle tester OK');
process.exit(fails?1:0);
