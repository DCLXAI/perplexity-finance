import { spawn } from 'node:child_process';
const children=[spawn('npm',['run','dev:api'],{stdio:'inherit',shell:process.platform==='win32'}),spawn('npm',['run','dev:web'],{stdio:'inherit',shell:process.platform==='win32'})];
const stop=()=>{for(const child of children)child.kill('SIGTERM');};process.on('SIGINT',stop);process.on('SIGTERM',stop);for(const child of children)child.on('exit',(code)=>{if(code&&code!==0){stop();process.exitCode=code;}});
