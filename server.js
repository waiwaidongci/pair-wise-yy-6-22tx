import http from "node:http";
import { loadDb, mutate, newGroupId, newRecordId, dbPath, initDb } from "./store.js";
import { assessRecord, validateCreate, presentGroup, findItem } from "./groups.js";
import { renderPage } from "./page.js";
const port = Number(process.env.PORT || 3037);
const stages = ["待试磨", "已试磨", "重点观察"];
const statLabels = ["待试磨", "已试磨", "重点观察"];

class HttpError extends Error {
  constructor(status, error) { super(error); this.status = status; }
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "请求不是合法 JSON"); }
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
function newId() { return "IS-" + Date.now(); }
function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) if (stats[item.status] !== undefined) stats[item.status] += 1;
  return stats;
}
function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}

function priorConclusionNote(result) {
  const c = result.conclusion;
  if (c.kind === "ok") return "原结论：平均" + c.averageScore + "分，最突出 " + c.standoutCode;
  if (c.kind === "pending") return "原状态：" + c.detail;
  return "原判定：" + c.detail;
}
function recalcNote(result) {
  const c = result.conclusion;
  if (c.kind === "ok") return "重算后：平均" + c.averageScore + "分，最突出 " + c.standoutCode + "（" + c.detail + "）";
  if (c.kind === "pending") return "重算后：" + c.detail;
  return "重算后：" + c.detail;
}

function getGroup(db, id) {
  const group = (db.groups || []).find(g => g.id === id);
  if (!group) throw new HttpError(404, "group_not_found");
  return group;
}
function getRecord(group, recordId) {
  const record = (group.records || []).find(r => r.id === recordId);
  if (!record) throw new HttpError(404, "record_not_found");
  return record;
}
function codeOf(group, items, stickId) {
  const item = findItem(items, stickId);
  return item ? item.code : stickId;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/") return html(res, renderPage());

    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, db.items.map(summarize));
    }
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = await mutate(d => {
        const it = { id: newId(), ...input, logs: [{ at: new Date().toISOString(), step: "建档", note: "创建墨锭" }] };
        d.items.unshift(it);
        return it;
      });
      return send(res, 201, item);
    }
    const patchItem = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (patchItem && req.method === "PATCH") {
      const input = await body(req);
      const item = await mutate(d => {
        const it = d.items.find(x => x.id === patchItem[1] || x.code === patchItem[1]);
        if (!it) throw new HttpError(404, "item_not_found");
        Object.assign(it, input);
        it.logs ||= [];
        it.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + it.status });
        return it;
      });
      return send(res, 200, item);
    }
    const addLog = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (addLog && req.method === "POST") {
      const input = await body(req);
      const item = await mutate(d => {
        const it = d.items.find(x => x.id === addLog[1] || x.code === addLog[1]);
        if (!it) throw new HttpError(404, "item_not_found");
        it.logs ||= [];
        it.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
        return it;
      });
      return send(res, 201, item);
    }
    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const input = await body(req);
      const item = await mutate(d => {
        const it = d.items.find(x => x.id === action[1] || x.code === action[1]);
        if (!it) throw new HttpError(404, "item_not_found");
        it.logs ||= [];
        const score = Number(input.score || 0);
        it.tests ||= [];
        it.tests.push({ at: new Date().toISOString(), ...input, score });
        it.status = score >= 85 ? "已试磨" : "重点观察";
        it.logs.push({ at: new Date().toISOString(), step: "试磨", note: (input.paper || "试纸") + "，评分" + score, score });
        return it;
      });
      return send(res, 201, item);
    }
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));

    // ---- 受控试磨组 ----
    if (req.method === "GET" && url.pathname === "/api/groups") {
      return send(res, 200, (db.groups || []).map(g => presentGroup(g, db.items)));
    }

    if (req.method === "POST" && url.pathname === "/api/groups") {
      const input = await body(req);
      const result = await mutate(d => {
        d.groups ||= [];
        const check = validateCreate(input, d.items);
        if (check.error) throw new HttpError(400, check.error);
        const v = check.value;
        const group = {
          id: newGroupId(),
          ...v,
          createdAt: new Date().toISOString(),
          records: [],
          history: [{
            at: new Date().toISOString(),
            type: "create",
            note: "建组，锁定纸样=" + v.paper + "、加水量=" + v.water + "、室温=" + v.roomTemp +
              "；三锭：" + v.stickIds.join("、")
          }]
        };
        d.groups.push(group);
        return presentGroup(group, d.items);
      });
      return send(res, 201, result);
    }

    const recordsMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/records$/);
    if (recordsMatch && req.method === "POST") {
      const input = await body(req);
      const result = await mutate(d => {
        const group = getGroup(d, recordsMatch[1]);
        if (!group.stickIds.includes(input.stickId)) throw new HttpError(400, "该锭不属于此试磨组");
        const item = findItem(d.items, input.stickId);
        if (!item) throw new HttpError(404, "item_not_found");
        const at = new Date().toISOString();
        group.records ||= [];
        const record = {
          id: newRecordId(),
          seq: group.records.reduce((m, r) => Math.max(m, Number(r.seq) || 0), 0) + 1,
          stickId: item.code,
          at,
          paper: String(input.paper == null ? "" : input.paper).trim(),
          water: String(input.water == null ? "" : input.water).trim(),
          roomTemp: String(input.roomTemp == null ? "" : input.roomTemp).trim(),
          speed: String(input.speed == null ? "" : input.speed).trim(),
          colorLayer: String(input.colorLayer == null ? "" : input.colorLayer).trim(),
          sediment: String(input.sediment == null ? "" : input.sediment).trim(),
          score: input.score === "" || input.score == null ? "" : Number(input.score),
          note: String(input.note == null ? "" : input.note).trim()
        };
        const a = assessRecord(record, group);
        record.valid = a.valid;
        record.changed = a.changed;
        record.missing = a.missing;
        group.records.push(record);
        group.history ||= [];
        const condNames = { paper: "纸样", water: "加水量", roomTemp: "室温" };
        group.history.push({
          at,
          type: "record",
          note: "录入 " + item.code + " 结果，评分" + record.score + "、沉淀" + (record.sediment || "空") +
            (a.valid
              ? (a.changed.length ? "（只改" + a.changed.map(k => condNames[k]).join("、") + "，有效）" : "（锁定条件，有效）")
              : "（无效：" + (a.missing.length
                  ? "缺 " + a.missing.map(m => condNames[m] || (m === "score" ? "评分" : "沉淀")).join("、")
                  : "相对锁定条件改动超过一项") + "，不参与本组判定）")
        });
        return presentGroup(group, d.items);
      });
      return send(res, 201, result);
    }

    const recordPatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/records\/([^/]+)$/);
    if (recordPatch && req.method === "PATCH") {
      const input = await body(req);
      const result = await mutate(d => {
        const group = getGroup(d, recordPatch[1]);
        const record = getRecord(group, recordPatch[2]);
        const before = presentGroup(group, d.items);
        const allowed = ["paper", "water", "roomTemp", "speed", "colorLayer", "sediment", "score", "note"];
        const changes = [];
        for (const key of allowed) {
          if (input[key] === undefined) continue;
          let val = String(input[key]).trim();
          if (key === "score") val = val === "" ? "" : Number(val);
          if (String(record[key] ?? "") !== String(val)) {
            changes.push(key);
            record[key] = val;
          }
        }
        if (!changes.length) throw new HttpError(400, "没有需要更正的内容");
        const a = assessRecord(record, group);
        record.valid = a.valid; record.changed = a.changed; record.missing = a.missing;
        const after = presentGroup(group, d.items);
        group.history ||= [];
        group.history.push({
          at: new Date().toISOString(),
          type: "void",
          note: "更正 " + codeOf(group, d.items, record.stickId) + " 结果（" +
            changes.map(k => ({ paper: "纸样", water: "加水量", roomTemp: "室温", speed: "出墨速度", colorLayer: "墨色层次", sediment: "沉淀", score: "评分", note: "备注" })[k]).join("、") +
            "），本组结论作废。" + priorConclusionNote(before)
        });
        group.history.push({ at: new Date().toISOString(), type: "recalc", note: recalcNote(after) });
        return after;
      });
      return send(res, 200, result);
    }

    const groupPatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupPatch && req.method === "PATCH") {
      const input = await body(req);
      const result = await mutate(d => {
        const group = getGroup(d, groupPatch[1]);
        const updates = {};
        const names = { paper: "纸样", water: "加水量", roomTemp: "室温" };
        const changes = [];
        for (const key of ["paper", "water", "roomTemp"]) {
          if (input[key] === undefined) continue;
          const val = String(input[key]).trim();
          if (!val) throw new HttpError(400, names[key] + "不能为空");
          if (val !== String(group[key] ?? "")) changes.push(key);
          updates[key] = val;
        }
        if (!changes.length) throw new HttpError(400, "没有需要更正的锁定条件");
        const before = presentGroup(group, d.items);
        Object.assign(group, updates);
        // 条件更正：所有记录重新判定有效性，本组结论作废后重算。
        group.records.forEach(r => {
          const a = assessRecord(r, group);
          r.valid = a.valid; r.changed = a.changed; r.missing = a.missing;
        });
        const after = presentGroup(group, d.items);
        group.history ||= [];
        group.history.push({
          at: new Date().toISOString(),
          type: "void",
          note: "锁定条件更正（" + changes.map(k => names[k] + "改为「" + group[k] + "」").join("、") + "），此前结论全部作废。" + priorConclusionNote(before)
        });
        group.history.push({ at: new Date().toISOString(), type: "recalc", note: recalcNote(after) });
        return after;
      });
      return send(res, 200, result);
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, error.status || 500, { error: error.message || String(error) });
  }
});

// 先确保数据文件完整落盘再开始接收请求，避免冷启动并发读到半截种子文件。
await initDb();
server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port + " (data: " + dbPath + ")"));
