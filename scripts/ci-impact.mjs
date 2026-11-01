import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';

export function isTextOnlyHtmlChange(before,after){
  // Keep markup, comments, attributes and executable/style blocks byte-for-byte.
  // Only text between those tokens may differ, and intent still needs review.
  const skeleton=html=>(html.match(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(?:[^>"']|"[^"]*"|'[^']*')*>/gi)||[]).join('');
  return Boolean(before&&after)&&skeleton(before)===skeleton(after);
}
export function classifyImpact(files,message,{textOnlyHtml=[]}={}){
  const declared=/^CI-Impact:\s*cosmetic\s*$/mi.test(message);
  const visualOnly=files.length>0&&files.every(path=>textOnlyHtml.includes(path)||/^(?:docs\/.*\.md|[^/]+\.md|.*\.css|(?:assets\/.*|[^/]+)\.(?:png|jpe?g|webp|avif|gif))$/i.test(path));
  return declared&&visualOnly?'cosmetic':'functional';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [base,head]=process.argv.slice(2);if(!base||!head)throw Error('Expected explicit base and head SHA');
  const files=execFileSync('git',['diff','--name-only',base,head],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const message=execFileSync('git',['log','--format=%B',`${base}..${head}`],{encoding:'utf8'});
  // Every commit in a multi-commit push must explicitly declare cosmetic impact.
  const commits=execFileSync('git',['rev-list',`${base}..${head}`],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const allDeclared=commits.length>0&&commits.every(sha=>/^CI-Impact:\s*cosmetic\s*$/mi.test(execFileSync('git',['show','-s','--format=%B',sha],{encoding:'utf8'})));
  const textOnlyHtml=files.filter(file=>file.endsWith('.html')).filter(file=>{
    try{return isTextOnlyHtmlChange(execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}),execFileSync('git',['show',`${head}:${file}`],{encoding:'utf8'}))}catch{return false}
  });
  const impact=classifyImpact(files,allDeclared?message:'',{textOnlyHtml});
  console.log(`Impact: ${impact}; ${files.length} changed paths`);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`browser=${impact==='functional'}\nimpact=${impact}\n`);
}
