
import React from 'react';
import { Card } from '../components/ui';
import { Button } from '../components/ui';
export function Dashboard(){
  return <div style={{padding:'var(--space-6)', maxWidth:'1200px', margin:'0 auto'}}>
    <h1 style={{fontSize:'22px', fontWeight:600}}>Dashboard</h1>
    <p style={{color:'var(--color-text-secondary)', fontSize:'14px'}}>Precise, premium overview — precise, trustworthy, restrained, financial, information-dense</p>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'var(--space-4)', marginTop:'var(--space-6)'}}>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Balance</div><div style={{fontSize:'24px', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>$42,390</div><div style={{fontSize:'12px', color:'var(--color-success)'}}>+2.4% this month</div></Card>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Spent</div><div style={{fontSize:'24px', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>$3,210</div><Button variant="secondary" size="sm" style={{marginTop:'8px'}}>View transactions</Button></Card>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Goals</div><div style={{fontSize:'14px', marginTop:'6px'}}>House fund 68%</div><div style={{height:'6px', background:'var(--color-border)', borderRadius:'var(--radius-full)', marginTop:'8px'}}><div style={{width:'68%', height:'100%', background:'var(--color-accent)', borderRadius:'var(--radius-full)'}}/></div></Card>
    </div>
    <Card style={{marginTop:'var(--space-6)'}}><h3 style={{fontSize:'15px', fontWeight:600}}>Recent transactions</h3><div style={{marginTop:'12px', display:'grid', gap:'8px'}}>{[1,2,3].map(i=> <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)'}}><span>Coffee &amp; Co</span><span style={{fontVariantNumeric:'tabular-nums'}}>- $4.80</span></div>)}</div></Card>
  </div>
}
