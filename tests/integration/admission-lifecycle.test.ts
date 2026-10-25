import test from 'node:test';
import assert from 'node:assert/strict';
import {AdmissionLifecycle} from '../../apps/web/src/admission-lifecycle.ts';

test('leaving during loading invalidates every continuation from that entry',()=>{
  const lifecycle=new AdmissionLifecycle();
  const entry=lifecycle.beginEntry()!;
  assert.equal(lifecycle.isCurrentEntry(entry),true);
  const departure=lifecycle.beginExit()!;
  assert.equal(lifecycle.phase,'leaving');
  assert.equal(lifecycle.isCurrentEntry(entry),false);
  assert.equal(lifecycle.completeEntry(entry),false);
  assert.equal(lifecycle.completeExit(departure),true);
  assert.equal(lifecycle.phase,'outside');
});

test('concurrent entries are serialized and an old generation cannot complete a retry',()=>{
  const lifecycle=new AdmissionLifecycle();
  const first=lifecycle.beginEntry()!;
  assert.equal(lifecycle.beginEntry(),undefined);
  const departure=lifecycle.beginExit()!;
  lifecycle.completeExit(departure);
  const second=lifecycle.beginEntry()!;
  assert.notEqual(first.generation,second.generation);
  assert.equal(lifecycle.completeEntry(first),false);
  assert.equal(lifecycle.completeEntry(second),true);
  assert.equal(lifecycle.phase,'inside');
});

test('repeated departure shares one transition and stale completion is harmless',()=>{
  const lifecycle=new AdmissionLifecycle();
  lifecycle.completeEntry(lifecycle.beginEntry()!);
  const departure=lifecycle.beginExit()!;
  assert.equal(lifecycle.beginExit(),undefined);
  assert.equal(lifecycle.completeExit(departure),true);
  assert.equal(lifecycle.completeExit(departure),false);
  assert.equal(lifecycle.beginExit(),undefined);
});

test('a failed entry can leave cleanly and permits a fresh attempt',()=>{
  const lifecycle=new AdmissionLifecycle();
  const failed=lifecycle.beginEntry()!;
  const cleanup=lifecycle.failEntry(failed)!;
  assert.equal(lifecycle.failEntry(failed),undefined);
  assert.equal(lifecycle.completeEntry(failed),false);
  assert.equal(lifecycle.completeExit(cleanup),true);
  const retry=lifecycle.beginEntry()!;
  assert.equal(lifecycle.completeEntry(retry),true);
});
