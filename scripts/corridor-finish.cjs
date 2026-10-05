// The finishing pass every shipped corridor frame gets, at its final size: everything outside
// the torch beam about a stop darker, a slightly lifted black, and fine film grain with a new
// pattern per frame (stronger in the mid tones, a little chroma in the shadows).
// finish(rgbBuffer, width, height, seed) -> rgbBuffer (in place). Deterministic for a seed.
const ss=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gaussField(w,h,seed){const r=rng(seed),n=new Float32Array(w*h);for(let i=0;i<n.length;i+=2){const u=Math.max(1e-9,r()),v=r(),m=Math.sqrt(-2*Math.log(u));n[i]=m*Math.cos(6.283185307*v);if(i+1<n.length)n[i+1]=m*Math.sin(6.283185307*v);}
  // a small blur gives the grain a clump of about 1.5 px, then back to unit variance
  const o=new Float32Array(w*h);let s2=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;const l=x>0?n[i-1]:n[i],rr=x<w-1?n[i+1]:n[i],u=y>0?n[i-w]:n[i],d=y<h-1?n[i+w]:n[i];const v=n[i]*0.5+(l+rr+u+d)*0.125;o[i]=v;s2+=v*v;}
  const k=1/Math.sqrt(s2/o.length);for(let i=0;i<o.length;i++)o[i]*=k;return o;}
// dark: 0 to 1, how much further everything outside the beam is pulled down (used for the first
// two segments, where the video model lit the whole corridor as if by a second lamp).
function finish(buf,w,h,seed,dark=0){
  const g=gaussField(w,h,seed*7919+13), c1=gaussField(w,h,seed*104729+7), c2=gaussField(w,h,seed*15485863+3);
  for(let i=0,p=0;i<w*h;i++,p+=3){
    let r=buf[p],gg=buf[p+1],b=buf[p+2]; const l=(r*3+gg*6+b)/10;
    const lo=0.6-0.22*dark, hi=130+40*dark; const f=lo+(1-lo)*ss(25,hi,l); r*=f;gg*=f;b*=f;   // outside the beam: darker
    r=3+r*0.988;gg=3+gg*0.988;b=3+b*0.988;                           // black lift
    const l2=(r*3+gg*6+b)/10; const amp=1.6+1.4*ss(8,60,l2)-1.2*ss(170,245,l2);
    const n=g[i]*amp, ch=0.3*(1-ss(20,70,l2));                       // grain, chroma only in shadows
    r+=n+c1[i]*ch; gg+=n; b+=n+c2[i]*ch;
    buf[p]=r<0?0:r>255?255:r; buf[p+1]=gg<0?0:gg>255?255:gg; buf[p+2]=b<0?0:b>255?255:b;
  }
  return buf;
}
module.exports={finish};
