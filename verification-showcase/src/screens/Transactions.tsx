
import React from 'react';
import { Card, Input, Button } from '../components/ui';
export function Transactions(){
  return <div style={{padding:'var(--space-6)', maxWidth:'1200px', margin:'0 auto'}}>
    <h1 style={{fontSize:'22px', fontWeight:600}}>Transactions</h1>
    <div style={{display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)'}}><Input placeholder="Search transactions" style={{maxWidth:'320px'}} /><Button>Add transaction</Button></div>
    <Card style={{marginTop:'var(--space-6)'}}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 120px 100px', gap:'12px', fontSize:'11px', color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
        <span>Description</span><span>Category</span><span style={{textAlign:'right'}}>Amount</span>
      </div>
      <div style={{marginTop:'12px', display:'grid', gap:'8px'}}>
        {[['Grocery', 'Food', '- $54.20'],['Salary', 'Income', '+ $3,200.00'],['Rent', 'Housing', '- $1,200.00']].map(([d,c,a])=> (
          <div key={d} style={{display:'grid', gridTemplateColumns:'1fr 120px 100px', gap:'12px', padding:'12px', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', background:'var(--color-surface)'}}>
            <span style={{fontWeight:500}}>{d}</span><span style={{color:'var(--color-text-secondary)', fontSize:'13px'}}>{c}</span><span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{a}</span>
          </div>
        ))}
      </div>
    </Card>
  </div>
}
