// Adapter regression checks without a WebGL context; browser review covers shaders.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/prototype/three.module.min.js';
import {Renderer} from '../src/prototype/renderer.js';
import {MeshBuilder} from '../src/core/mesh.js';
import {normalizeSave} from '../src/game/save.js';
const r=Object.create(Renderer.prototype);
Object.assign(r,{handles:new Set(),gpuBytes:0,scene:new THREE.Scene(),frame:1,active:[],uniforms:{}});
const b=new MeshBuilder();
b.vert(0,0,0,0,1,0,[.5,.5,.5]);b.vert(1,0,0,0,1,0,[.5,.5,.5]);b.vert(0,0,1,0,1,0,[.5,.5,.5]);b.i.push(0,1,2);
const h=r.upload(b),model=new THREE.Matrix4().elements;
assert.equal(h.count,3);assert.equal(h.geometry.getAttribute('uv'),undefined);
assert.equal(h.geometry.getAttribute('atlasRect'),undefined);
assert.ok(h.geometry.getAttribute('color').array[0]<.22,'vertex colours become linear');
r.draw(h,model,null);const node=h.nodes[0],material=node.material;
for(let i=0;i<100;i++){r.frame++;r.draw(h,model,null);}
assert.equal(h.nodes[0],node,'reuse render node');assert.equal(node.material,material,'reuse Standard material');
r.frame++;r.draw(h,model,{unlit:true});assert.notEqual(h.nodes[0].material,material);assert.ok(h.nodes[0].material.isMeshBasicMaterial);
r.blankIndices(h,0,3);assert.deepEqual([...h.geometry.index.array],[0,0,0]);
r.free(h);assert.equal(r.gpuBytes,0);assert.equal(r.scene.children.length,0);r.free(h);
assert.equal(normalizeSave({visualHour:25.5}).visualHour,1.5);
assert.equal(normalizeSave({visualHour:-1}).visualHour,23);
assert.equal(normalizeSave({visualHour:NaN}).visualHour,undefined);
assert.equal(normalizeSave({}).visualHour,undefined);
console.log('Prototype adapter: optional buffers, linear colours, null draw options, material reuse, breakables and resource release passed.');
