import http from "node:http";
import { readDb, mutateDb } from "./lib/store.js";
import { applyCorrection, presentGroup, validateGroupInput, GroupError } from "./lib/grouping.js";
import { page } from "./lib/page.js";

const port = Number(process.env.PORT || 3037);
const statLabels = ["待试磨", "已试磨", "重点观察"];
let idSeq = 0;

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GroupError(400, "bad_json", "请求体不是有效JSON");
  }
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
function newId() { return "IS-" + Date.now().toString(36) + (idSeq++).toString(36); }
function newGroupId(db) {
  let id;
  do { id = "CG-" + Date.now().toString(36) + "-" + (idSeq++).toString(36); } while (db.groups.some(g => g.id === id));
  return id;
}
function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}
function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}
const findItem = (items, ref) => items.find(x => x.id === ref || x.code === ref);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") return html(res, page());
    if (req.method === "GET" && url.pathname === "/api/items") return send(res, 200, (await readDb()).items.map(summarize));
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = await mutateDb(async db => {
        const created = { id: newId(), ...input, logs: [{ at: new Date().toISOString(), step: "建档", note: "创建墨锭" }] };
        db.items.unshift(created);
        return created;
      });
      return send(res, 201, item);
    }
    const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (patch && req.method === "PATCH") {
      const input = await body(req);
      const item = await mutateDb(async db => {
        const found = findItem(db.items, patch[1]);
        if (!found) throw new GroupError(404, "item_not_found", "找不到该墨锭");
        Object.assign(found, input);
        found.logs ||= [];
        found.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + found.status });
        return found;
      });
      return send(res, 200, item);
    }
    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const input = await body(req);
      const item = await mutateDb(async db => {
        const found = findItem(db.items, log[1]);
        if (!found) throw new GroupError(404, "item_not_found", "找不到该墨锭");
        found.logs ||= [];
        found.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
        return found;
      });
      return send(res, 201, item);
    }
    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const input = await body(req);
      const item = await mutateDb(async db => {
        const found = findItem(db.items, action[1]);
        if (!found) throw new GroupError(404, "item_not_found", "找不到该墨锭");
        found.logs ||= [];
        const score = Number(input.score || 0);
        found.tests ||= [];
        found.tests.push({ at: new Date().toISOString(), ...input, score });
        found.status = score >= 85 ? "已试磨" : "重点观察";
        found.logs.push({ at: new Date().toISOString(), step: "试磨", note: (input.paper || "试纸") + "，评分" + score, score });
        return found;
      });
      return send(res, 201, item);
    }
    if (req.method === "GET" && url.pathname === "/api/groups") {
      const db = await readDb();
      return send(res, 200, db.groups.map(g => presentGroup(g, db.items)));
    }
    if (req.method === "POST" && url.pathname === "/api/groups") {
      const input = await body(req);
      const group = await mutateDb(async db => {
        const { refs, conditions, key } = validateGroupInput(db.items, input);
        const created = {
          id: newGroupId(db),
          name: String(input.name || "").trim() || `${key.smokeSource}·${key.glueRatio}·${key.ageYears}年`,
          key,
          members: refs,
          conditions,
          revision: 1,
          createdAt: new Date().toISOString(),
          history: [{ at: new Date().toISOString(), type: "create", note: "建组锁定条件", conditions }]
        };
        db.groups.unshift(created);
        return presentGroup(created, db.items);
      });
      return send(res, 201, group);
    }
    const correct = url.pathname.match(/^\/api\/groups\/([^/]+)\/correct$/);
    if (correct && req.method === "POST") {
      const input = await body(req);
      const group = await mutateDb(async db => {
        const found = db.groups.find(g => g.id === correct[1]);
        if (!found) throw new GroupError(404, "group_not_found", "找不到该试磨组");
        applyCorrection(found, input, db.items);
        return presentGroup(found, db.items);
      });
      return send(res, 200, group);
    }
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats((await readDb()).items));
    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, error.status || 500, { error: error.code || "server_error", message: error.message });
  }
});
server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
