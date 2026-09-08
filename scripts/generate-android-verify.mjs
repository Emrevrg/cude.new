import fs from 'fs';
import path from 'path';

const out = 'verification-android';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const pkg = {
  name: 'cude-android-expense',
  private: true,
  version: '0.1.0',
  main: 'App.tsx',
  scripts: {
    typecheck: 'tsc --noEmit --skipLibCheck',
    build: 'echo no-build',
    android: 'expo prebuild --platform android',
  },
  dependencies: {
    react: '18.3.1',
    'react-native': '0.74.5',
    expo: '51.0.0',
    'expo-status-bar': '1.12.1',
    'react-native-safe-area-context': '4.10.1',
    '@react-native-async-storage/async-storage': '1.23.1',
  },
  devDependencies: { typescript: '5.7.2', '@types/react': '18.3.3' },
};
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2));
fs.writeFileSync(
  path.join(out, 'app.json'),
  JSON.stringify(
    {
      expo: {
        name: 'Cude Android Expense',
        slug: 'cude-android-expense',
        platforms: ['android'],
        android: { package: 'com.cude.expense' },
        version: '1.0.0',
      },
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(out, 'tsconfig.json'),
  JSON.stringify(
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
);
fs.writeFileSync(
  path.join(out, 'App.tsx'),
  `
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
type Tx={id:string; amount:number; category:string; date:string};
export default function App(){
  const [txs,setTxs]=useState<Tx[]>([]);
  const [cat,setCat]=useState('Food');
  useEffect(()=>{ AsyncStorage.getItem('txs').then(v=> v && setTxs(JSON.parse(v))); },[]);
  useEffect(()=>{ AsyncStorage.setItem('txs', JSON.stringify(txs)); },[txs]);
  const monthly = txs.reduce((s,t)=> s+t.amount,0);
  return <SafeAreaView style={s.c}>
    <Text style={s.title}>Expense Tracker</Text>
    <View style={s.card}><Text>Monthly Summary: \${monthly.toFixed(2)}</Text><Text style={s.sub}>{txs.length} transactions</Text></View>
    <View style={s.row}><TextInput placeholder="Category" value={cat} onChangeText={setCat} style={s.input}/><Button title="Add" onPress={()=> setTxs([...txs,{id:Date.now().toString(),amount:10,category:cat,date:new Date().toISOString()}])}/></View>
    <FlatList data={txs} keyExtractor={i=>i.id} renderItem={({item})=><View style={s.item}><Text>{item.category}</Text><Text>\${item.amount}</Text></View>} />
    <View style={s.settings}><Text>Settings: Offline storage via AsyncStorage • Categories: Food, Transport, Housing</Text></View>
  </SafeAreaView>
}
const s=StyleSheet.create({c:{flex:1,padding:16,backgroundColor:'#0A0A0A'},title:{color:'#fff',fontSize:24,fontWeight:'700'},card:{backgroundColor:'#111',padding:12,borderRadius:8,marginTop:12,borderWidth:1,borderColor:'#222'},sub:{color:'#A0A0A0',fontSize:12},row:{flexDirection:'row',gap:8,marginTop:12},input:{flex:1,borderWidth:1,borderColor:'#222',borderRadius:6,padding:8,color:'#fff'},item:{flexDirection:'row',justifyContent:'space-between',padding:10,borderWidth:1,borderColor:'#222',borderRadius:6,marginTop:6,backgroundColor:'#111'},settings:{marginTop:16,padding:12,backgroundColor:'#111',borderRadius:8,borderWidth:1,borderColor:'#222'}});
`,
);
console.log('generated verification-android');
