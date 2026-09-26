import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "ink-stick-testing.json");

const seed = {
  items: [
    {
      code: "IS-001",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      status: "已试磨",
      tests: [
        { at: "2026-06-11", paper: "宣纸", water: "20滴", roomTemp: "24℃", speed: "快", colorLayer: "清透", sediment: "少", score: 86 }
      ],
      logs: [
        { at: "2026-06-11", step: "试磨", note: "宣纸20滴水，出墨快，评分86", score: 86 }
      ]
    },
    {
      code: "IS-002",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      status: "待试磨",
      tests: [],
      logs: []
    }
  ],
  groups: []
};

async function ensureFile() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
}

export async function readDb() {
  await ensureFile();
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.items ||= [];
  db.groups ||= [];
  return db;
}

async function writeDb(db) {
  const tmp = dbPath + ".tmp";
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, dbPath);
}

// 记录保存：所有写操作排成一队，依次“读取-修改-落盘”，
// 多人同时提交也不会互相覆盖；落盘先写临时文件再改名，避免读到写一半的文件。
let queue = Promise.resolve();
export function mutateDb(fn) {
  const run = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
