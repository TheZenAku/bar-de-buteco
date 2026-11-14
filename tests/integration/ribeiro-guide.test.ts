import assert from 'node:assert/strict';
import test from 'node:test';
import {RIBEIRO_CUTTERS,RIBEIRO_MACHINING,emptyRibeiroState,type RibeiroView} from '@bar/shared';
import {ribeiroGuide} from '../../apps/web/src/machine-shop/guide.js';

const view=():RibeiroView=>({...emptyRibeiroState(),purchaseOrders:[],candidates:[],busyStations:[],me:{userId:'worker',carrying:null,role:'employee',canManage:false,canBootstrap:false}});

test('guia Ribeiro segue a peça e pula máquinas ocupadas',()=>{
  const state=view();state.me.carrying={orderId:'op',weapon:'pistola',stage:'raw'};state.busyStations=[RIBEIRO_CUTTERS[0].id];
  assert.equal(ribeiroGuide(state).spot.id,RIBEIRO_CUTTERS[1].id);
  state.me.carrying.stage='cut';state.busyStations=[RIBEIRO_MACHINING[0].id];
  assert.equal(ribeiroGuide(state).spot.id,RIBEIRO_MACHINING[1].id);
});

test('guia Ribeiro manda retirar a peça na máquina que concluiu e depois volta à preparação',()=>{
  const state=view(),now=Date.now();state.orders.push({id:'op',weapon:'pistola',status:'cut-ready',operatorId:'worker',operatorName:'Operador',stationId:'cut-3',createdAt:now,updatedAt:now});
  assert.equal(ribeiroGuide(state).spot.id,'cut-3');assert.match(ribeiroGuide(state).title,/retirar peça/i);
  state.orders[0]!.status='queued';state.orders[0]!.stationId='';
  assert.equal(ribeiroGuide(state).spot.id,'preparation');
});
