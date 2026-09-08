/**
 * Cude.new - 4-screen finance verification project (Design Intelligence)
 * Generates a coherent product system: design-system.json + tokens + shared primitives + 4 screens.
 */
import type { DesignSystem } from './designSystem';
import { designSystemToCssVars } from './designSystem';

export type FileMap = Record<string, string>;

export function financeVerificationFiles(prompt: string, ds: DesignSystem): FileMap {
  const cssVars = designSystemToCssVars(ds);
  const tokensCss = `${cssVars}\n\n*{box-sizing:border-box}body{margin:0;font-family:var(--font-family);background:var(--color-background);color:var(--color-text-primary);line-height:1.6}h1,h2,h3{letter-spacing:-0.02em}button{font:inherit}`;

  const designJson = JSON.stringify(ds, null, 2);

  // Shared primitives — all screens must reuse these
  const buttonSource = `
export function Button({variant='primary', size='md', children, ...props}: {variant?:'primary'|'secondary'|'ghost'; size?:'sm'|'md'; children:React.ReactNode} & React.ButtonHTMLAttributes<HTMLButtonElement>){
  const bg = variant==='primary' ? 'var(--color-accent)' : variant==='secondary' ? 'var(--color-surface)' : 'transparent';
  const color = variant==='primary' ? 'var(--color-accent-text)' : 'var(--color-text-primary)';
  const border = variant==='ghost' ? '1px solid var(--color-border)' : variant==='secondary' ? '1px solid var(--color-border)' : 'none';
  const h = size==='sm' ? '30px' : 'var(--component-button-height)';
  return <button style={{height:h, padding: '0 var(--space-4)', background:bg, color, border, borderRadius:'var(--radius-md)', fontWeight:500, cursor:'pointer'}} {...props}>{children}</button>
}
`;
  const inputSource = `
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>){
  return <input {...props} style={{height:'var(--component-input-height)', padding:'0 var(--space-3)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', background:'var(--color-surface)', color:'var(--color-text-primary)', width:'100%', ...(props.style||{})}} />
}
export function Card({children, style}:{children:React.ReactNode; style?:React.CSSProperties}){
  return <div style={{background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--component-card-padding)', boxShadow:'var(--shadow-sm)', ...style}}>{children}</div>
}
export function Panel({children}:{children:React.ReactNode}){
  return <div style={{background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)', padding:'var(--space-4)'}}>{children}</div>
}
`;

  const navSource = `
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
    <div style={{marginLeft:'auto', fontSize:'11px', color:'var(--color-text-tertiary)'}}>DESIGN v${ds.meta.version} · ${ds.meta.preset}</div>
  </nav>
}
`;

  // Screens — each consumes tokens + shared primitives, NOT reinventing styles
  const dashboardSource = `
import React from 'react';
import { Card } from '../components/ui';
import { Button } from '../components/ui';
export function Dashboard(){
  return <div style={{padding:'var(--space-6)', maxWidth:'1200px', margin:'0 auto'}}>
    <h1 style={{fontSize:'22px', fontWeight:600}}>Dashboard</h1>
    <p style={{color:'var(--color-text-secondary)', fontSize:'14px'}}>Precise, premium overview — ${ds.identity.personality.join(', ')}</p>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'var(--space-4)', marginTop:'var(--space-6)'}}>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Balance</div><div style={{fontSize:'24px', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>$42,390</div><div style={{fontSize:'12px', color:'var(--color-success)'}}>+2.4% this month</div></Card>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Spent</div><div style={{fontSize:'24px', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>$3,210</div><Button variant="secondary" size="sm" style={{marginTop:'8px'}}>View transactions</Button></Card>
      <Card><div style={{fontSize:'11px', color:'var(--color-text-tertiary)'}}>Goals</div><div style={{fontSize:'14px', marginTop:'6px'}}>House fund 68%</div><div style={{height:'6px', background:'var(--color-border)', borderRadius:'var(--radius-full)', marginTop:'8px'}}><div style={{width:'68%', height:'100%', background:'var(--color-accent)', borderRadius:'var(--radius-full)'}}/></div></Card>
    </div>
    <Card style={{marginTop:'var(--space-6)'}}><h3 style={{fontSize:'15px', fontWeight:600}}>Recent transactions</h3><div style={{marginTop:'12px', display:'grid', gap:'8px'}}>{[1,2,3].map(i=> <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'10px 12px', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)'}}><span>Coffee &amp; Co</span><span style={{fontVariantNumeric:'tabular-nums'}}>- $4.80</span></div>)}</div></Card>
  </div>
}
`;

  const transactionsSource = `
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
`;

  const analyticsSource = `
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
`;

  const settingsSource = `
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
`;

  const appSource = `
import React, { useState } from 'react';
import { Nav } from './components/Nav';
import { Dashboard } from './screens/Dashboard';
import { Transactions } from './screens/Transactions';
import { Analytics } from './screens/Analytics';
import { Settings } from './screens/Settings';
import './tokens.css';
export default function App(){
  const [active, setActive] = useState('Dashboard');
  return <div style={{minHeight:'100vh', background:'var(--color-background)'}}>
    <Nav active={active} onNav={setActive} />
    {active==='Dashboard' && <Dashboard />}
    {active==='Transactions' && <Transactions />}
    {active==='Analytics' && <Analytics />}
    {active==='Settings' && <Settings />}
  </div>
}
`;

  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-finance',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview --port 4173',
          typecheck: 'tsc --noEmit --skipLibCheck',
        },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: {
          vite: '^5.4.11',
          '@vitejs/plugin-react': '^4.3.4',
          typescript: '^5.7.2',
          '@types/react': '^18.3.3',
          '@types/react-dom': '^18.3.0',
        },
      },
      null,
      2,
    ),
    'index.html': `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Finwise — Personal Finance</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    'vite.config.ts': `import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()]});`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          jsx: 'react-jsx',
          strict: true,
          moduleResolution: 'bundler',
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
      null,
      2,
    ),
    'design-system.json': designJson,
    'src/tokens.css': tokensCss,
    'src/design-system.ts': `export const designSystem = ${designJson} as const;\nexport type DesignSystem = typeof designSystem;\n`,

    /*
     * One import for the assembled file. The two fragments each used to carry
     * their own, so the concatenation declared React twice and the generated
     * product did not typecheck.
     */
    'src/components/ui.tsx': `import React from 'react';
${inputSource}${buttonSource}`,
    'src/components/Nav.tsx': navSource,
    'src/screens/Dashboard.tsx': dashboardSource,
    'src/screens/Transactions.tsx': transactionsSource,
    'src/screens/Analytics.tsx': analyticsSource,
    'src/screens/Settings.tsx': settingsSource,
    'src/main.tsx': `import React from 'react';import { createRoot } from 'react-dom/client';import App from './App';createRoot(document.getElementById('root')!).render(<App/>);`,
    'src/App.tsx': appSource,

    // Design memory file for project persistence
    'cude-memory.json': JSON.stringify(
      {
        prompt,
        designSystem: ds,
        createdAt: new Date().toISOString(),
        screens: ['Dashboard', 'Transactions', 'Analytics', 'Settings'],
      },
      null,
      2,
    ),
  };
}
