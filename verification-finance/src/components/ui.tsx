import React from 'react';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>){
  return <input {...props} style={{height:'var(--component-input-height)', padding:'0 var(--space-3)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', background:'var(--color-surface)', color:'var(--color-text-primary)', width:'100%', ...(props.style||{})}} />
}
export function Card({children, style}:{children:React.ReactNode; style?:React.CSSProperties}){
  return <div style={{background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--component-card-padding)', boxShadow:'var(--shadow-sm)', ...style}}>{children}</div>
}
export function Panel({children}:{children:React.ReactNode}){
  return <div style={{background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--space-4)'}}>{children}</div>
}

export function Button({variant='primary', size='md', children, ...props}: {variant?:'primary'|'secondary'|'ghost'; size?:'sm'|'md'; children:React.ReactNode} & React.ButtonHTMLAttributes<HTMLButtonElement>){
  const bg = variant==='primary' ? 'var(--color-accent)' : variant==='secondary' ? 'var(--color-surface)' : 'transparent';
  const color = variant==='primary' ? 'var(--color-accent-text)' : 'var(--color-text-primary)';
  const border = variant==='ghost' ? '1px solid var(--color-border)' : variant==='secondary' ? '1px solid var(--color-border)' : 'none';
  const h = size==='sm' ? '30px' : 'var(--component-button-height)';
  return <button style={{height:h, padding: '0 var(--space-4)', background:bg, color, border, borderRadius:'var(--radius-md)', fontWeight:500, cursor:'pointer'}} {...props}>{children}</button>
}
