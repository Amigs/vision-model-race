import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  LANES,
  course,
  createRun,
  advance,
  apply,
  observation,
  reference,
  GOAL,
} from "../public/physics.mjs";
test("three lanes and exactly two actions", () => {
  assert.equal(LANES.length, 3);
  assert.deepEqual(ACTIONS, ["LEFT", "RIGHT"]);
  const s = createRun();
  s.status = "running";
  assert.throws(() => apply(s, "JUMP"));
  assert.throws(() => apply(s, "STRAIGHT"));
});
test("left/right move one lane and clamp at track edges", () => {
  const s = createRun();
  s.status = "running";
  apply(s, "LEFT");
  assert.equal(s.targetLane, 0);
  apply(s, "LEFT");
  assert.equal(s.targetLane, 0);
  apply(s, "RIGHT");
  assert.equal(s.targetLane, 1);
  apply(s, "RIGHT");
  assert.equal(s.targetLane, 2);
  apply(s, "RIGHT");
  assert.equal(s.targetLane, 2);
});
test("same seed reproduces track; other seeds differ", () => {
  assert.deepEqual(course(17), course(17));
  assert.notDeepEqual(course(17), course(31));
  for (const seed of [17, 31, 73]) {
    assert(course(seed).every((o) => o.type === "wall"));
    for (const z of new Set(course(seed).map((o) => o.z)))
      assert(course(seed).filter((o) => o.z === z).length < 3);
  }
});
test("world advances and collides without a response", () => {
  const s = createRun();
  s.status = "running";
  advance(s, 5);
  assert.equal(s.status, "crashed");
  assert(s.z < 18);
  assert(s.time < 5);
});
test("long frames cannot skip collisions", () => {
  const a = createRun(),
    b = createRun();
  a.status = b.status = "running";
  advance(a, 4);
  for (let i = 0; i < 480; i++) advance(b, 1 / 120);
  assert.equal(a.status, b.status);
  assert(Math.abs(a.z - b.z) < 0.001);
});
test("planar scan has one distance per lane and no height or hidden map", () => {
  const o = observation(createRun());
  assert(!("objects" in o));
  assert(!("seed" in o));
  assert(!("z" in o));
  assert(!("airborne" in o));
  assert.equal(o.lidar.length, 3);
  assert.equal(o.lidar[1].range_m, 17.1);
  for (const beam of o.lidar)
    assert.deepEqual(Object.keys(beam).sort(), ["lane", "range_m"]);
});
test("reference completes all offered tracks/speeds with 100ms response + 100ms interval", () => {
  for (const seed of [17, 31, 73])
    for (const speed of [4, 6, 9]) {
      const s = createRun(seed, speed);
      s.status = "running";
      while (s.status === "running" && s.time < 40) {
        const action = reference(s);
        advance(s, 0.1);
        apply(s, action);
        advance(s, 0.1);
      }
      assert.equal(s.status, "finished", `${seed}/${speed}`);
      assert.equal(s.z, GOAL);
    }
});
