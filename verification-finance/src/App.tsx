
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
