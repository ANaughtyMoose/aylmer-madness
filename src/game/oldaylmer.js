// Architecture and 2004 uses from Tom's photo set. Street View camera labels
// can differ from the parcel: use the pictured building, not the camera point.
import {rgb} from '../core/mesh.js';
export function oldAylmerSites({rectRing,walls,lot}) {
  const sites=[];
  const add=(key,x,z,ids,build,signs=[],r=45)=>sites.push({key,cx:x,cz:z,r,near:340,hide:ids.map(id=>({id,at:[x,z]})),build:K=>build(frame(K,x,z,key==='clocklibrary'?0:z>-130?Math.PI:0)),site:()=>{},signs});
  function frame(K,x,z,a=0){
    const c=Math.cos(a),s=Math.sin(a),p=(u,v)=>[x+c*u-s*v,z+s*u+c*v];
    const box=(u,y,v,w,h,d,col)=>{const q=p(u,v);K.mb.box(q[0],y,q[1],w,h,d,rgb(col),{yaw:-a});};
    const wall=(u,v,w,d,h,col,rows=[])=>{
      const q=p(u,v),mat=([0xa6533b,0xa85a44,0xa85a42,0x9c4f3c,0xa7664b,0xa76451].includes(col)?'brick_red':
        [0xa2a193,0xa5a296,0xa7a79a].includes(col)?'stone_grey':col===0x92765b?'brick_buff':
        [0xb9bfc0,0xc6cbca].includes(col)?'vinyl_grey':null);
      walls(K,rectRing(q[0],q[1],w,d,a),0,h,{mat,tint:mat?K.mats.tint(mat):rgb(col),bar:0xeee7d8},()=>rows);
    };
    const roof=(u,v,w,d,y,h,col,kind='hip')=>{const q=p(u,v);if(kind==='gable')K.mb.roof(q[0],y,q[1],d,w,h,rgb(col),Math.PI/2-a,.35);else K.mb[kind](q[0],y,q[1],w,d,h,rgb(col),-a,.35);};
    const win=(u,y,v,w,h)=>{box(u,y,v,w+.2,h+.2,.12,0xe5dfcf);box(u,y,v+.09,w,h,.1,0x34454a);box(u,y,v+.16,.065,h,.05,0xe5dfcf);};
    const door=(u,v,y=1.2)=>win(u,y,v,1.2,2.2);
    const arch=(u,y,v,w,h)=>{
      for(const [pad,col,depth]of [[.14,0xd0cbb9,0],[0,0x34454a,.03]]){
        const r=w/2+pad,base=y-pad,spring=y+h-w/2,points=[[-r,base],[r,base]];
        for(let i=0;i<=10;i++){const t=i*Math.PI/10;points.push([Math.cos(t)*r,spring+Math.sin(t)*r]);}
        const centre=p(u,v+depth),b=K.mb.vert(centre[0],y+h/2,centre[1],-s,0,c,rgb(col));
        const ids=points.map(([dx,yy])=>{const q=p(u+dx,v+depth);return K.mb.vert(q[0],yy,q[1],-s,0,c,rgb(col));});
        for(let i=0;i<ids.length;i++)K.mb.tri(b,ids[i],ids[(i+1)%ids.length]);
      }
    };
    const steps=(u,v,w=2,n=4)=>{for(let i=0;i<n;i++)box(u,.1*(n-i),v+i*.32,w,.2*(n-i),.36,0xa59f91);};
    const porch=(w,v,col=0xf0eadb)=>{box(0,.5,v,w,1,2.4,0x796653);box(0,3.4,v,w+.4,.25,2.8,col);for(let u=-w/2+.3;u<w/2;u+=w/3){box(u,2,v+.95,.18,2.8,.18,col);}steps(w*.3,v+1.4);};
    const rows=(n=2)=>Array.from({length:n},(_,i)=>({y0:1+i*3.2,y1:2.8+i*3.2,w:1.3,gap:1.7,margin:1,mullions:1}));
    return {K,p,box,wall,roof,win,door,arch,steps,porch,rows};
  }
  const sign=(x,z,w,text,board='#33453b',y=3.4,h=1,sub='',yaw=0)=>({x,z,w,text,board,y,h,sub,yaw,mount:y>=3?'wall':'post'});
  add('solpfk',75,-224,[68609352],F=>{
    F.wall(0,0,30,21,3.3,0xc2b49b,F.rows(1));F.roof(0,0,31,22,3.3,1.2,0x655e51);
    F.roof(7,5,14,12,3.3,2.2,0xb54032);F.box(7,5.9,5,2,1.5,2,0xe7dfcc);
    F.roof(7,5,2.8,2.8,6.65,.8,0xe7dfcc);F.door(-8,10.6);F.door(7,10.6);
    F.box(-8,3.6,10.7,12,1.6,.22,0x17462f);
    for(let u=-13;u<14;u+=5)F.box(u,.3,13,1,.6,1,0x877b65);
  },[sign(67,-213.1,11,'SOL','#17462f',3,1.5,'ALIMENTS NATURELS'),sign(82,-213.1,7,'PFK','#ae332d',3.4,1)]);
  add('stone172',-176,-113,[94173669],F=>{
    F.wall(0,0,25,31,9.6,0xa2a193,F.rows(3));F.roof(0,0,26,32,9.6,4,0x4b4c43,'mansard');
    for(const u of [-8,7]){F.box(u,12,12,5,3,3,0x605d4f);F.win(u,12.1,13.55,3.8,2);F.roof(u,12,6,4,13.5,.7,0x41463f);}
    F.wall(8,14,7,7,16,0xa2a193);F.arch(8,.1,17.6,2.2,3);F.arch(8,4.3,17.6,3,3.9);F.arch(8,9.3,17.6,3,4.2);
    F.roof(8,14,8,8,16,3,0x42473f,'mansard');F.roof(8,14,5,5,19,2.4,0x42473f);
    F.box(0,9.4,15.6,25,.4,.4,0xc2beab);F.steps(8,18);
  });
  add('unitedchurch',-235,-107,[316985561],F=>{
    F.wall(0,0,16,31,7.5,0xa5a296,[{y0:2,y1:5.8,w:1.3,gap:3,margin:2}]);F.roof(0,0,17,32,7.5,5,0x64645b,'gable');
    F.wall(5,12,5.5,7,15,0xa5a296);F.box(5,15.1,12,6,.4,7.5,0x6c7068);
    F.arch(5,9.2,15.6,1.6,4);F.arch(5,1.2,15.6,2.2,3.5);F.steps(5,16,4,8);
    F.arch(-3,3.8,15.6,2.1,4.5);
  });
  add('church160',-327,-100,[123275536],F=>{
    F.wall(1,0,23,23,5.4,0x92765b);F.roof(1,0,24,24,5.4,9,0x49463b,'gable');
    F.box(1,6,11.7,9,6,.18,0x3a3932);F.door(1,11.9,2.1);
    F.wall(-11,10,4,5,19,0xb9b5a5);F.box(-11,13.3,12.6,.18,8,.16,0xcacdc9);F.box(-11,16,12.6,2.7,.18,.16,0xcacdc9);
    F.wall(14,-3,5,18,3.2,0x92765b);F.roof(14,-3,6,19,3.2,3.2,0x565c56,'gable');F.steps(-2,13,4,8);
    // Long accessible approach, supported by a solid tapered base.
    const q=F.p(4,18);F.K.mb.tower(q[0],0,q[1],3,10,1.4,rgb(0xaaa396),{wTop:3,dTop:.1,yaw:-Math.PI});
    for(const u of [2.4,5.6])for(let v=13;v<23;v+=2)F.box(u,1.5-(v-13)*.08,v,.08,1.2,.08,0x44443c);
  },[sign(-316,-112.8,2.8,'160 · ÉGLISE','#343c39',1.4,.8,'',Math.PI)]);
  add('pizzagelato',-402,-102,[473653358],F=>{
    F.wall(0,0,9,14,6.4,0xa6533b,F.rows(2));F.roof(0,0,10,15,6.4,4,0xe0dcc9,'gable');
    F.win(0,8.1,7.4,.8,1.2);F.box(2,.4,8,3,.8,2,0x81715d);F.win(2,2,7.8,2.2,2.4);
    F.box(-2,2.7,8,3,.2,2,0xf0e6ce);F.roof(-2,8,3.6,2.4,2.8,1,0xe5dfcc,'gable');F.door(-2,7.1);
    F.box(0,.12,11,13,.24,4,0x8c785b);for(let u=-5;u<=5;u+=5){F.box(u,.8,11,1.1,.1,1.1,0x76654f);F.box(u,.4,11,.1,.8,.1,0x373c36);}
  },[sign(-400,-110,5,'PIZZA · GELATO','#486244',3.1,.8,'',Math.PI)]);
  add('mocaloca',-471,-103,[473653355],F=>{
    F.wall(0,0,11,13,7,0xa85a44,F.rows(2));F.roof(0,0,12,14,7,3.5,0x49705b);
    F.box(0,8.2,4,3.5,2.2,3,0xc6c4af);F.win(0,8.4,5.6,2,1.4);F.roof(0,4,4,3.8,9.3,1,0x52755f,'gable');
    F.porch(11,7.4);F.roof(0,7.4,12,3.2,3.6,.7,0x47765b);F.door(3,6.6);
  },[sign(-471,-110.9,5,'MOCA-LOCA','#405c45',3.6,.8,'CAFÉ',Math.PI)]);
  add('garage143',-514,-152,[473653344],F=>{
    F.wall(0,0,14,12,4.2,0xd4d2c4);F.box(0,4.3,0,14.4,.65,12.4,0xb14c49);
    F.box(4.5,2.6,1,4,5.2,10,0xd5d2c2);F.box(4.5,5.3,1,4.4,.4,10.4,0xb14c49);
    for(const u of [-4.5,.2]){F.box(u,1.65,6.1,3.8,3.2,.12,0xe2dfd1);for(let j=0;j<3;j++)for(let i=0;i<2;i++)F.box(u-1.1+i*2.2,1+j*.7,6.2,.8,.3,.1,0x343b3b);}
    F.door(4.6,6.2);for(let i=0;i<3;i++)for(let j=0;j<4;j++){const q=F.p(-8-i*.8,3);F.K.mb.cyl(q[0],.18+j*.35,q[1],.55,.32,8,rgb(0x252827));}
  },[sign(-509.5,-145.6,4,'GARAGE','#303837',3.8,.95,'Hugo Caumartin')]);
  add('oldlibrary',-662,-50,[68609085],F=>{
    F.wall(0,0,28,22,8,0xa7a79a,F.rows(2));F.roof(0,0,29,23,8,2.8,0x545d54);
    F.wall(0,9,13,6,9.1,0xa7a79a,F.rows(2));F.roof(0,9,14,7,9.1,2.6,0x899084,'gable');
    for(const u of [-4,0,4])F.arch(u,4.7,12.15,1.5,3.1);
    F.door(-3,12.1);F.door(3,12.1);F.steps(0,12.8,10);F.box(0,1,16,4,.4,2,0x8f9387);
    for(const u of [-1,0,1]){const q=F.p(u,16);F.K.mb.cyl(q[0],2,q[1],.35,1.7,7,rgb(0x58685e));F.K.mb.cyl(q[0],3.05,q[1],.4,.6,7,rgb(0x58685e));}
  },[sign(-662,-62.4,7,'ANCIENNE BIBLIOTHÈQUE','#4d5c4d',3.4,1.1,'FERMÉE — DÉGÂTS D’EAU',Math.PI)]);
  add('aydelu',-661,3,[68609642],F=>{F.wall(0,0,29,27,4.4,0x9c4f3c);F.roof(0,0,30,28,4.4,6,0x82674e,'gable');F.door(9,13.6);},[sign(-661,-11,8,'BINGO','#e8dfc6',4.6,1.4,'AYDELU',Math.PI)]);
  add('galaxie',-670,48,[68609238],F=>{F.wall(0,0,38,36,4.5,0xd8d7c9,F.rows(1));F.box(0,4.5,0,39,.4,37,0xbbbdb3);F.porch(9,19);F.roof(0,19,10,5,3.6,2.8,0xbec2b7,'gable');F.door(0,18.1);},[sign(-670,27,9,'GALAXIE','#325986',4,1.6,'SALLE DE QUILLES · BOWLING',Math.PI)]);
  add('frankarena',-606,79,[68609092],F=>{F.wall(0,0,35,79,4,0xa7664b);F.wall(0,0,35,79,7.2,0x718f9a,[{y0:4.2,y1:6,w:1.5,gap:3,margin:4}]);F.box(0,2,40,35,4,.2,0xa7664b);F.roof(0,0,36,80,7.2,2.5,0x6a8e9f,'gable');F.door(0,40.2);},[sign(-606,38.5,10,'ARÉNA FRANK-ROBINSON','#42667f',3.4,1,'PATINAGE',Math.PI)],65);
  add('duchesnay',-655,134,[93974633],F=>{F.wall(0,0,52,64,10,0xbac3c3);F.roof(0,0,53,65,10,2,0xafbdbe,'gable');F.wall(0,30,49,8,3.6,0xa76451,F.rows(1));F.box(0,3.7,34.2,50,.2,.3,0xa33931);F.door(12,34.2);},[sign(-655,99.5,19,'ARÉNA ISABELLE-ET-PAUL-DUCHESNAY','#334453',3.9,1,'92',Math.PI)],65);
  add('morin',-1107,-44,[463458616],F=>{F.wall(-3,-2,7,15,5.5,0xb9bfc0,F.rows(2));F.roof(-3,-2,8,16,5.5,3,0x687372,'gable');F.wall(4,0,7,18,3.6,0xc6cbca,F.rows(1));F.box(4,3.7,0,7.3,.25,18.3,0xcbd0cc);for(const u of [-4,1]){F.door(u,9.1);F.roof(u,9.5,2.3,2,2.7,1,0x697672,'gable');}for(const v of [-3,1])F.box(-.8,6.3,v,1.1,.2,1.8,0x9eafb0);},[sign(-1107,-55,4.6,'Dr MORIN','#264a3e',1.7,1.3,'DENTISTE',Math.PI)]);
  add('clocklibrary',-742,-126.5,[1474477281],F=>{
    F.wall(0,0,49,30,13,0xa85a42,F.rows(4));F.box(0,13.2,0,50,.4,31,0x63796a);
    F.wall(19,13,8,8,20,0xa85a42);F.roof(19,13,9,9,20,4,0x8fa58b);
    for(const u of [-19,-11,-3,5,13])F.box(u,7,15.2,2.4,10,.2,0x99a58b);
    F.win(19,15.7,17.1,3,5);F.box(19,19,17.2,2.1,2.1,.15,0xc9d5b8);
    F.box(19,19.35,17.32,.07,.8,.05,0x405545);F.box(19.25,19,17.32,.55,.07,.05,0x405545);
    F.porch(9,17);F.roof(-19,17,10,7,3.5,3,0xa1b49d);F.door(-19,15.1);
  },[sign(-761,-110.5,7,'BIBLIOTHÈQUE LUCY-FARIS','#345c77',3.3,1,'')],65);
  // The home faces Denise-Friend to the south, regardless of Principale's rule.
  sites.push({key:'sayyadhome',cx:-720.5,cz:-465.4,r:24,near:340,hide:[{id:473653776,at:[-720.5,-465.4]}],site:()=>{},build:K=>{
    const F=frame(K,-720.5,-466,0);F.wall(0,0,6.5,12,6.1,0x506b4a);F.roof(0,0,7.1,12.6,6.1,1.2,0x4a4e43);
    for(const u of [-1.6,1.6])F.win(u,4.7,6.1,1.2,2.3);F.door(2,6.1);F.win(-1.5,1.9,6.1,1.25,2);
    F.porch(6.5,7,0x794a40);F.roof(0,7,7,3,3.5,.6,0x4b5044);F.box(-1,1.35,8,3.8,.09,.1,0x678061);
    for(let u=-3;u<.8;u+=1.2)F.box(u,.95,8,.08,.8,.1,0x678061);
  }});
  sites.find(s=>s.key==='solpfk').site=K=>lot(K,75,-191,43,38,0,{rows:2});
  sites.find(s=>s.key==='garage143').site=K=>lot(K,-514,-140,20,9,0,{rows:1});
  return sites;
}
