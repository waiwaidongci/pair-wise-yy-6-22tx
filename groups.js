// 分组判定：受控试磨组的校验、单条记录有效性判定和整组结论都在这里，
// 不读文件、不碰页面，可独立测试。

export const conditionKeys = [["paper", "纸样"], ["water", "加水量"], ["roomTemp", "室温"]];
export const sedimentLevels = ["无", "少", "中", "多"];
export const SCORE_SPREAD_LIMIT = 8;

function norm(value) {
  return String(value == null ? "" : value).trim();
}
export function sameCondition(a, b) {
  return norm(a) === norm(b) && norm(a) !== "";
}

export function findItem(items, id) {
  return items.find(x => x.id === id || x.code === id) || null;
}

// 建组三锭必须同烟料、同胶比、同存放年限，且锁定条件不能为空。
export function validateCreate(input, items) {
  const name = norm(input.name);
  const smokeSource = norm(input.smokeSource);
  const glueRatio = norm(input.glueRatio);
  const paper = norm(input.paper);
  const water = norm(input.water);
  const roomTemp = norm(input.roomTemp);
  const ageYears = input.ageYears === "" || input.ageYears == null ? NaN : Number(input.ageYears);
  const stickIds = Array.isArray(input.stickIds)
    ? [...new Set(input.stickIds.map(norm).filter(Boolean))]
    : [];
  if (!smokeSource) return { error: "烟料来源必填" };
  if (!glueRatio) return { error: "胶料比例必填" };
  if (!Number.isFinite(ageYears)) return { error: "存放年限必填" };
  if (!paper) return { error: "建组必须锁定纸样" };
  if (!water) return { error: "建组必须锁定加水量" };
  if (!roomTemp) return { error: "建组必须锁定室温" };
  if (stickIds.length !== 3) return { error: "受控试磨组必须选三锭" };
  const sticks = [];
  for (const id of stickIds) {
    const item = findItem(items, id);
    if (!item) return { error: "墨锭不存在：" + id };
    if (norm(item.smokeSource) !== smokeSource || norm(item.glueRatio) !== glueRatio ||
        Number(item.ageYears) !== ageYears) {
      return { error: item.code + " 的烟料、胶比或存放年限与建组条件不一致" };
    }
    sticks.push(item);
  }
  return {
    value: {
      name: name || smokeSource + " " + glueRatio + " 陈" + ageYears + "年",
      smokeSource, glueRatio, ageYears, paper, water, roomTemp,
      stickIds: sticks.map(s => s.code)
    }
  };
}

// 单锭一条结果是否有效：评分、沉淀齐全，且相对锁定条件最多只改一项。
export function assessRecord(record, group) {
  const rawScore = record.score;
  const score = Number(rawScore);
  const hasScore = rawScore !== "" && rawScore !== null && rawScore !== undefined && Number.isFinite(score);
  const sediment = norm(record.sediment);
  const changed = conditionKeys
    .filter(([key]) => norm(record[key]) !== "" && !sameCondition(record[key], group[key]))
    .map(([key]) => key);
  const missing = [!hasScore && "score", !sediment && "sediment",
    ...conditionKeys.filter(([key]) => norm(record[key]) === "").map(([key]) => key)]
    .filter(Boolean);
  const valid = missing.length === 0 && changed.length <= 1;
  return { valid, changed, missing };
}

// 每锭取最近一条有效结果，再判整组能否给结论。
export function evaluateGroup(group, items) {
  const sticks = group.stickIds.map((id, index) => {
    const item = findItem(items, id);
    const mine = (group.records || [])
      .map((r, i) => ({ r, i }))
      .filter(x => norm(x.r.stickId) === id);
    const assessed = mine.map(x => ({ record: x.r, order: x.i, ...assessRecord(x.r, group) }));
    const latest = assessed.reduce((best, cur) => {
      if (!cur.valid) return best;
      if (!best) return cur;
      const ta = Date.parse(cur.record.at) || 0;
      const tb = Date.parse(best.record.at) || 0;
      // 同一毫秒并发录入时，以单调写入序号 seq 决定“最近”
      const sa = Number(cur.record.seq || 0);
      const sb = Number(best.record.seq || 0);
      return ta > tb || (ta === tb && sa > sb) ? cur : best;
    }, null);
    return {
      stickId: id,
      code: item ? item.code : id,
      storage: item ? item.storage : "",
      found: Boolean(item),
      latest: latest ? {
        recordId: latest.record.id,
        at: latest.record.at,
        seq: latest.record.seq || 0,
        score: Number(latest.record.score),
        sediment: norm(latest.record.sediment),
        changed: latest.changed
      } : null,
      invalidCount: assessed.filter(a => !a.valid).length
    };
  });

  const missingSticks = sticks.filter(s => !s.latest).map(s => s.code);
  let conclusion = null;
  if (missingSticks.length) {
    conclusion = { kind: "pending", reason: "waiting", detail: "等待有效结果：" + missingSticks.join("、") };
  } else {
    const scores = sticks.map(s => s.latest.score);
    const spread = Math.max(...scores) - Math.min(...scores);
    const sediments = [...new Set(sticks.map(s => s.latest.sediment))];
    if (spread > SCORE_SPREAD_LIMIT) {
      conclusion = { kind: "inconclusive", reason: "spread", detail: "评分差" + spread + "分，超过" + SCORE_SPREAD_LIMIT + "分，不下结论" };
    } else if (sediments.length > 1) {
      conclusion = { kind: "inconclusive", reason: "sediment", detail: "沉淀等级不一致（" + sediments.join("、") + "），不下结论" };
    } else {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      let best = sticks[0];
      for (const s of sticks.slice(1)) {
        if (s.latest.score > best.latest.score ||
            (s.latest.score === best.latest.score &&
             ((Date.parse(s.latest.at) || 0) > (Date.parse(best.latest.at) || 0) ||
              ((Date.parse(s.latest.at) || 0) === (Date.parse(best.latest.at) || 0) &&
               Number(s.latest.seq || 0) > Number(best.latest.seq || 0))))) best = s;
      }
      conclusion = {
        kind: "ok", reason: "matched",
        averageScore: avg,
        standoutCode: best.code,
        standoutRecordId: best.latest.recordId,
        detail: "评分差" + spread + "分、沉淀均为" + sediments[0]
      };
    }
  }
  return { group, sticks, conclusion };
}

export function presentGroup(group, items) {
  const { sticks, conclusion } = evaluateGroup(group, items);
  const records = (group.records || []).map(r => ({ ...r, ...assessRecord(r, group) }));
  return {
    id: group.id,
    name: group.name,
    smokeSource: group.smokeSource,
    glueRatio: group.glueRatio,
    ageYears: group.ageYears,
    paper: group.paper,
    water: group.water,
    roomTemp: group.roomTemp,
    stickIds: group.stickIds,
    createdAt: group.createdAt,
    sticks,
    records,
    history: group.history || [],
    conclusion
  };
}
