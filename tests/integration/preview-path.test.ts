import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPath} from '../e2e/preview-path.ts';

test('reviewed previews are updated only with the explicit flag',()=>{
  const previous=process.env.UPDATE_PREVIEWS;
  try{
    delete process.env.UPDATE_PREVIEWS;
    assert.equal(previewPath('scene.png'),'test-results/previews/scene.png');
    process.env.UPDATE_PREVIEWS='1';
    assert.equal(previewPath('scene.png'),'docs/previews/scene.png');
    assert.throws(()=>previewPath('../escape.png'),/Invalid preview filename/);
  }finally{
    if(previous===undefined)delete process.env.UPDATE_PREVIEWS;else process.env.UPDATE_PREVIEWS=previous;
  }
});
