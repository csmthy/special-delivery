import { it } from 'vitest';
import { newCatch, stepCatch, HumanBot, mulberry32 } from '../src/rules';
it('t', () => {
  const out: string[] = [];
  for (const noise of [0.03, 0.06]) for (const delay of [12, 18]) {
  for (const pet of ['darrow','rufus','penny'] as const) {
    const row = [pet, `n${noise} d${delay}`];
    for (const k of ['mouse','chipmunk','bird','squirrel'] as const) {
      let ok=0,t=0; for (let i=0;i<300;i++){const rng=mulberry32(1000+i*7);const c=newCatch(k,pet);const b=new HumanBot(mulberry32(i+5),delay,noise);while(c.result==='running')stepCatch(c,1/60,b.hold(c),rng); if(c.result==='caught'){ok++;t+=c.t}}
      row.push(`${k}:${Math.round(ok/3)}% ${(t/Math.max(ok,1)).toFixed(1)}s`);
    }
    out.push(row.join(' | '));
  }}
  require('fs').writeFileSync('/tmp/tune.txt', out.join('\n'));
});
