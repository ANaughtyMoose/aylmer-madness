// Tom's street-view references: period businesses, with measured map parcels.
// Later photographs guide architecture; 2004 names take precedence.
import {rgb} from '../core/mesh.js';
export function historicSites({rectRing,walls,lot,lightStandard}) {
  const sites=[];
  const box=(K,x,y,z,w,h,d,c,o={})=>K.mb.box(x,y,z,w,h,d,rgb(c),o);
  function shop(K,x,z,w,d,h,roof=0x9ba994,yaw=0,brick=0x987c65){
    const rows=[{y0:.45,y1:Math.min(3.6,h-1),w:2.1,gap:.6,margin:1.2,mullions:1,max:h>6?4:12}];
    walls(K,rectRing(x,z,w,d,yaw),0,h,{tint:rgb(brick),bar:0xb7b8ae},i=>(i===0||(i===3&&h<6))?rows:[]);
    K.mb.hip(x,h,z,w+1.2,d+1.2,h>6?3.2:2.2,rgb(roof),-yaw,.1);
  }
  const sign=(x,z,w,text,board,y=3.8,yaw=0,h=1,sub='')=>({x,z,w,text,board,y,yaw,h,sub});
  const add=(key,cx,cz,hide,build,site,signs,r=65)=>sites.push({key,cx,cz,r,near:340,hide:hide.map(id=>({id,at:[cx,cz]})),build,site,signs});
  const parking=(x,z,w,d)=>K=>{lot(K,x,z,w,d,0,{rows:2});lightStandard(K,x-w*.4,z,7);};
  add('loblaws',966,-390,[63155897,63155838,63155847,693930834,693930835,693930836],K=>{
    shop(K,970,-435,60,96,6.5,0xa0b19a,-.205,0x895e49);
    // Taller entry bay and the low green-roofed parade of small shops.
    shop(K,978,-383,28,16,8,0xa8b79d,-.205,0x925c45);
    shop(K,1003,-339,24,65,4.1,0xa0b19a,-.205);
    shop(K,896.7,-345,35,18,3.2,0xa0b19a,-.177,0x8f765b);
    box(K,898.2,3.2,-335.9,35,1,1,0x164b9b,{yaw:.177});
    // Familiar Blockbuster ticket standing above its blue fascia.
    box(K,898.2,4.2,-335.7,4.8,2,.25,0xe8bf32,{yaw:.177});
    box(K,951,4,-287,.4,8,.4,0x427d61);box(K,955,4,-287,.4,8,.4,0x427d61);
  },parking(944,-326,56,33),[
    sign(979,-374.5,18,'Loblaws','#ab2929',6.4,-.205,1.4),
    sign(898.2,-335.5,30,'BLOCKBUSTER VIDEO','#144fa4',2.8,-.177,.8),
    sign(999,-309,16,'MEXICALI ROSA’S','#bfa979',3.1,-.205,.85),
    sign(989,-351,15,'CAISSE DESJARDINS D’AYLMER','#24744d',3.2,-.205,.9),
    sign(953,-286.8,5.7,'Loblaws · Blockbuster','#2d6c53',5.5,0,1.5,'Caisse · Mexicali Rosa’s')],135);
  add('gabriel',367,-239,[94198063],K=>{
    shop(K,367,-239,18,24,3.3,0xa94332,-.09,0xa47f5f);
    // Pizza Hut's unmistakeable two-tier roof, kept after the conversion.
    box(K,367,4.25,-239,22,1.9,28,0xa74332,{wTop:12,dTop:14,yaw:.09});
    box(K,367,5.65,-239,12,1.2,14,0xb34f3a,{wTop:9,dTop:11,yaw:.09});
    for(let i=0;i<6;i++)box(K,358+i*3.5,.55,-223,.06,1.1,.06,0x393b33);
    box(K,367,1.05,-223,18,.06,.06,0x393b33);
    for(let i=0;i<3;i++){box(K,361+i*5,.75,-225,1.1,.1,1.1,0x8f7252);box(K,361+i*5,.35,-225,.1,.7,.1,0x393b33);}
  },parking(345,-245,17,28),[sign(367,-224.8,9,'Gabriel Pizza','#8e3527',4.1,0,.95)]);
  add('mcdonalds',318,-239,[68609494],K=>{
    shop(K,318,-240,17,28,4,0x737d76,-.09,0xb6afa0);
    box(K,321,4.4,-225,4,7,3,0xab2926);
    box(K,321,8.2,-225,5,1.3,4,0x69726c,{wTop:.1,dTop:4});
  },parking(299,-242,16,30),[sign(314,-225,10,'McDonald’s','#5b625c',3.6,0,1),sign(321,-223.3,2.4,'M','#b72b23',5,0,1.7)]);
  function station(key,x,z,ids,name,color,board){
    add(key,x,z,ids,K=>{
      shop(K,x,z-22,25,10,3.6,0xa7aaa2,0,0xb9b9a5);
      box(K,x,4.3,z,25,.65,12,color);
      for(const dx of [-8,8])for(const dz of [-3.8,3.8])box(K,x+dx,2,z+dz,.4,4,.4,0xc5c4b9);
      for(const dx of [-7,7]){
        box(K,x+dx,.16,z,2.3,.3,9,0xb7b7ac);
        for(const dz of [-2.5,2.5]){box(K,x+dx,1,z+dz,.9,1.6,.6,color);box(K,x+dx,1.35,z+dz+.32,.7,.6,.05,0x222a2c);}
        if(K.seg)K.seg(x+dx,z-4.5,x+dx,z+4.5);
      }
    },parking(x,z+1,40,34),[sign(x,z+6.2,19,name,board,4.05,0,.6),sign(x,z-16.8,16,key==='ultramar'?'Couche-Tard':name,board,2.6,0,.7)]);
  }
  station('esso',429,-231,[291696840],'ESSO',0xad3034,'#ab3034');
  station('ultramar',244,-215,[693950401],'Ultramar',0x254583,'#234c91');
  add('iga',177,-308,[693953703],K=>shop(K,177,-308,48,37,6.4,0xa39c8a,0,0xb9a082),parking(174,-274,42,23),[sign(177,-288.8,12,'IGA','#ad302d',4.4,0,1.3)]);
  add('timhortons',-243,-181,[94173715],K=>{
    shop(K,-243,-181,11,28,3.5,0x9f4633,0,0xc0b7a0);
    box(K,-243,5.3,-181,13,3.6,30,0xa44430,{wTop:.8,dTop:18});
    for(const z of [-186,-178]){
      box(K,-237.8,5,-0+z,2,2.3,2.1,0xc9c3af);
      box(K,-237.8,6.4,z,2.7,.8,2.7,0x9c4432,{wTop:.1,dTop:2.7});
      K.mb.panel(-236.7,5.2,z,1.2,1.5,1,0,rgb(0x273c44));
    }
  },parking(-264,-181,22,30),[sign(-235,-174,4,'Tim Hortons','#af3029',1.2,-Math.PI/2,1.1)]);
  add('edeycorner',570,-303,[],K=>{
    // Cemetery lies west of Edey; the golf grounds are east. The existing
    // map area supplies the grass, so no new surface overlaps either road.
    // Road-aligned perimeter and its colliders are built by world.js.
    for(const x of [518,531]){
      box(K,x,1.5,-232,1.1,3,1.2,0xbabdb6);
      if(K.seg)for(const dz of [-.6,.6])K.seg(x-.55,-232+dz,x+.55,-232+dz);
    }
    for(let row=0;row<8;row++)for(let col=0;col<8;col++){
      const x=481+col*15+(row%2)*2,z=-260-row*26;
      box(K,x,.48,z,.75+col%3*.2,.95, .28,0x999c98);
      box(K,x,.12,z,1.3,.24,.55,0xaeb0a6);
    }
    // The blue golf sign belongs on the opposite side of Samuel-Edey.
    box(K,647,1.7,-263,.12,3.4,.12,0x34453b);
  },()=>{},[sign(540,-231.8,8,'Cimetière Saint-Paul','#8c958b',.9,0,.7),sign(647,-263,2.8,'Club de Golf Gatineau','#244b87',2.1,0,2.4)],245);
  return sites;
}
