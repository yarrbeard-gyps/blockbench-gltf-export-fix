const fs=require('fs'),vm=require('vm'),path=require('path');
const PLUG=process.argv[2], IMP=process.argv[3], SRC=process.argv[4];
const core=require(path.resolve(PLUG)), imp=require(path.resolve(IMP));
let fails=0; const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++;};
// Build a Blockbench-like GLB: textured test model + samplers 9728/9728 with repeat wrap (independent writer)
function glbFrom(json,bin){let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
 const h=Buffer.alloc(12);h.write('glTF',0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bin.length,8);
 const ch=(l,t)=>{const b=Buffer.alloc(8);b.writeUInt32LE(l,0);b.writeUInt32LE(t,4);return b;};
 const out=Buffer.concat([h,ch(js.length,0x4E4F534A),js,ch(bin.length,0x004E4942),bin]); return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}
const src=fs.readFileSync(SRC); const {json:j0,bin:b0}=imp.parseGLB(src.buffer.slice(src.byteOffset,src.byteOffset+src.byteLength));
j0.samplers=[{magFilter:9728,minFilter:9728,wrapS:10497,wrapT:33071},{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}];
j0.textures=[{source:0,sampler:0},{source:1,sampler:1}];
const bbGlb=glbFrom(j0,Buffer.from(b0));
// 1. binary rewrite
const out=core.applyToOutput(bbGlb,true);
check(out instanceof ArrayBuffer,'binary output stays an ArrayBuffer');
const p=imp.parseGLB(out);
check(p.json.samplers.every(s=>s.magFilter===9729&&s.minFilter===9987),'samplers now 9729/9987');
check(p.json.samplers[0].wrapS===10497&&p.json.samplers[0].wrapT===33071&&p.json.samplers[1].wrapS===33071,'wrapS/wrapT unchanged');
check(Buffer.compare(Buffer.from(p.bin),Buffer.from(b0))===0,'BIN chunk byte-identical');
const dv=new DataView(out); check(dv.getUint32(8,true)===out.byteLength,'GLB header length matches');
const jl=dv.getUint32(12,true); check(jl%4===0 && (20+jl)%4===0,'JSON chunk 4-byte aligned');
const {json:jo,...rest}=p; delete jo.samplers; const j1=JSON.parse(JSON.stringify(j0)); delete j1.samplers; check(JSON.stringify(jo)===JSON.stringify(j1),'rest of JSON unchanged');
// importer still reads it
(async()=>{const bufs=await imp.loadBuffers(p.json,p.bin);const r=imp.convertGLTF(p.json,bufs,{scale:16});const imgs=await imp.loadImages(p.json,bufs);
check(r.armatures[0].meshes[0].faces.length===2 && imgs.length===2 && imgs[0],'importer parses the rewritten glb (2 faces, 2 images)');
// 2. nearest kept
check(core.applyToOutput(bbGlb,false)===bbGlb,'nearest option returns the original buffer untouched');
// 3. ASCII
const ascii=JSON.stringify(j0); const a2=JSON.parse(core.applyToOutput(ascii,true));
check(typeof core.applyToOutput(ascii,true)==='string' && a2.samplers.every(s=>s.magFilter===9729&&s.minFilter===9987)&&a2.samplers[0].wrapS===10497,'ASCII string rewritten, wraps kept');
check(core.applyToOutput(ascii,false)===ascii,'ASCII nearest untouched');
const nos=JSON.stringify({asset:{version:'2.0'}}); check(core.applyToOutput(nos,true)===nos,'file without textures untouched');
// 4. plugin against a mocked Blockbench
let registered, updateAllCalls=0, msgs=0, compileResult=bbGlb, compileOptsSeen=null;
const codec={export_options:{encoding:{value:'ascii'},scale:{value:16}}, getExportOptions(){const o={};for(const k in this.export_options)o[k]=this.export_options[k].value;return Object.assign(o,this.saved||{});},
  async compile(opts){compileOptsSeen=opts; return compileResult;}};
const orig=codec.compile;
const ctx={Plugin:{register:(id,d)=>{registered={id,d};}}, Codecs:{gltf:codec}, Canvas:{updateAll(){updateAllCalls++;}}, Blockbench:{showMessageBox(){msgs++;}}, console, TextDecoder, TextEncoder, ArrayBuffer, DataView, Uint8Array, JSON, Object, Array, Error};
vm.runInNewContext(fs.readFileSync(PLUG,'utf8'),ctx);
check(registered&&registered.id==='gltf_export_fix','plugin registers as gltf_export_fix');
registered.d.onload();
check(codec.export_options.smooth_texture_filtering&&codec.export_options.smooth_texture_filtering.value===true,'export dialog checkbox added, default on');
codec.saved={encoding:'binary'};
let r1=await codec.compile();
check(updateAllCalls===1,'Canvas.updateAll() runs before compile');
check(r1 instanceof ctx.ArrayBuffer || Object.prototype.toString.call(r1)==='[object ArrayBuffer]','export returns ArrayBuffer');
check(imp.parseGLB(r1).json.samplers[0].magFilter===9729,'export via codec: smooth samplers');
codec.saved={encoding:'binary',smooth_texture_filtering:false};
let r2=await codec.compile();
check(r2===bbGlb,'checkbox off: Blockbench output untouched');
let r3=await codec.compile({encoding:'binary'}); // export_to_blender style call
check(compileOptsSeen&&compileOptsSeen.encoding==='binary','options passed through to original compile');
codec.saved={encoding:'binary'}; compileResult={asset:{},nodes:[{}]};
let threw=false; try{await codec.compile();}catch(e){threw=/empty/.test(e.message);}
check(threw&&msgs===1,'empty Binary export: clear error + message box, no object handed on');
compileResult=JSON.stringify(j0); codec.saved={encoding:'ascii'};
const r4=await codec.compile(); check(typeof r4==='string'&&JSON.parse(r4).samplers[0].minFilter===9987,'ASCII export via codec rewritten');
registered.d.onunload();
check(codec.compile===orig && !codec.export_options.smooth_texture_filtering,'unload restores compile and removes the option');
console.log(fails?`${fails} FAILED`:'ALL PASS'); process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
