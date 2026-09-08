
import React from 'react';
export function Nav({active, onNav}:{active:string; onNav:(k:string)=>void}){
  const items=['Dashboard','Transactions','Analytics','Settings'] as const;
  return <nav style={{height:'var(--component-nav-height)', display:'flex', alignItems:'center', gap:'var(--space-2)', borderBottom:'1px solid var(--color-border)', padding:'0 var(--space-4)', background:'var(--color-surface)'}}>
    <div style={{fontWeight:700, marginRight:'var(--space-6)'}}>Finwise</div>
    {items.map(k=> (
      <button key={k} onClick={()=>onNav(k)} style={{padding:'6px 10px', borderRadius:'var(--radius-md)', border: active===k ? '1px solid var(--color-border-strong)' : '1px solid transparent', background: active===k ? 'var(--color-surface-hover)' : 'transparent', fontSize:'13px', cursor:'pointer'}}>
        {k}
      </button>
    ))}
    <div style={{marginLeft:'auto', fontSize:'11px', color:'var(--color-text-tertiary)'}}>DESIGN v1 · technical</div>
  </nav>
}
