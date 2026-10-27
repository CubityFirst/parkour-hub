import * as THREE from 'three';
import './style.css';

type Roof = { x:number; z:number; w:number; d:number; y:number; name:string };
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div id="game"></div><div id="vignette"></div>
<header id="hud" class="hidden"><div class="brand">S<span>///</span>R</div><div class="timer"><small>RUN TIME</small><b id="time">00:00.00</b></div><div class="stage"><small>ROUTE</small><b id="stage">01 — GET MOVING</b></div><div class="speed"><b id="speed">00</b><small>KM/H</small></div></header>
<div id="crosshair" class="hidden"><i></i><i></i><i></i><i></i></div><div id="hint" class="hidden"></div><div id="toast"></div><div id="moveflash"></div>
<section id="menu" class="screen"><div class="menu-card"><div class="eyebrow"><span></span> CITY PARKOUR / 01</div><h1>SKY<span>LINE</span></h1><p class="subtitle">Find your line. Keep your flow.</p><p class="intro">A rooftop sprint across the city. Read the red, trust your momentum, and make the jump.</p><button id="start" class="primary">RUN THE ROUTE <span>→</span></button><div class="controls"><div><kbd>W A S D</kbd><span>MOVE</span></div><div><kbd>SHIFT</kbd><span>SPRINT</span></div><div><kbd>SPACE</kbd><span>JUMP</span></div><div><kbd>CTRL</kbd><span>SLIDE</span></div><div><kbd>E</kbd><span>VAULT / GRAB</span></div><div><kbd>R</kbd><span>RESTART CHECKPOINT</span></div></div><label class="setting">MOUSE SENSITIVITY <input id="sensitivity" type="range" min="30" max="120" value="75"><span id="sensval">75</span></label><div class="footnote">BEST RUN <b id="bestmenu">—</b><span>•</span> HEADPHONES RECOMMENDED</div></div></section>
<section id="pause" class="screen hidden"><div class="pause-card"><div class="eyebrow"><span></span> BREATHER</div><h2>PAUSED</h2><p>Catch your breath. The roof can wait.</p><button id="resume" class="primary">BACK TO THE RUN <span>→</span></button><button id="restart" class="quiet">RESTART FROM CHECKPOINT</button><div class="pause-tip"><kbd>ESC</kbd> RESUME</div></div></section>
<section id="finish" class="screen hidden"><div class="finish-card"><div class="eyebrow"><span></span> ROUTE COMPLETE</div><h2>YOU<br>MADE IT<span>.</span></h2><p class="finish-caption">Clean line. Nice run.</p><div class="result"><span>YOUR TIME</span><b id="finaltime">00:00.00</b></div><div class="result best"><span>PERSONAL BEST</span><b id="finalbest">00:00.00</b></div><button id="again" class="primary">RUN IT AGAIN <span>→</span></button></div></section>`;

const gameEl = document.querySelector<HTMLDivElement>('#game')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bd8fa); scene.fog = new THREE.Fog(0x9bd8fa, 100, 390);
const camera = new THREE.PerspectiveCamera(76, innerWidth/innerHeight, .08, 600);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12; gameEl.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe6f7ff,0x9baab8,2.0));
const sun = new THREE.DirectionalLight(0xfff5df,3.3); sun.position.set(-35,65,22); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-100; sun.shadow.camera.right=100; sun.shadow.camera.top=100; sun.shadow.camera.bottom=-180; sun.shadow.bias=-.0002; scene.add(sun);
const mat=(color:number,roughness=.74,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const white=mat(0xf2f5f5), concrete=mat(0xbfc9cf), edge=mat(0x697985,.56), red=mat(0xf02c39,.35), redDark=mat(0x941d2a,.45), glass=mat(0x26708c,.22,.32), windowMat=mat(0x173e55,.3,.25), yellow=mat(0xffb83d,.45);
const boxGeo=new THREE.BoxGeometry(1,1,1);
function box(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material, cast=true){const o=new THREE.Mesh(boxGeo,m);o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=cast;o.receiveShadow=true;scene.add(o);return o;}
const roofs:Roof[]=[
 {x:0,z:3,w:17,d:28,y:0,name:'WARM-UP'}, {x:0,z:-25,w:14,d:15,y:.3,name:'ROOFTOP JUMPS'}, {x:1,z:-45,w:15,d:19,y:.15,name:'ROOFTOP JUMPS'},
 {x:1,z:-67,w:16,d:21,y:.15,name:'SLIDE LINE'}, {x:1,z:-91,w:16,d:17,y:.15,name:'WALL RUN'}, {x:-1,z:-114,w:17,d:19,y:.5,name:'COMBINATION'},
 {x:1,z:-137,w:17,d:21,y:.5,name:'FINAL SPRINT'}, {x:1,z:-161,w:19,d:22,y:.2,name:'FINISH'}
];
for(const r of roofs){box(r.x,r.y-.48,r.z,r.w,.96,r.d,white);box(r.x,r.y+.015,r.z,r.w-.18,.035,r.d-.18,mat(0xf9fbfb),false); // parapets frame the route
 const sideX=r.w/2; box(r.x-sideX,r.y+.28,r.z,.18,.55,r.d,edge,false);box(r.x+sideX,r.y+.28,r.z,.18,.55,r.d,edge,false);
 box(r.x,r.y+.28,r.z-r.d/2,r.w,.55,.18,edge,false);
 // interrupted red route edge at forward exit
 box(r.x,r.y+.06,r.z+r.d/2-.35,2.2,.12,.22,red,false);
}
// A bright city canyon; repeated towers use shared geometry/materials.
let seed=571;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<110;i++){const side=i%2?1:-1,z=12-rand()*250,x=side*(16+rand()*95),w=8+rand()*24,d=10+rand()*28,h=17+rand()*85;const m=i%4===0?glass:(i%3===0?mat(0xcbdde5,.25,.2):mat(0xe3eaec));box(x,h/2-8,z,w,h,d,m,false);box(x,h-8,z,w+.2,.28,d+.2,white,false);
 // restrained horizontal window bands on foreground towers
 if(i<32){for(let y=4;y<h-7;y+=4){box(x,y,z-d/2-.025,w*.92,.11,.04,windowMat,false);}}
}
// Roof service equipment and red runner's vision markers.
function marker(x:number,y:number,z:number,h=2.3){box(x,y+h/2,z,.16,h,.16,red,false);box(x,y+h,z,.82,.12,.16,red,false);}
for(const [x,y,z] of [[0,0,-8],[0,.3,-33],[1,.15,-55],[1,.15,-78],[1,.15,-101],[-1,.5,-125],[1,.5,-149]] as number[][]) marker(x,y,z);
// Tutorial vault and slide bays.
box(0,.65,-1.8,2.1,1.3,.8,red);box(1,.55,-62.5,1.2,1.1,.8,edge);box(-2,.55,-66.5,1.2,1.1,.8,edge);box(1,.55,-71,1.2,1.1,.8,edge);
// Three clearance bars along the slide corridor.
for(const z of [-64,-69,-73]){box(1,1.25,z,10,.22,.23,red,false);box(-3.9,.8,z,.22,1.5,.22,redDark,false);box(5.9,.8,z,.22,1.5,.22,redDark,false);}
// Wall-run wall beside the deliberately wide crossing.
box(7,3.25,-89, .7,6.2,14,red);box(6.57,3.25,-89,.12,6.2,14,redDark,false);
// Zipline cable and trolley between combination roof and final sprint.
const cableStart=new THREE.Vector3(-4,7,-119), cableEnd=new THREE.Vector3(4,4,-139);const cableDir=new THREE.Vector3().subVectors(cableEnd,cableStart);const cable=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,cableDir.length(),8),redDark);cable.position.copy(cableStart).add(cableEnd).multiplyScalar(.5);cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),cableDir.clone().normalize());scene.add(cable);
for(const p of [cableStart,cableEnd]){box(p.x, p.y/2,p.z,.32,p.y,.32,edge);box(p.x,p.y+.12,p.z,.8,.24,.8,red);}
// Roof vents, antennas and strips create scale without obscuring the route.
for(const r of [roofs[0],roofs[2],roofs[5],roofs[7]]){for(let i=0;i<4;i++){const x=r.x-5+i*3.1,z=r.z+2;box(x,r.y+.48,z,1.2,.8,1.5,concrete);box(x,r.y+.9,z-.77,1.2,.08,.08,edge,false);}}
// Distant skyline silhouettes and cloud puffs.
const cloudMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,opacity:.8});for(let i=0;i<25;i++){const c=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),cloudMat);c.scale.set(5+rand()*9,1.2+rand()*2,2);c.position.set((rand()-.5)*220,27+rand()*28,-35-rand()*250);scene.add(c);}

const keys=new Set<string>(); let yaw=0,pitch=0,mouseSense=.00075;let active=false,paused=false,finished=false,started=false,sliding=false,grounded=false,wallRun=0,zip=false,vault=0,runClock=0,toastClock=0,airtime=0,hadPointerLock=false;
const player={x:0,y:0,z:13,vx:0,vy:0,vz:0,slide:0};let checkpoint={x:0,y:0,z:13,clock:0};let checkpointIndex=0;const startClock=0;
const hud=document.querySelector('#hud')!,crosshair=document.querySelector('#crosshair')!,hint=document.querySelector<HTMLDivElement>('#hint')!,menu=document.querySelector('#menu')!,pauseScreen=document.querySelector('#pause')!,finishScreen=document.querySelector('#finish')!;
const timeEl=document.querySelector('#time')!,stageEl=document.querySelector('#stage')!,speedEl=document.querySelector('#speed')!;const toastEl=document.querySelector<HTMLDivElement>('#toast')!;
const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}.${String(Math.floor((s%1)*100)).padStart(2,'0')}`;
function toast(msg:string){toastEl.textContent=msg;toastEl.classList.add('show');toastClock=2.4;}
function hideScreens(){menu.classList.add('hidden');pauseScreen.classList.add('hidden');finishScreen.classList.add('hidden');}
function enter(){if(finished){resetRun();}hideScreens();started=true;document.body.requestPointerLock?.();active=true;hud.classList.remove('hidden');crosshair.classList.remove('hidden');toast('RUNNER VISION ONLINE · FOLLOW THE RED');}
function pause(){if(!started||finished)return;active=false;paused=true;pauseScreen.classList.remove('hidden');document.exitPointerLock?.();}
function resetRun(){finished=false;paused=false;active=false;runClock=0;checkpointIndex=0;checkpoint={x:0,y:0,z:13,clock:0};Object.assign(player,{x:0,y:0,z:13,vx:0,vy:0,vz:0,slide:0});sliding=false;zip=false;wallRun=0;vault=0;document.querySelector('#finish')!.classList.add('hidden');document.querySelector('#menu')!.classList.remove('hidden');document.querySelector('#hud')!.classList.add('hidden');document.querySelector('#crosshair')!.classList.add('hidden');}
document.querySelector('#start')!.addEventListener('click',enter);document.querySelector('#resume')!.addEventListener('click',()=>{paused=false;enter();});document.querySelector('#restart')!.addEventListener('click',()=>{Object.assign(player,{x:checkpoint.x,y:checkpoint.y,z:checkpoint.z,vx:0,vy:0,vz:0});runClock=checkpoint.clock;sliding=false;zip=false;paused=false;enter();toast('CHECKPOINT RESTARTED');});document.querySelector('#again')!.addEventListener('click',resetRun);
const sens=document.querySelector<HTMLInputElement>('#sensitivity')!;sens.addEventListener('input',()=>{mouseSense=Number(sens.value)/100000;document.querySelector('#sensval')!.textContent=sens.value;});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===renderer.domElement){hadPointerLock=true;active=true;paused=false;pauseScreen.classList.add('hidden');}else if(hadPointerLock){hadPointerLock=false;if(started&&!finished&&!paused)pause();}});
document.addEventListener('mousemove',e=>{if(!active)return;yaw-=e.movementX*mouseSense;pitch-=e.movementY*mouseSense;pitch=THREE.MathUtils.clamp(pitch,-1.32,1.32);});
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='escape'&&started&&!paused&&!finished)pause();if(k==='r'&&started&&!finished){Object.assign(player,{x:checkpoint.x,y:checkpoint.y,z:checkpoint.z,vx:0,vy:0,vz:0});runClock=checkpoint.clock;sliding=false;zip=false;toast('BACK TO CHECKPOINT');}if(k===' '&&active&&grounded){player.vy=9.4;grounded=false;sliding=false;airtime=0;}if(k==='e'&&active){if(Math.abs(player.z+128)<6&&player.y<3.2){zip=true;player.vy=0;player.vx=0;player.vz=-18;toast('ZIPLINE · HOLD YOUR LINE');}else vault=0.38;}});document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
const raycaster=new THREE.Raycaster();const center=new THREE.Vector2(0,0);
function updateHint(){if(!active){hint.classList.add('hidden');return;}let msg='';if(Math.abs(player.z+128)<6&&player.y<3.3)msg='[ E ] GRAB ZIPLINE';else if(player.z>-2&&player.z<0)msg='[ E ] VAULT · [ SPACE ] JUMP';else if(player.z<-60&&player.z>-75)msg='[ CTRL ] SLIDE UNDER THE RED BARS';else if(player.z<-82&&player.z>-96)msg=wallRun>0?'WALL RUN · [ SPACE ] KICK OFF':'[ JUMP ] THEN RUN ALONG THE RED WALL';else if(Math.abs(player.z+103)<4)msg='[ SPACE ] CLEAR THE GAP';else if(Math.abs(player.z+10)<4||Math.abs(player.z+31)<4||Math.abs(player.z+54)<4)msg='[ SHIFT ] SPRINT  ·  [ SPACE ] JUMP';hint.textContent=msg;hint.classList.toggle('hidden',!msg);}
function land(){let floor:number|undefined;for(const r of roofs){if(Math.abs(player.x-r.x)<r.w/2-.35&&player.z<r.z+r.d/2-.25&&player.z>r.z-r.d/2+.25&&player.y<=r.y+.15)floor=r.y;}return floor;}
function respawn(){Object.assign(player,{x:checkpoint.x,y:checkpoint.y+.02,z:checkpoint.z,vx:0,vy:0,vz:0});sliding=false;zip=false;wallRun=0;toast('MISSED THE LINE · CHECKPOINT');}
function triggerFinish(){finished=true;active=false;document.exitPointerLock?.();const best=Number(localStorage.getItem('skyline-best')||0);const next=!best||runClock<best?runClock:best;if(next===runClock)localStorage.setItem('skyline-best',String(runClock));document.querySelector('#finaltime')!.textContent=fmt(runClock);document.querySelector('#finalbest')!.textContent=fmt(next);document.querySelector('#finish')!.classList.remove('hidden');document.querySelector('#hud')!.classList.add('hidden');document.querySelector('#crosshair')!.classList.add('hidden');}
function update(dt:number){if(!active)return;runClock+=dt;const fwdX=-Math.sin(yaw),fwdZ=-Math.cos(yaw),rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);let ix=(keys.has('d')?1:0)-(keys.has('a')?1:0),iz=(keys.has('s')?1:0)-(keys.has('w')?1:0);const mag=Math.hypot(ix,iz)||1;ix/=mag;iz/=mag;let wishX=rightX*ix+fwdX*(-iz),wishZ=rightZ*ix+fwdZ*(-iz);const sprint=keys.has('shift'),slideKey=keys.has('control')||keys.has('c');
 if(slideKey&&grounded&&(Math.hypot(player.vx,player.vz)>5||sprint)){sliding=true;player.slide=Math.max(player.slide,.65);}if(!slideKey&&player.slide<=0)sliding=false;if(player.slide>0)player.slide-=dt;
 const max=sprintingSpeed(sprint,sliding,zip);function sprintingSpeed(run:boolean,slide:boolean,zipline:boolean){return zipline?18:slide?Math.max(8,Math.hypot(player.vx,player.vz)):run?15.5:9.3;}
 const acceleration=grounded?(sliding?1.1:22):7;const targetX=wishX*max,targetZ=wishZ*max;player.vx=THREE.MathUtils.damp(player.vx,targetX,acceleration,dt);player.vz=THREE.MathUtils.damp(player.vz,targetZ,acceleration,dt);if(!ix&&!iz&&!sliding){player.vx*=Math.exp(-3*dt);player.vz*=Math.exp(-3*dt);}
 if(!grounded){player.vy-=zip?0:24*dt;airtime+=dt;}
 // Wall run is available only in the marked canyon and only briefly per jump.
 const nearWall=player.z<-83&&player.z>-96&&player.x>3.6&&player.x<7.8; if(!grounded&&nearWall&&sprint&&wallRun<1.1){wallRun+=dt;player.vy=Math.max(player.vy,-1.2);player.vz=-Math.max(12,Math.abs(player.vz));player.x=THREE.MathUtils.damp(player.x,5.25,5,dt);}else if(grounded)wallRun=0;
 if(keys.has(' ')&&wallRun>0&&wallRun<1.2){player.vy=8.2;player.vx=-5;wallRun=1.3;}
 if(zip){player.y=THREE.MathUtils.damp(player.y,3.7,3,dt);player.vz=-18;if(player.z<-138){zip=false;player.y=Math.max(0,player.y-1);}}
 if(vault>0){vault-=dt;player.vz=Math.min(player.vz,-11);player.vy=Math.max(player.vy,3.6);}
 const oldY=player.y,oldZ=player.z;player.x+=player.vx*dt;player.z+=player.vz*dt;player.y+=player.vy*dt;
 const floor=land();if(floor!==undefined&&player.vy<=0&&oldY>=floor-.04){if(!grounded&&airtime>.18){const speed=Math.hypot(player.vx,player.vz);player.vz*=speed>10?.94:.78;}player.y=floor;player.vy=0;grounded=true;airtime=0;}else grounded=false;
 // Prevent the tutorial vault block from stopping a clean jump; slide can pass its low service bars.
 if(player.z>-2.6&&player.z<-1.2&&Math.abs(player.x)<1.8&&player.y<1.4&&player.y>-.1){if(vault>0||player.vy>0){}else if(sliding){player.vz*=.97;}else{player.z=-1.2;player.vz=0;}}
 // The red service gantries really do require a low slide; their beams span the running lane.
 for(const barZ of [-64,-69,-73]){if(Math.abs(player.x-1)<4.8&&Math.abs(player.z-barZ)<.28&&!sliding&&player.y<.8){player.z=oldZ;player.vz=0;}}
 if(player.y<-14||player.z<-174)respawn();
 const reached=roofs.findIndex((r,i)=>i>checkpointIndex&&Math.abs(player.x-r.x)<r.w/2-.7&&player.z<=r.z+r.d/2-2&&player.z>=r.z-r.d/2+2);if(reached>=1&&reached<=6){checkpointIndex=reached;checkpoint={x:roofs[reached].x,y:roofs[reached].y,z:roofs[reached].z+roofs[reached].d/2-3,clock:runClock};toast(`CHECKPOINT ${String(reached).padStart(2,'0')} · ${roofs[reached].name}`);}
 if(player.z<-158&&player.z>-173&&Math.abs(player.x)<9)triggerFinish();
 const speed=Math.hypot(player.vx,player.vz);const desiredFov=76+Math.min(speed,16)*.38;camera.fov=THREE.MathUtils.damp(camera.fov,desiredFov,4,dt);camera.updateProjectionMatrix();const bob=grounded?Math.sin(runClock*(sliding?8:12))*Math.min(speed/80,.055):0;const eye=sliding?.72:1.65;camera.position.set(player.x,player.y+eye+bob,player.z);camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,wallRun>0?-.08:sliding?.035:0);
 timeEl.textContent=fmt(runClock);speedEl.textContent=String(Math.round(speed*3.6)).padStart(2,'0');const stage=roofs.findIndex(r=>player.z<r.z+r.d/2&&player.z>r.z-r.d/2);if(stage>=0)stageEl.textContent=`0${Math.min(stage+1,8)} — ${roofs[stage].name}`;updateHint();if(toastClock>0){toastClock-=dt;if(toastClock<=0)toastEl.classList.remove('show');}
}
let last=performance.now(),acc=0;const fixed=1/120;function frame(now:number){requestAnimationFrame(frame);const delta=Math.min((now-last)/1000,.08);last=now;acc+=delta;let steps=0;while(acc>=fixed&&steps<8){update(fixed);acc-=fixed;steps++;}renderer.render(scene,camera);}requestAnimationFrame(frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const saved=localStorage.getItem('skyline-best');if(saved){document.querySelector('#bestmenu')!.textContent=fmt(Number(saved));}
