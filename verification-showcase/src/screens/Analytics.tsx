
import React from 'react';
import { Card } from '../components/ui';
export function Analytics(){
  return <div style={{padding:'var(--space-6)', maxWidth:'1200px', margin:'0 auto'}}>
    <h1 style={{fontSize:'22px', fontWeight:600}}>Analytics</h1>
    <p style={{color:'var(--color-text-secondary)', fontSize:'14px'}}>Spending breakdown — tabular numerals, compact density</p>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-4)', marginTop:'var(--space-6)'}}>
      <Card><h3 style={{fontSize:'14px', fontWeight:600}}>By category</h3><div style={{marginTop:'12px', display:'grid', gap:'10px'}}>{[['Housing','42%'],['Food','18%'],['Transport','12%']].map(([k,v])=> <div key={k} style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--color-text-secondary)'}}>{k}</span><span style={{fontVariantNumeric:'tabular-nums', fontWeight:600}}>{v}</span></div>)}</div></Card>
      <Card><h3 style={{fontSize:'14px', fontWeight:600}}>Trend</h3><div style={{height:'120px', display:'flex', alignItems:'end', gap:'6px', marginTop:'12px'}}>{[40,65,45,80,55,70].map((h,i)=> <div key={i} style={{flex:1, height:h+'%', background:'var(--color-accent)', borderRadius:'var(--radius-sm)', opacity:0.9 }}/>)}</div></Card>
    </div>
  </div>
}
