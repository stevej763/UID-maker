import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v1, v3, v4, v5, v6, v7, inspect, NAMESPACES, NIL, MAX } from '../js/uuid.js';

const re = (v) => new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${v}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

test('v4 format and uniqueness', () => {
  const set = new Set();
  for (let i = 0; i < 10000; i++) {
    const u = v4();
    assert.match(u, re(4));
    set.add(u);
  }
  assert.equal(set.size, 10000);
});

test('v1 format, uniqueness and timestamp', () => {
  const before = Date.now();
  const ids = Array.from({ length: 5000 }, v1);
  ids.forEach((u) => assert.match(u, re(1)));
  assert.equal(new Set(ids).size, ids.length);
  const ts = inspect(ids[0]).timestamp.getTime();
  assert.ok(Math.abs(ts - before) < 1000);
});

test('v6 format, ordering and timestamp', () => {
  const before = Date.now();
  const ids = Array.from({ length: 5000 }, v6);
  ids.forEach((u) => assert.match(u, re(6)));
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Math.abs(inspect(ids[0]).timestamp.getTime() - before) < 1000);
});

test('v7 format, ordering and timestamp', () => {
  const before = Date.now();
  const ids = Array.from({ length: 20000 }, v7);
  ids.forEach((u) => assert.match(u, re(7)));
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Math.abs(inspect(ids[0]).timestamp.getTime() - before) < 1000);
});

test('v3 known vector', () => {
  assert.equal(v3('www.example.com', NAMESPACES.DNS), '5df41881-3aed-3515-88a7-2f4a814cf09e');
});

test('v5 known vector', async () => {
  assert.equal(await v5('www.example.com', NAMESPACES.DNS), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
});

test('inspect handles nil, max, braces and invalid input', () => {
  assert.equal(inspect(NIL).version, 'Nil');
  assert.equal(inspect(MAX).version, 'Max');
  assert.equal(inspect('{2ED6657D-E927-568B-95E1-2665A8AEA6A2}').version, 5);
  assert.equal(inspect('2ed6657de927568b95e12665a8aea6a2').variant, 'RFC 9562');
  assert.equal(inspect('not a uuid').valid, false);
});
