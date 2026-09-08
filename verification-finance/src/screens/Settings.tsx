
import React from 'react';
import { Card, Input, Button } from '../components/ui';
export function Settings(){
  return <div style={{padding:'var(--space-6)', maxWidth:'800px', margin:'0 auto'}}>
    <h1 style={{fontSize:'22px', fontWeight:600}}>Settings</h1>
    <div style={{display:'grid', gap:'var(--space-4)', marginTop:'var(--space-6)'}}>
      <Card><h3 style={{fontSize:'14px', fontWeight:600}}>Profile</h3><div style={{display:'grid', gap:'var(--space-3)', marginTop:'12px', maxWidth:'420px'}}><Input defaultValue="Alex Morgan" /><Input defaultValue="alex@example.com" /><Button>Save changes</Button></div></Card>
      <Card><h3 style={{fontSize:'14px', fontWeight:600}}>Preferences</h3><div style={{display:'flex', gap:'var(--space-3)', marginTop:'12px'}}><Button variant="secondary">Light</Button><Button>Dark</Button><Button variant="ghost">System</Button></div></Card>
      <Card><h3 style={{fontSize:'14px', fontWeight:600}}>Empty state</h3><div style={{textAlign:'center', padding:'var(--space-6)', color:'var(--color-text-tertiary)'}}><div style={{fontSize:'32px'}}>◇</div><div style={{marginTop:'8px', fontSize:'13px'}}>No connected accounts</div><Button variant="secondary" size="sm" style={{marginTop:'12px'}}>Connect account</Button></div></Card>
    </div>
  </div>
}
