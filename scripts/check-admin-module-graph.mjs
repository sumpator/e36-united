// Parse only: never link/evaluate application modules or contact an API.
// node --experimental-vm-modules scripts/check-admin-module-graph.mjs
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';

export const ADMIN_RELEASE_TOKEN='20260911-member-rows-r3';
const origin='https://e36united.cz';
const root=fileURLToPath(new URL('../',import.meta.url));
const firebase=/^https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-(app|auth)\.js$/;

export function inspectAdminGraph(readSource,expected=ADMIN_RELEASE_TOKEN){
  if(!vm.SourceTextModule)throw new Error('Run with --experimental-vm-modules (parse only).');
  const errors=[],edges=[],external=[],modules=new Map(),urlsBySource=new Map();
  const html=readSource('admin.html').replace(/<!--[\s\S]*?-->/g,'');
  const entries=[];
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));
    if(attrs.type==='importmap')errors.push('Import maps require an explicit graph-auditor update.');
    if(attrs.type!=='module')continue;
    if(!attrs.src||match[2].trim())errors.push('Inline module entries are not covered; use an external versioned entry.');
    if(attrs.src)entries.push(attrs.src);
  }
  if(entries.length!==1)errors.push('Expected one Admin module entry.');
  function visit(specifier,parent){
    const from=parent.pathname.slice(1),url=new URL(specifier,parent);
    if(url.origin!==origin){
      external.push({from,specifier});
      if(!firebase.test(url.href))errors.push(`Unreviewed external module: ${specifier}`);
      return;
    }
    const file=decodeURIComponent(url.pathname.slice(1));
    if(!/\.(m?js)$/.test(file)){errors.push(`Non-JS local module: ${file}`);return;}
    const versions=urlsBySource.get(file)||new Set();versions.add(url.href);urlsBySource.set(file,versions);
    const token=url.searchParams.get('v');
    edges.push({from,specifier,to:file,token,classification:token===expected?'current':token?'different-token':'unversioned'});
    if(url.search!==`?v=${expected}`||url.hash)errors.push(`${from} -> ${specifier}: expected exactly ?v=${expected}`);
    // One traversal per source still checks every inbound URL, including split state instances.
    if(modules.has(file))return;
    modules.set(file,[]);
    try{
      const source=readSource(file);
      const parsed=new vm.SourceTextModule(source,{identifier:url.href});
      modules.set(file,[...parsed.dependencySpecifiers]);
      for(const dep of parsed.dependencySpecifiers)visit(dep,url);
    }catch(error){errors.push(`${file}: ${error.message}`);}
  }
  for(const entry of entries)visit(entry,new URL('/admin.html',origin));
  for(const [file,urls]of urlsBySource)if(urls.size!==1)errors.push(`Multiple runtime URLs for ${file}: ${[...urls].join(', ')}`);
  const cycles=[],active=new Set(),done=new Set();
  function cycle(file,chain=[]){
    if(active.has(file)){cycles.push([...chain,file]);return;}
    if(done.has(file))return;active.add(file);
    for(const edge of edges.filter(e=>e.from===file))cycle(edge.to,[...chain,file]);
    active.delete(file);done.add(file);
  }
  for(const file of modules.keys())cycle(file);
  return {token:expected,files:[...modules.keys()].sort(),edges,external,cycles,errors};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const fixture=process.argv.includes('--fixture')?JSON.parse(readFileSync(0,'utf8')):null;
  const readSource=file=>{
    if(fixture){if(!Object.hasOwn(fixture,file))throw new Error('Missing module '+file);return fixture[file];}
    const path=resolve(root,file),local=relative(root,path);
    if(local.startsWith('..')||isAbsolute(local))throw new Error('Module escapes repository');
    return readFileSync(path,'utf8');
  };
  const result=inspectAdminGraph(readSource);
  console.log(JSON.stringify(result,null,2));
  if(result.errors.length&&!process.argv.includes('--audit'))process.exitCode=1;
}
