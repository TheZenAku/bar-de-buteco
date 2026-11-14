import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CART_CAPACITY,CART_FOLLOW,CART_HANDLE_REACH,FACTORY_CART,cartForward,cartHandle,cartNear,cartPoint,cartClear,cartYawFor,stepCart,type CartPose} from '@bar/shared/factory';
import {isWalkable,movePlayer,solidColliders} from '@bar/shared';
import {FactoryDirector} from '../src/world/factory/index.js';

const folder=fileURLToPath(new URL('../data/factory/',import.meta.url));
const markers=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_marcadores.json'),'utf8'));
const stock=JSON.parse(fs.readFileSync(path.join(folder,'empresa_brasil_estoque.json'),'utf8'));
const RACK_MALTE='Ponto_EB_Rack_V1N1P1',RACK_MIX='Ponto_EB_Rack_V3N1P1';
const plant=()=>{const factory=new FactoryDirector({markers,stock});factory.setStock(RACK_MALTE,18);factory.setStock(RACK_MIX,18);return factory;};
const total=(factory:FactoryDirector,material:string)=>factory.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
const park={...FACTORY_CART.park};

test('o carrinho nasce estacionado em Ponto_EB_Carrinho, vazio e sem ninguém empurrando; os números vêm do JSON do modelo',()=>{
  const factory=plant();
  assert.deepEqual({x:factory.cart.x,y:factory.cart.y,z:factory.cart.z,yaw:factory.cart.yaw},{x:346.3,y:.17,z:-59.1,yaw:0});
  assert.deepEqual(factory.cart.bags,[]);assert.equal(factory.cart.pusher,null);
  assert.equal(CART_CAPACITY,6);assert.equal(FACTORY_CART.slots.length,6);
  assert.deepEqual(FACTORY_CART.slots.map(slot=>slot.node),[1,2,3,4,5,6].map(i=>`Slot_Saco_${i}`));
  // Two piles of three: the same height ladder on both sides of the middle, 16 cm apart.
  assert.deepEqual(FACTORY_CART.slots.map(slot=>slot.x),[-.225,-.225,-.225,.225,.225,.225]);
  assert.ok(Math.abs(FACTORY_CART.slots[1]!.y-FACTORY_CART.slots[0]!.y-.16)<1e-9);
  // The handle is behind the deck (-x): at yaw 0 it is west of the middle, and a cart turned a quarter swings it round.
  assert.ok(cartHandle(park).x<park.x-.5);
  const turned=cartPoint({...park,yaw:Math.PI/2},FACTORY_CART.handle);assert.ok(Math.abs(turned.x-park.x)<1e-6&&turned.z>park.z+.5);
});

test('seis sacos no carrinho, o sétimo recusa sem tirar nada da prateleira; sacos de materiais diferentes se misturam',()=>{
  const factory=plant();
  for(const marker of [RACK_MALTE,RACK_MIX,RACK_MALTE,RACK_MIX,RACK_MALTE,RACK_MALTE])factory.takeToCart(marker);
  assert.deepEqual(factory.cart.bags.map(bag=>bag.material),['MALTE','MIX','MALTE','MIX','MALTE','MALTE']);
  assert.equal(total(factory,'MALTE'),14,'4 de MALTE saíram da prateleira');
  const before=[total(factory,'MALTE'),total(factory,'MIX')];
  assert.throws(()=>factory.takeToCart(RACK_MALTE),/O carrinho está cheio \(6\/6\)/);
  assert.deepEqual([total(factory,'MALTE'),total(factory,'MIX')],before,'a prateleira não perdeu o sétimo saco');
  assert.throws(()=>factory.putOnCart({material:'MIX',origin:RACK_MIX}),/cheio/);
  assert.equal(factory.cart.bags.length,6);
  assert.deepEqual(factory.cartView().bags,['MALTE','MIX','MALTE','MIX','MALTE','MALTE']);
});

test('descarregar tira o de cima, com a prateleira de origem; devolvido, o saco volta à prateleira certa',()=>{
  const factory=plant();factory.takeToCart(RACK_MALTE);factory.takeToCart(RACK_MIX);
  const top=factory.unloadFromCart();assert.deepEqual(top,{material:'MIX',origin:RACK_MIX});
  assert.equal(factory.cart.bags.length,1);
  const quantity=(marker:string)=>factory.slots.find(slot=>slot.marker===marker)!.quantity;
  assert.equal(quantity(RACK_MIX),17);factory.returnBag(top.origin,top.material);assert.equal(quantity(RACK_MIX),18);
  // A sack put on the cart by hand keeps the shelf it came from.
  factory.putOnCart({material:'MALTE',origin:RACK_MALTE});assert.deepEqual(factory.cart.bags.at(-1),{material:'MALTE',origin:RACK_MALTE});
  assert.deepEqual(factory.unloadFromCart(),{material:'MALTE',origin:RACK_MALTE});factory.unloadFromCart();
  assert.throws(()=>factory.unloadFromCart(),/vazio/);
});

test('o estoque não some: o que está no carrinho conta como retirado e é salvo como se estivesse na prateleira; reset estaciona vazio',()=>{
  const factory=plant();factory.takeToCart(RACK_MALTE);factory.takeToCart(RACK_MALTE);factory.takeToCart(RACK_MIX);
  const quantity=(slots:Array<{marker:string;quantity:number}>,marker:string)=>slots.find(slot=>slot.marker===marker)!.quantity;
  assert.equal(quantity(factory.snapshot().slots,RACK_MALTE),16);
  assert.equal(quantity(factory.persistentSlots(),RACK_MALTE),18);assert.equal(quantity(factory.persistentSlots(),RACK_MIX),18);
  assert.equal(quantity(factory.snapshot().slots,RACK_MALTE),16,'salvar não mexe no estoque vivo');
  // A restart restores the saved stock and the cart comes back parked and empty.
  const next=new FactoryDirector({markers,stock});next.restore(factory.snapshot(),factory.persistentSlots());
  assert.equal(quantity(next.snapshot().slots,RACK_MALTE),18);assert.deepEqual(next.cart.bags,[]);assert.equal(next.cart.x,park.x);
  factory.setCartPusher('alice');factory.cart.x+=5;
  factory.reset();assert.deepEqual({x:factory.cart.x,z:factory.cart.z,bags:factory.cart.bags,pusher:factory.cart.pusher},{x:park.x,z:park.z,bags:[],pusher:null});
});

test('versão do carrinho anda com cada mudança, e o ponto de empurrar só liga um empurrador',()=>{
  const factory=plant();const start=factory.cart.version;
  factory.takeToCart(RACK_MALTE);assert.ok(factory.cart.version>start);
  const v=factory.cart.version;factory.setCartPusher('alice');assert.ok(factory.cart.version>v);
  const w=factory.cart.version;factory.setCartPusher('alice');assert.equal(factory.cart.version,w,'sem mudança, a versão não anda');
  assert.equal(factory.cartView().pusher,'alice');
});

// ---- the cart's physics (stepCart) ----
/** A heading in which a stretch of floor of `length` metres from `from` is walkable (the plant's own floor). */
function openHeading(from:{x:number;z:number},floor:number,length=4):number {
  for(let k=0;k<16;k++){
    const rotation=k*Math.PI/8,dx=Math.sin(rotation),dz=Math.cos(rotation);
    if(Array.from({length:Math.ceil(length*4)+1},(_,i)=>i/4).every(d=>isWalkable(from.x+dx*d,from.z+dz*d,floor)))return rotation;
  }
  throw new Error('sem trecho livre ao lado do carrinho');
}

test('stepCart: o carrinho vai 0,95 m à frente de quem empurra, na direção em que ele olha, com a guinada suave',()=>{
  const cart:CartPose={...park};
  const start={x:park.x,z:park.z-1.2};
  const rotation=openHeading(start,park.y,4);
  const driver={x:start.x,y:park.y,z:start.z,rotation};
  for(let i=0;i<80;i++)stepCart(cart,driver,.05);
  const forward=cartForward(cartYawFor(rotation));
  assert.ok(Math.abs(cart.x-(driver.x+forward.x*CART_FOLLOW))<.01&&Math.abs(cart.z-(driver.z+forward.z*CART_FOLLOW))<.01,'0,95 m à frente');
  assert.ok(Math.abs(Math.atan2(Math.sin(cart.yaw-cartYawFor(rotation)),Math.cos(cart.yaw-cartYawFor(rotation))))<.01);
  // The heading glides: a quarter turn takes more than one tick.
  const turning=Math.atan2(Math.sin(rotation+Math.PI/2),Math.cos(rotation+Math.PI/2)),before=cart.yaw;
  stepCart(cart,{...driver,rotation:turning},.05);
  assert.ok(Math.abs(cart.yaw-before)>.01&&Math.abs(cart.yaw-cartYawFor(turning))>.3,'gira aos poucos');
});

test('stepCart: acompanha o jogador andando, sem ficar para trás',()=>{
  const cart:CartPose={...park},from={x:park.x,z:park.z-1.2},rotation=openHeading(from,park.y,5);
  const dx=Math.sin(rotation),dz=Math.cos(rotation);
  const driver={x:from.x,y:park.y,z:from.z,rotation};
  for(let i=0;i<12;i++){driver.x+=dx*.15;driver.z+=dz*.15;stepCart(cart,driver,.05);}// 3 m/s
  const gap=Math.hypot(cart.x-driver.x,cart.z-driver.z);
  assert.ok(Math.abs(gap-CART_FOLLOW)<.05,`a distância é ${gap.toFixed(3)}`);
});

test('stepCart: não sobe escada nem degrau; diante de uma parede o carrinho se aproxima de quem empurra em vez de travar ou atravessar',()=>{
  const cart:CartPose={...park},from={x:park.x,z:park.z-1.2},rotation=openHeading(from,park.y,3);
  for(let i=0;i<60;i++)stepCart(cart,{x:from.x,y:park.y,z:from.z,rotation},.05);
  const settled={...cart};
  // The pusher up a flight (a platform 2 m high): the cart stays where it is.
  assert.equal(stepCart(cart,{x:from.x+.3,y:park.y+2,z:from.z,rotation},.05),'blocked');assert.deepEqual(cart,settled);
  // Facing a wall: its normal place would put the deck in the wall, so it comes in towards the pusher until the whole deck is clear. It is never 'blocked'.
  const wall=solidColliders().find(box=>box.hx>.3&&box.hz>.3&&(box.maxY??9)>1.5&&(box.minY??0)<.5&&Math.hypot(box.x-park.x,box.z-park.z)<30&&isWalkable(box.x-box.hx-1.5,box.z,park.y));
  assert.ok(wall,'há uma parede perto do carrinho');
  const near={x:wall!.x-wall!.hx-1.0,z:wall!.z},facing=Math.PI/2;
  const free:CartPose={x:near.x-1.5,y:park.y,z:near.z,yaw:cartYawFor(facing)};
  const results=new Set<string>();
  for(let i=0;i<40;i++)results.add(stepCart(free,{x:near.x,y:park.y,z:near.z,rotation:facing},.05));
  assert.ok(!results.has('blocked'),'parede não trava o carrinho');
  assert.ok(free.x+.34<=wall!.x-wall!.hx+.001,'o núcleo do carrinho fica fora da parede');
  assert.ok(cartClear(free.x,free.z,free.yaw,free.y),'em lugar livre');
  assert.ok(Math.hypot(free.x-near.x,free.z-near.z)<CART_FOLLOW,'veio para perto de quem empurra');
});

test('stepCart: empurrado em círculos pela fábrica, o carrinho nunca entra em parede nem objeto, nunca trava e nunca fica para trás',()=>{
  // A person walks all over the plant (shelves, tanks, doors, corners); the cart, a body of its own size, must stay clear everywhere a clear place exists near the pusher.
  const cart:CartPose={...park,yaw:0};
  let pos:{x:number;z:number;y:number}={x:park.x,z:park.z-1.2,y:park.y},seed=7;
  const random=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
  let rotation=0,clipped=0,left=0,steps=0;
  for(let i=0;i<6000;i++){
    if(i%25===0)rotation+=(random()-.5)*Math.PI;
    const input={dx:Math.sin(rotation),dz:Math.cos(rotation),running:false,jump:false};
    const next=movePlayer({x:pos.x,y:pos.y,z:pos.z},input,.05);
    // Hit something: turn the way a person would.
    if(Math.hypot(next.x-pos.x,next.z-pos.z)<.01)rotation+=Math.PI/2+random();
    pos={x:next.x,y:next.y,z:next.z};
    if(Math.abs(pos.y-park.y)>.4){pos={x:park.x,z:park.z-1.2,y:park.y};continue;}// wandered up a stair: not the floor the cart works on
    const result=stepCart(cart,{x:pos.x,y:pos.y,z:pos.z,rotation},.05);
    steps++;
    assert.notEqual(result,'blocked','nunca trava');
    if(Math.hypot(cart.x-pos.x,cart.z-pos.z)>CART_FOLLOW+.3)left++;
    // Only where even the pusher's own spot cannot hold the deck may it overlap (a cart wider than the aisle).
    if(!cartClear(cart.x,cart.z,cart.yaw,cart.y)&&cartClear(pos.x,pos.z,cart.yaw,cart.y))clipped++;
  }
  assert.ok(steps>3000,`andou ${steps} passos`);
  assert.equal(left,0,'sem ficar para trás');
  assert.equal(clipped,0,'sem atravessar onde há lugar');
});

test('alcance do carrinho: perto do meio, no mesmo piso; a alça fica atrás do convés',()=>{
  const cart:CartPose={...park};
  assert.equal(cartNear(cart,park.x+2,park.z,park.y),true);assert.equal(cartNear(cart,park.x+2.6,park.z,park.y),false);
  assert.equal(cartNear(cart,park.x,park.z,park.y+2),false,'a plataforma dos tanques não alcança o carrinho do chão');
  const handle=cartHandle(cart);assert.ok(Math.hypot(handle.x-cart.x,handle.z-cart.z)>CART_HANDLE_REACH/3&&Math.hypot(handle.x-cart.x,handle.z-cart.z)<CART_HANDLE_REACH);
});
