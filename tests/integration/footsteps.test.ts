import test from 'node:test';
import assert from 'node:assert/strict';
import {floorHeight,floorSurface,MAP_SURFACES,CITY_FLOORS} from '@bar/shared';
import {footstepSurfaceAt} from '../../apps/web/src/engine/footstep-surface';

test('footsteps use the reachable support on stacked floors and ramps',()=>{
  for(const surface of MAP_SURFACES){
    const mean=(axis:number)=>surface.points.reduce((sum,p)=>sum+p[axis],0)/3;
    const x=mean(0),y=mean(1),z=mean(2),support=floorSurface(x,z,y);
    assert.equal(support?.y,floorHeight(x,z,y));
    assert.ok(support,`${surface.id} must be supported`);
    if(surface.id.startsWith('COL_Palco'))assert.equal(footstepSurfaceAt(x,y,z),'wood');
    if(surface.id.startsWith('COL_Predio'))assert.equal(footstepSurfaceAt(x,y,z),'tile');
  }
  assert.equal(footstepSurfaceAt(10,.3,-5),'tile');
  assert.equal(footstepSurfaceAt(10,3.45,-5),'tile');
  assert.equal(footstepSurfaceAt(10,20,-5),undefined,'no footsteps in the air');
});

test('street, pavement, grass and dirt have distinct profiles',()=>{
  assert.equal(footstepSurfaceAt(-5,0,0),'asphalt');
  assert.equal(footstepSurfaceAt(-1,.15,0),'concrete');
  assert.equal(footstepSurfaceAt(47,.15,20),'grass');
  assert.equal(footstepSurfaceAt(60,.15,25),'dirt');
  const planter=CITY_FLOORS.find(surface=>surface.id.startsWith('COL_Cid_Canteiro'))!;
  const mean=(axis:number)=>planter.points.reduce((sum,p)=>sum+p[axis],0)/3;
  assert.equal(footstepSurfaceAt(mean(0),mean(1),mean(2)),'grass');
});
