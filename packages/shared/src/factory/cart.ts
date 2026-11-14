import data from './cart-data.json';
import {floorHeight,isClear} from '../world.js';
/**
 * EMPRESA BRASIL's platform cart (empresa_brasil_carrinho.glb + .json; the numbers in cart-data.json come from tools/assets/factory-cart-data.mjs):
 * one per plant, six 25 kg sacks (two piles of three, lying). The room owns it (position, sacks, who pushes); browsers only draw it. Its node, EB_Carrinho,
 * sits on the floor under the deck's centre, front +x, handle at -x. `yaw` is the node's rotation about Y in radians (0: as authored, front at +x),
 * so its front points to (cos yaw, -sin yaw) on the ground; a player facing `rotation` (atan2(dx,dz)) has the cart ahead when yaw = rotation - PI/2.
 */
export type CartMaterial='MALTE'|'MIX';
/** A sack on the cart: its kind and the shelf it came from (where it goes back if it is returned). */
export interface CartBag {material:CartMaterial;origin:string}
export interface CartPose {x:number;y:number;z:number;yaw:number}
/** What the room publishes (factory.cart): the pose, the sacks from the bottom up, whoever pushes it. */
export interface CartView extends CartPose {bags:CartMaterial[];pusher:string|null}

export interface CartSlot {node:string;x:number;y:number;z:number;yawDeg:number}
export const FACTORY_CART={
  capacity:data.capacity,
  park:{x:data.park.x,y:data.park.y,z:data.park.z,yaw:data.park.yawDeg*Math.PI/180},
  slots:data.slots as unknown as readonly CartSlot[],
  /** The deck (box on the floor, node's local axes). */
  deck:data.deck as unknown as {min:readonly [number,number,number];max:readonly [number,number,number]},
  /** Where the hands go (node's local axes). */
  handle:data.handle as unknown as readonly [number,number,number],
  /** One sack (m): length, width, thickness. */
  bag:data.bag as unknown as readonly [number,number,number],
  loadedHeight:data.loadedHeight,
} as const;
export const CART_CAPACITY=FACTORY_CART.capacity;

/** Metres from the pusher to the cart's middle (the deck is 0.94 m long, its handle 0.36 m ahead of the pusher). */
export const CART_FOLLOW=.95;
/** Metres the cart comes in towards its pusher, at a time, when the place ahead is taken. */
const CART_FOLLOW_STEP=.05;
/** Metres from the cart's middle within which a player can push it, load it and unload it (the pusher is 0.95 from it). */
export const CART_REACH=2.5;
/** Metres from the cart's middle at which a pusher lets go (it was left behind). */
export const CART_LET_GO=2.5;
/** The handle's zone (m from the handle, on the ground): a loaded cart's E there pushes it, elsewhere it hands over a sack. */
export const CART_HANDLE_REACH=1.2;
/** The cart does not climb: the pusher this far above the cart's floor, or a floor this far off, and it stays where it is. */
export const CART_CLIMB=.5;
/** How fast the cart's heading follows the pusher's (1/s) and the most it moves in a second (m/s, faster than a run). */
const TURN_RATE=9,MAX_SPEED=9;

/** Whether a body at (x,z) is near enough to the cart to work on it. */
export const cartNear=(cart:CartPose,x:number,z:number,y=cart.y,reach=CART_REACH):boolean=>Math.hypot(x-cart.x,z-cart.z)<=reach&&Math.abs(y-cart.y)<=1.6;
/** The yaw (node rotation) a cart pushed by someone facing `rotation` takes. */
export const cartYawFor=(rotation:number):number=>rotation-Math.PI/2;
/** The cart's forward unit vector on the ground. */
export const cartForward=(yaw:number):{x:number;z:number}=>({x:Math.cos(yaw),z:-Math.sin(yaw)});
/** A point of the cart's local frame (x forward, y up, z across) in the world. */
export function cartPoint(cart:CartPose,local:readonly [number,number,number]):{x:number;y:number;z:number} {
  const c=Math.cos(cart.yaw),s=Math.sin(cart.yaw);
  return {x:cart.x+local[0]*c+local[2]*s,y:cart.y+local[1],z:cart.z-local[0]*s+local[2]*c};
}
/** The handle in the world: what a loaded cart's E at it pushes. */
export const cartHandle=(cart:CartPose)=>cartPoint(cart,FACTORY_CART.handle);
export const wrapAngle=(angle:number):number=>Math.atan2(Math.sin(angle),Math.cos(angle));

/**
 * The cart's collision core as sample discs (node's local axes): a 5 x 5 grid of CART_BODY_RADIUS discs covering 0.68 m along x 0.60 m across,
 * the 0.68 m room a person takes. The deck itself is 0.94 x 0.80 m, but a cart as wide as the deck would find no room wherever a person walks
 * hugging a wall (the pusher stands 0.34 m from it), and the edges that overhang the core only brush a wall. The old check asked a person's whole
 * 0.34 m body at three points of the cart's axis, 1.3 m ahead of the pusher: the cart snagged in every aisle, door and corner.
 */
const CART_BODY_RADIUS=.08,CART_BODY_HEIGHT=1,CART_CORE_ALONG=.26,CART_CORE_ACROSS=.22;
const FOOTPRINT:ReadonlyArray<readonly [number,number]>=(()=>{
  const points:Array<readonly [number,number]>=[];
  for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)points.push([i*CART_CORE_ALONG/2,j*CART_CORE_ACROSS/2]);
  return points;
})();

/** Whether the cart can stand at (x,z) heading `yaw`: its core clear of walls, shelves, machines and closed doors, with floor under the middle and both ends. */
export function cartClear(x:number,z:number,yaw:number,y:number):boolean {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  for(const [a,b] of FOOTPRINT)if(!isClear(x+a*c+b*s,z-a*s+b*c,y,CART_BODY_RADIUS,CART_BODY_HEIGHT))return false;
  const f=cartForward(yaw),half=(FACTORY_CART.deck.max[0]-FACTORY_CART.deck.min[0])/2-.12;
  return [0,half,-half].every(along=>floorHeight(x+f.x*along,z+f.z*along,y)!==undefined);
}

/**
 * One step of the cart being pushed (the room runs it with the pusher's true position, the pusher's browser with the predicted one, so it does not trail):
 * its heading follows the pusher's and it stands CART_FOLLOW ahead on that heading. It never blocks on a wall or an object: when the place ahead is taken
 * it comes in towards the pusher until its whole deck is clear (at the pusher's feet at worst), so it slides along walls, turns in aisles and goes through
 * doors wherever a person fits. It still does not climb: the pusher this far above its floor, and it stays where it is.
 * 'moved' the pose changed, 'blocked' the pusher is on another floor (it stays), 'still' nothing to do.
 */
export function stepCart(cart:CartPose,driver:{x:number;y:number;z:number;rotation:number},dt:number):'moved'|'blocked'|'still' {
  if(driver.y-cart.y>CART_CLIMB)return 'blocked';
  const seconds=Math.min(Math.max(dt,0),.2);
  const yaw=cart.yaw+wrapAngle(cartYawFor(driver.rotation)-cart.yaw)*(1-Math.exp(-TURN_RATE*seconds));
  const f=cartForward(yaw);
  let follow=CART_FOLLOW,wantX=driver.x+f.x*follow,wantZ=driver.z+f.z*follow;
  // The nearest-to-normal distance at which the deck is clear; the pusher's own spot is always the last resort.
  while(follow>0&&!cartClear(wantX,wantZ,yaw,cart.y)){follow=Math.max(0,follow-CART_FOLLOW_STEP);wantX=driver.x+f.x*follow;wantZ=driver.z+f.z*follow;}
  const gap=Math.hypot(wantX-cart.x,wantZ-cart.z),reach=MAX_SPEED*seconds,k=gap>reach?reach/gap:1;
  if(gap<1e-4&&Math.abs(yaw-cart.yaw)<1e-4)return 'still';
  let x=cart.x+(wantX-cart.x)*k,z=cart.z+(wantZ-cart.z)*k;
  // Lagging behind a quick turn, the in-between pose could clip a wall the wanted one clears: then it goes straight to the wanted one.
  if(k<1&&!cartClear(x,z,yaw,cart.y)){x=wantX;z=wantZ;}
  const floor=floorHeight(x,z,cart.y)??floorHeight(x,z,driver.y);
  cart.x=x;cart.z=z;cart.yaw=yaw;if(floor!==undefined)cart.y=floor;
  return 'moved';
}
