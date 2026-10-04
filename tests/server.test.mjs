import test from "node:test";
import assert from "node:assert/strict";
import { decide, parseAction, laserText } from "../server.mjs";
const sensors = {
  speed_m_s: 6,
  lane: 1,
  lateral_transition: false,
  lidar: [
    { lane: 0, range_m: 26 },
    { lane: 1, range_m: 4 },
    { lane: 2, range_m: 26 },
  ],
};
test("laser formatter preserves distances and current lane without solving the action", () => {
  const text = laserText(sensors, 300);
  assert.match(text, /CENTER lane \(current path\) distance=4 m/);
  assert.doesNotMatch(text, /wall|jump|turn|seed|map/i);
});
test("invalid or ambiguous output is an error, never a fallback action", () => {
  assert.equal(parseAction("RIGHT"), "RIGHT");
  assert.equal(parseAction('{"action":"LEFT"}'), "LEFT");
  assert.throws(() => parseAction("RIGHT or LEFT"));
  assert.throws(() => parseAction(""));
});
test("camera request excludes laser state even when included by caller", async () => {
  const orig = global.fetch;
  let payload;
  global.fetch = async (u, o) => {
    payload = JSON.parse(o.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "LEFT" } }] }),
    };
  };
  try {
    await decide({
      provider: "qwen",
      mode: "camera",
      image: "aGVsbG8=",
      sensors,
      speed: 6,
    });
    const user = payload.messages[1].content;
    assert.equal(user[1].type, "image_url");
    assert.equal(payload.response_format.type, "json_schema");
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.deepEqual(
      payload.response_format.json_schema.schema.properties.action.enum,
      ["LEFT", "RIGHT"],
    );
    assert.doesNotMatch(user[0].text, /lidar|range_m|readings|CENTER/);
    assert.match(user[0].text, /CAMERA/);
  } finally {
    global.fetch = orig;
  }
});
test("Jev image mode rejected before network call", async () => {
  await assert.rejects(
    decide({ provider: "jev", mode: "camera", image: "aGVsbG8=" }),
    /solo admite texto/,
  );
});
