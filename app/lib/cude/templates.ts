/**
 * Cude.new - Platform Templates (truthful minimal valid projects)
 * Each generator returns a FileMap for the selected platform.
 * These are intentionally minimal + buildable, not fake.
 */
import type { ProjectType } from './platform';

export type FileMap = Record<string, string>;

function webTemplate(prompt: string): FileMap {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-web',
        private: true,
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview --port 4173', typecheck: 'tsc --noEmit' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: {
          vite: '^5.4.11',
          '@vitejs/plugin-react': '^4.3.4',
          typescript: '^5.7.2',
          '@types/react': '^18.3.12',
          '@types/react-dom': '^18.3.1',
        },
      },
      null,
      2,
    ),
    'index.html': `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cude Web</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    'vite.config.ts': `import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()]});`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          strict: true,
          moduleResolution: 'bundler',
          esModuleInterop: true,

          // A dependency's own type definitions must not fail the user's typecheck.
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'src/main.tsx': `import React from 'react';import { createRoot } from 'react-dom/client';import App from './App';createRoot(document.getElementById('root')!).render(<App/>);`,
    'src/App.tsx': `export default function App(){return <div style={{fontFamily:'system-ui',padding:'32px',maxWidth:'720px',margin:'0 auto'}}><h1 style={{fontSize:'28px',fontWeight:700}}>Cude Web</h1><p style={{color:'#666',marginTop:'8px'}}>Prompt: ${prompt.slice(0, 200).replace(/</g, '&lt;')}</p><div style={{marginTop:'24px',padding:'16px',border:'1px solid #222',borderRadius:'8px'}}><p>Generated project is buildable. Edit src/App.tsx.</p></div></div>}`,
  };
}

function extensionTemplate(prompt: string): FileMap {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-extension',
        private: true,
        version: '0.1.0',
        scripts: { build: 'vite build', typecheck: 'tsc --noEmit' },
        devDependencies: { vite: '^5.4.11', typescript: '^5.7.2' },
      },
      null,
      2,
    ),
    'manifest.json': JSON.stringify(
      {
        manifest_version: 3,
        name: 'Cude Extension',
        version: '0.1.0',
        description: prompt.slice(0, 100),
        action: { default_popup: 'popup.html' },
        background: { service_worker: 'background.js' },
        permissions: ['activeTab', 'storage', 'scripting'],
        content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
      },
      null,
      2,
    ),
    'popup.html': `<!doctype html><html><head><meta charset="utf-8"/><style>body{width:320px;padding:16px;font-family:system-ui}button{padding:8px 12px;border:1px solid #222;border-radius:6px;background:#000;color:#fff}</style></head><body><h3>Cude Extension</h3><p>${prompt.slice(0, 120).replace(/</g, '&lt;')}</p><button id="summarize">Summarize page</button><script src="popup.js"></script></body></html>`,
    'popup.js': `document.getElementById('summarize')?.addEventListener('click', async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(tab?.id) chrome.tabs.sendMessage(tab.id,{type:'CUDE_SUMMARIZE'});});`,
    'content.js': `chrome.runtime.onMessage.addListener((msg)=>{if(msg.type==='CUDE_SUMMARIZE'){const text=document.body.innerText.slice(0,8000); console.log('[Cude] page text', text.slice(0,500)); alert('Cude: captured '+text.length+' chars. Wire to your AI provider.');}});`,
    'background.js': `chrome.runtime.onInstalled.addListener(()=>console.log('Cude extension installed'));`,
    'README.md': `# Cude Extension\nLoad unpacked from manifest.json. Test: chrome://extensions -> Developer mode -> Load unpacked.`,
  };
}

function vscodeTemplate(prompt: string): FileMap {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-vscode-extension',
        displayName: 'Cude Extension',
        description: prompt.slice(0, 120),
        version: '0.1.0',
        engines: { vscode: '^1.85.0' },
        activationEvents: [],
        main: './out/extension.js',
        contributes: { commands: [{ command: 'cude.explain', title: 'Cude: Explain Selection' }] },
        scripts: { compile: 'tsc -p ./', watch: 'tsc -watch -p ./', test: 'node ./out/test/runTest.js' },
        devDependencies: { typescript: '^5.7.2', '@types/vscode': '^1.85.0' },
      },
      null,
      2,
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          module: 'commonjs',
          target: 'ES2022',
          outDir: 'out',
          lib: ['ES2022'],
          sourceMap: true,
          strict: true,
          skipLibCheck: true,
        },
        exclude: ['node_modules', '.vscode-test'],
      },
      null,
      2,
    ),
    'src/extension.ts': `import * as vscode from 'vscode';export function activate(ctx: vscode.ExtensionContext){const cmd=vscode.commands.registerCommand('cude.explain', async()=>{const ed=vscode.window.activeTextEditor; const sel=ed?.document.getText(ed.selection) || 'No selection'; vscode.window.showInformationMessage('Cude: Explaining '+ sel.slice(0,80));}); ctx.subscriptions.push(cmd);} export function deactivate(){}`,
    'README.md': `# Cude VS Code Extension\nRun: npm install && npm run compile. Press F5 to launch Extension Host.`,
  };
}

function desktopTemplate(prompt: string): FileMap {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-desktop',
        private: true,
        version: '0.1.0',
        main: 'main.js',
        scripts: { dev: 'electron .', build: 'tsc && electron-builder', typecheck: 'tsc --noEmit' },
        devDependencies: { electron: '^33.2.0', typescript: '^5.7.2' },
      },
      null,
      2,
    ),
    'main.js': `const { app, BrowserWindow } = require('electron');function create(){const w=new BrowserWindow({width:1000,height:700, backgroundColor:'#0a0a0a'}); w.loadFile('index.html');} app.whenReady().then(create);`,
    'index.html': `<!doctype html><html><head><meta charset="utf-8"/><title>Cude Desktop</title><style>body{margin:0;font-family:system-ui;background:#0a0a0a;color:#fff;padding:32px} .card{border:1px solid #222;border-radius:8px;padding:16px;background:#111}</style></head><body><h1>Cude Desktop</h1><p>${prompt.slice(0, 140).replace(/</g, '&lt;')}</p><div class="card">Desktop shell ready. Implement autosave, menus, shortcuts as needed.</div></body></html>`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          lib: ['ES2022', 'DOM'],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
      },
      null,
      2,
    ),
  };
}

function androidTemplate(prompt: string): FileMap {
  return {
    'package.json': JSON.stringify(
      {
        name: 'cude-android',
        private: true,
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'echo "For native: ./gradlew assembleDebug; For Expo: npx expo prebuild"',
        },
        dependencies: { 'react-native': '^0.74.0' },
        devDependencies: { typescript: '^5.7.2' },
      },
      null,
      2,
    ),
    'app.json': JSON.stringify(
      {
        expo: {
          name: 'Cude Android',
          slug: 'cude-android',
          platforms: ['android'],
          android: { package: 'com.cude.app' },
        },
      },
      null,
      2,
    ),
    'App.tsx': `import React from 'react';import { View, Text, StyleSheet } from 'react-native';export default function App(){return <View style={s.c}><Text style={s.t}>Cude Android</Text><Text style={s.d}>${prompt.slice(0, 100).replace(/'/g, "\\'")}</Text></View>} const s=StyleSheet.create({c:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#000'},t:{color:'#fff',fontSize:24,fontWeight:'700'},d:{color:'#a0a0a0',marginTop:8}});`,
    'README.md': `# Cude Android\nChoose path: Expo (recommended) -> npx expo run:android or native Kotlin + Compose. Build validation: ./gradlew assembleDebug or tsc.`,
  };
}

export function getTemplateForType(type: ProjectType, prompt: string): FileMap {
  switch (type) {
    case 'browser-extension':
      return extensionTemplate(prompt);
    case 'vscode-extension':
      return vscodeTemplate(prompt);
    case 'desktop':
      return desktopTemplate(prompt);
    case 'android':
    case 'ios':
    case 'mobile':
      return androidTemplate(prompt);
    case 'backend':
      return webTemplate(`Backend API: ${prompt}`);
    case 'pwa':
      return webTemplate(`PWA: ${prompt}`);
    default:
      return webTemplate(prompt);
  }
}
