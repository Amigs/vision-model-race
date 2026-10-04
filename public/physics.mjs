export const LANES = [-2.4, 0, 2.4],
  GOAL = 120,
  RANGE = 26,
  ACTIONS = ["LEFT", "RIGHT"];
export const FIXED_STEP = 1 / 120;
export function seeded(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function course(seed = 17) {
  const rand = seeded(seed),
    objects = [];
  for (let row = 0; row < 7; row++) {
    const lane = row === 0 ? 1 : Math.floor(rand() * 3);
    objects.push({
      id: row,
      lane,
      x: LANES[lane],
      z: 18 + row * 14,
      width: 2.12,
      depth: 1.1,
      height: 2.8,
      type: "wall",
    });
  }
  return objects;
}
export function createRun(seed = 17, speed = 6) {
  return {
    seed,
    speed,
    objects: course(seed),
    x: LANES[1],
    z: 0,
    y: 0,
    targetLane: 1,
    time: 0,
    status: "ready",
    collision: null,
    lastAction: null,
    actionAppliedAt: 0,
  };
}
// Actions move one lane relative to the current target; repeated outward actions at the edge hold the edge lane.
export function apply(s, action) {
  if (!ACTIONS.includes(action)) throw Error("Invalid action");
  if (s.status !== "running") return false;
  s.targetLane = Math.max(
    0,
    Math.min(2, s.targetLane + (action === "LEFT" ? -1 : 1)),
  );
  s.lastAction = action;
  s.actionAppliedAt = s.time;
  return true;
}
export function advance(s, seconds) {
  if (s.status !== "running") return;
  let left = seconds;
  while (left > 1e-9 && s.status === "running") {
    const dt = Math.min(left, FIXED_STEP);
    left -= dt;
    s.time += dt;
    s.z += s.speed * dt;
    const d = LANES[s.targetLane] - s.x;
    s.x += Math.sign(d) * Math.min(Math.abs(d), 8 * dt);
    for (const o of s.objects) {
      if (
        Math.abs(s.z - o.z) < o.depth / 2 + 0.38 &&
        Math.abs(s.x - o.x) < o.width / 2 + 0.34
      ) {
        s.status = "crashed";
        s.collision = { ...o, impact_time: s.time, robot_x: s.x, robot_z: s.z };
        break;
      }
    }
    if (s.z >= GOAL && s.status === "running") {
      s.z = GOAL;
      s.status = "finished";
    }
  }
}
// 2D planar corridor scan: one longitudinal clearance for each lane, no height data.
export function scan(s) {
  return LANES.map((x, lane) => {
    let range = RANGE;
    for (const o of s.objects) {
      const d = o.z - o.depth / 2 - s.z - 0.38;
      if (d < -0.5 || d > RANGE || Math.abs(o.x - x) > o.width / 2) continue;
      range = Math.min(range, Math.max(0, d));
    }
    return { lane, range_m: Math.round(range * 10) / 10 };
  });
}
export function observation(s) {
  return {
    speed_m_s: s.speed,
    lane: s.targetLane,
    lateral_transition: Math.abs(s.x - LANES[s.targetLane]) > 0.15,
    lidar: scan(s),
  };
}
// Explicitly labelled programmed reference, never an AI fallback.
export function reference(s) {
  const o = observation(s),
    lane = o.lane;
  const safe = [lane - 1, lane + 1]
    .filter((x) => x >= 0 && x < 3)
    .sort((a, b) => o.lidar[b].range_m - o.lidar[a].range_m);
  if (
    o.lidar[lane].range_m < s.speed * 0.9 + 1.4 &&
    safe.length &&
    o.lidar[safe[0]].range_m > o.lidar[lane].range_m
  )
    return safe[0] < lane ? "LEFT" : "RIGHT";
  return lane === 0
    ? "LEFT"
    : lane === 2
      ? "RIGHT"
      : o.lidar[0].range_m >= o.lidar[2].range_m
        ? "LEFT"
        : "RIGHT";
}
