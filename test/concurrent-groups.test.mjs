import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

const tmpDir = join(os.tmpdir(), "ink-group-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
const dataFile = join(tmpDir, "db.json");
const port = 41000 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
let server;

async function req(method, path, payload) {
  const res = await fetch(base + path, {
    method,
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data.error}`);
  return data;
}

function record(stick, score, sediment, extra = {}) {
  return { stickId: stick, paper: "宣纸", water: "20滴", roomTemp: "22℃", speed: "中",
    colorLayer: "匀", sediment, score, note: "", ...extra };
}

before(async () => {
  await mkdir(tmpDir, { recursive: true });
  server = spawn(process.execPath, [join(process.cwd(), "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile },
    stdio: ["ignore", "pipe", "inherit"]
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server start timeout")), 10000);
    server.stdout.on("data", chunk => {
      if (String(chunk).includes("listening")) { clearTimeout(timer); resolve(); }
    });
    server.on("exit", code => reject(new Error("server exited " + code)));
  });

  // 九锭：三组各三锭，同烟料、同胶比、同年限
  const mk = [];
  for (const [g, codes] of [["A", [1, 2, 3]], ["B", [1, 2, 3]], ["C", [1, 2, 3]]]) {
    for (const n of codes) {
      mk.push(req("POST", "/api/items", {
        code: `TST-${g}${n}`, smokeSource: "黄山松烟", glueRatio: "8%",
        ageYears: 4, storage: `试样柜${g}`, status: "待试磨"
      }));
    }
  }
  await Promise.all(mk);
});

after(async () => {
  server.kill("SIGTERM");
  await rm(tmpDir, { recursive: true, force: true });
});

test("种子试磨组直接给出平均值和最突出的一锭", async () => {
  const groups = await req("GET", "/api/groups");
  const seed = groups.find(g => g.id === "GR-0001");
  assert.ok(seed, "新数据文件应带演示组");
  assert.equal(seed.conclusion.kind, "ok");
  assert.equal(seed.conclusion.averageScore, 86.3);
  assert.equal(seed.conclusion.standoutCode, "IS-010");
  assert.deepEqual(seed.sticks.map(s => s.latest.sediment), ["少", "少", "少"]);
});

test("三人同时提交不同组：三组都建成，互不丢单", async () => {
  const created = await Promise.all(["A", "B", "C"].map(g =>
    req("POST", "/api/groups", {
      name: `并发组${g}`, smokeSource: "黄山松烟", glueRatio: "8%", ageYears: 4,
      paper: "宣纸", water: "20滴", roomTemp: "22℃",
      stickIds: [`TST-${g}1`, `TST-${g}2`, `TST-${g}3`]
    })
  ));
  const ids = created.map(g => g.id);
  assert.equal(new Set(ids).size, 3, "三个组 ID 必须各不相同");
  const groups = await req("GET", "/api/groups");
  for (const g of ["A", "B", "C"]) {
    assert.ok(groups.some(x => x.name === `并发组${g}`), `并发组${g} 必须在记录中`);
  }
});

test("三锭条件不一致不能建组", async () => {
  await assert.rejects(
    req("POST", "/api/groups", {
      smokeSource: "黄山松烟", glueRatio: "8%", ageYears: 4,
      paper: "宣纸", water: "20滴", roomTemp: "22℃",
      stickIds: ["TST-A1", "TST-A2", "IS-001"]
    }),
    /不一致/
  );
});

test("两轮各 9 条并发录入：记录全保留，每锭取最近有效结果", async () => {
  const groupIds = Object.fromEntries(
    (await req("GET", "/api/groups"))
      .filter(g => ["并发组A", "并发组B", "并发组C"].includes(g.name))
      .map(g => [g.name.slice(-1), g.id])
  );

  const round1 = [];
  for (const [g, scores] of [["A", [80, 82, 81]], ["B", [70, 72, 71]], ["C", [75, 77, 76]]]) {
    scores.forEach((s, i) => round1.push(req("POST", `/api/groups/${groupIds[g]}/records`, record(`TST-${g}${i + 1}`, s, "少"))));
  }
  await Promise.all(round1);

  const round2 = [];
  const plan = [
    ["A", [88, 85, 86], ["少", "少", "少"]],
    ["B", [95, 84, 86], ["少", "少", "少"]],   // 差 11 分：不给结论
    ["C", [88, 86, 84], ["少", "少", "中"]]    // 沉淀不一致：不给结论
  ];
  for (const [g, scores, seds] of plan) {
    scores.forEach((s, i) => round2.push(req("POST", `/api/groups/${groupIds[g]}/records`, record(`TST-${g}${i + 1}`, s, seds[i]))));
  }
  await Promise.all(round2);

  const groups = await req("GET", "/api/groups");
  for (const g of ["A", "B", "C"]) {
    const live = groups.find(x => x.id === groupIds[g]);
    assert.equal(live.records.length, 6, `组${g}两轮并发共 6 条，一条都不能丢`);
    assert.deepEqual(live.sticks.map(s => s.latest.score), plan.find(p => p[0] === g)[1]);
  }

  const a = groups.find(x => x.id === groupIds.A);
  assert.equal(a.conclusion.kind, "ok");
  assert.equal(a.conclusion.averageScore, 86.3);
  assert.equal(a.conclusion.standoutCode, "TST-A1");

  const b = groups.find(x => x.id === groupIds.B);
  assert.equal(b.conclusion.kind, "inconclusive");
  assert.equal(b.conclusion.reason, "spread");

  const c = groups.find(x => x.id === groupIds.C);
  assert.equal(c.conclusion.kind, "inconclusive");
  assert.equal(c.conclusion.reason, "sediment");
});

test("同组并发补录同样一条不丢，最近结果按写入序号确定", async () => {
  const groups = await req("GET", "/api/groups");
  const aId = groups.find(x => x.name === "并发组A").id;
  await Promise.all([1, 2, 3, 4, 5, 6].map(n =>
    req("POST", `/api/groups/${aId}/records`, record("TST-A1", 60 + n, "少", { speed: `第${n}次` }))
  ));
  let a = (await req("GET", "/api/groups")).find(x => x.id === aId);
  assert.equal(a.records.length, 12, "6 条并发补录必须全部落盘");
  // 并发到达顺序不保证，但“最近”必须是写入序号最大的那条，且在 61..66 之间
  const concurrent = a.records.slice(-6);
  const maxSeq = Math.max(...concurrent.map(r => r.seq));
  const expected = concurrent.find(r => r.seq === maxSeq).score;
  assert.ok(expected >= 61 && expected <= 66);
  assert.equal(a.sticks.find(s => s.stickId === "TST-A1").latest.score, expected);
  // 再顺序补一条，结果必须确定地变成它
  a = await req("POST", `/api/groups/${aId}/records`, record("TST-A1", 70, "少", { speed: "收尾" }));
  assert.equal(a.sticks.find(s => s.stickId === "TST-A1").latest.score, 70);
});

test("一次改两个条件：保存但判无效，不参与组结论", async () => {
  const groups = await req("GET", "/api/groups");
  const cId = groups.find(x => x.name === "并发组C").id;
  await req("POST", `/api/groups/${cId}/records`,
    record("TST-C3", 85, "少", { paper: "皮纸", water: "25滴" }));
  let c = (await req("GET", "/api/groups")).find(x => x.id === cId);
  assert.equal(c.records.length, 7, "无效记录也必须保留");
  assert.equal(c.records.at(-1).valid, false);
  assert.equal(c.conclusion.reason, "sediment", "无效记录不参与判定，结论不变");

  // 更正这条结果：加水量改回锁定值，只剩纸样一项变化 → 转为最近有效结果
  c = await req("PATCH", `/api/groups/${cId}/records/${c.records.at(-1).id}`, { water: "20滴" });
  assert.equal(c.records.length, 7, "更正不得新增或删除记录");
  assert.equal(c.records.at(-1).valid, true);
  assert.deepEqual(c.records.at(-1).changed, ["paper"]);
  assert.equal(c.conclusion.kind, "ok");
  assert.equal(c.conclusion.averageScore, 86.3);
  assert.equal(c.conclusion.standoutCode, "TST-C1");
  const voidEntry = c.history.find(h => h.type === "void");
  const recalcEntry = c.history.find(h => h.type === "recalc");
  assert.ok(voidEntry && /作废/.test(voidEntry.note) && /沉淀等级不一致/.test(voidEntry.note));
  assert.ok(recalcEntry && /平均86.3/.test(recalcEntry.note));
});

test("更正锁定条件后整组结论作废并重算", async () => {
  let c = (await req("GET", "/api/groups")).find(x => x.name === "并发组C");
  // C2 再录一条只改加水量的高分结果：成立的结论变为平均 88.3、最突出 C2
  c = await req("POST", `/api/groups/${c.id}/records`, record("TST-C2", 92, "少", { water: "25滴" }));
  assert.equal(c.conclusion.kind, "ok");
  assert.equal(c.conclusion.averageScore, 88.3);
  assert.equal(c.conclusion.standoutCode, "TST-C2");

  // 锁定纸样由宣纸更正为皮纸：上条结果同时差纸样和加水量（两项）→ 失效，
  // C2 回退到上一条最近有效结果，旧结论作废并重算。
  c = await req("PATCH", `/api/groups/${c.id}`, { paper: "皮纸" });
  assert.equal(c.conclusion.kind, "ok");
  assert.equal(c.conclusion.averageScore, 86.3);
  assert.equal(c.conclusion.standoutCode, "TST-C1");
  const voids = c.history.filter(h => h.type === "void");
  assert.ok(voids.some(h => /锁定条件更正/.test(h.note) && /平均88.3/.test(h.note) && /TST-C2/.test(h.note)),
    "作废旧结论必须留痕");
  assert.ok(c.history.some(h => h.type === "recalc" && /平均86.3/.test(h.note)));
  assert.equal(c.records.length, 8, "全程只追加/更正，记录数不丢");
});
