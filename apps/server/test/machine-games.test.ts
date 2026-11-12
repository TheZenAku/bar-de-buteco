import assert from 'node:assert/strict';
import test from 'node:test';
import {createMachineGame,machineGameCorrect} from '../src/world/machine-games.js';

test('minigames da Ribeiro validam calibração, CNC, furação e acabamento',()=>{
  for(const kind of ['cut','machining','drill','finish'] as const){
    const game=createMachineGame(kind,'cut-1',1_000);assert.equal(game.kind,kind);assert.equal(game.expiresAt,61_000);
    const right=game.target??game.sequence!.join('|');assert.equal(machineGameCorrect(game,right),true);
    assert.equal(machineGameCorrect(game,typeof right==='number'?right+10:'errado'),false);
  }
});
