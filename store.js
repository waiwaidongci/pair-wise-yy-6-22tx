// 记录保存：JSON 文件是唯一数据来源。
// 所有写操作经同一把串行锁排队，写文件用临时文件 + rename 的原子方式，
// 三人同时提交时请求依次完成，记录只会追加，不会互相覆盖丢失。
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = process.env.DATA_FILE || join(__dirname, "data", "ink-stick-testing.json");

const seed = {
  "items": [
    {
      "code": "IS-001",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 8,
      "storage": "恒湿柜B",
      "status": "已试磨",
      "logs": [
        { "at": "2026-06-11", "step": "试磨", "note": "宣纸20滴水，出墨快，评分86", "score": 86 }
      ]
    },
    {
      "code": "IS-002",
      "smokeSource": "桐油烟",
      "glueRatio": "8%",
      "ageYears": 3,
      "storage": "试样盒C",
      "status": "重点观察",
      "logs": [
        { "at": "2026-06-21T03:50:28.907Z", "step": "试磨", "note": "棉连纸，评分79", "score": 79 }
      ],
      "tests": [
        { "at": "2026-06-21T03:50:28.907Z", "paper": "棉连纸", "water": "18滴", "speed": "中", "colorLayer": "偏暖", "sediment": "少", "score": 79 }
      ]
    },
    {
      "code": "IS-010",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 5,
      "storage": "恒湿柜A",
      "status": "已试磨",
      "logs": []
    },
    {
      "code": "IS-011",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 5,
      "storage": "恒湿柜A",
      "status": "已试磨",
      "logs": []
    },
    {
      "code": "IS-012",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 5,
      "storage": "恒湿柜A",
      "status": "已试磨",
      "logs": []
    }
  ],
  "groups": [
    {
      "id": "GR-0001",
      "name": "黄山松烟 7.5% 陈5年 · 宣纸20滴对照",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 5,
      "paper": "宣纸",
      "water": "20滴",
      "roomTemp": "22℃",
      "stickIds": ["IS-010", "IS-011", "IS-012"],
      "createdAt": "2026-09-20T01:00:00.000Z",
      "records": [
        { "id": "GR-0001-R1", "seq": 1, "stickId": "IS-010", "at": "2026-09-21T02:00:00.000Z", "paper": "宣纸", "water": "20滴", "roomTemp": "22℃", "speed": "快", "colorLayer": "清亮", "sediment": "少", "score": 88, "note": "", "valid": true, "changed": [] },
        { "id": "GR-0001-R2", "seq": 2, "stickId": "IS-011", "at": "2026-09-21T02:30:00.000Z", "paper": "宣纸", "water": "20滴", "roomTemp": "22℃", "speed": "中", "colorLayer": "匀净", "sediment": "少", "score": 85, "note": "", "valid": true, "changed": [] },
        { "id": "GR-0001-R3", "seq": 3, "stickId": "IS-012", "at": "2026-09-21T03:00:00.000Z", "paper": "宣纸", "water": "20滴", "roomTemp": "22℃", "speed": "中", "colorLayer": "略闷", "sediment": "少", "score": 86, "note": "", "valid": true, "changed": [] }
      ],
      "history": [
        { "at": "2026-09-20T01:00:00.000Z", "type": "create", "note": "建组，锁定纸样=宣纸、加水量=20滴、室温=22℃" },
        { "at": "2026-09-21T02:00:00.000Z", "type": "record", "note": "录入 IS-010 试磨结果，评分88，沉淀少" },
        { "at": "2026-09-21T02:30:00.000Z", "type": "record", "note": "录入 IS-011 试磨结果，评分85，沉淀少" },
        { "at": "2026-09-21T03:00:00.000Z", "type": "record", "note": "录入 IS-012 试磨结果，评分86，沉淀少" }
      ]
    }
  ]
};

function tmpName() {
  return dbPath + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
}

// 初始化种子数据也走临时文件 + rename：多个请求同时到达、且数据文件尚不存在时，
// 读盘只会看到完整文件，不会读到写到一半的空文件。
export async function loadDb() {
  if (!existsSync(dbPath)) {
    const tmp = tmpName();
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(tmp, JSON.stringify(seed, null, 2));
    await rename(tmp, dbPath);
  }
  return JSON.parse(await readFile(dbPath, "utf8"));
}
export async function initDb() { await loadDb(); }

async function persist(db) {
  const tmp = dbPath + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, dbPath);
}

let chain = Promise.resolve();
// mutate 在串行队列中重新读盘、改内存、原子写回，避免并发写丢记录。
export function mutate(fn) {
  const run = chain.then(async () => {
    const db = await loadDb();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  chain = run.then(() => {}, () => {});
  return run;
}

export function newGroupId() {
  return "GR-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}
export function newRecordId() {
  return "R-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}
