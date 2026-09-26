// 分组判定：受控试磨组的建组校验、有效结果选取、结论计算与条件更正。
// 纯函数，不碰磁盘；记录保存见 lib/store.js，页面展示见 lib/page.js。

export const CONDITION_FIELDS = [["paper", "纸样"], ["water", "加水量"], ["roomTemp", "室温"]];
export const MEMBERS_PER_GROUP = 3;
export const MAX_SCORE_SPREAD = 8;

export class GroupError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function findItem(items, ref) {
  return items.find(x => x.id === ref || x.code === ref);
}

function keyOf(item) {
  return [String(item.smokeSource ?? "").trim(), String(item.glueRatio ?? "").trim(), Number(item.ageYears)].join("|");
}

// 建组：三锭须同一烟料、胶比和存放年限，并锁定纸样、加水量、室温。
export function validateGroupInput(items, input) {
  const refs = Array.isArray(input.members) ? input.members.map(m => String(m).trim()) : [];
  if (refs.length !== MEMBERS_PER_GROUP) {
    throw new GroupError(400, "members_count", `受控试磨组正好需要${MEMBERS_PER_GROUP}锭`);
  }
  if (new Set(refs).size !== refs.length) throw new GroupError(400, "members_dup", "同一锭不能重复入组");
  const members = refs.map(ref => {
    const item = findItem(items, ref);
    if (!item) throw new GroupError(404, "item_not_found", `找不到墨锭 ${ref}`);
    return item;
  });
  const resolved = members.map(m => m.id || m.code);
  if (new Set(resolved).size !== resolved.length) throw new GroupError(400, "members_dup", "同一锭不能重复入组");
  if (new Set(members.map(keyOf)).size !== 1) {
    throw new GroupError(409, "key_mismatch", "同组三锭的烟料、胶比和存放年限必须相同");
  }
  const conditions = {};
  for (const [field, label] of CONDITION_FIELDS) {
    const value = String(input.conditions?.[field] ?? "").trim();
    if (!value) throw new GroupError(400, "condition_missing", `建组时必须锁定${label}`);
    conditions[field] = value;
  }
  const first = members[0];
  const key = { smokeSource: first.smokeSource, glueRatio: first.glueRatio, ageYears: first.ageYears };
  return { refs: resolved, conditions, key };
}

// 有效结果：试磨记录的纸样、加水量、室温与组内锁定条件完全一致。
export function isValidResult(test, conditions) {
  return Boolean(test) && CONDITION_FIELDS.every(([field]) => String(test[field] ?? "").trim() === conditions[field]);
}

export function latestValidResult(item, conditions) {
  let latest = null;
  for (const test of item.tests || []) {
    if (!isValidResult(test, conditions)) continue;
    if (!latest || String(test.at) >= String(latest.at)) latest = test;
  }
  return latest;
}

function memberViews(group, items) {
  return group.members.map(ref => {
    const item = findItem(items, ref);
    return { ref, code: item?.code || ref, found: Boolean(item), result: item ? latestValidResult(item, group.conditions) : null };
  });
}

const scoreOf = m => Number(m.result?.score) || 0;

// 结论：每锭取最近有效结果；评分差不超过八分且沉淀等级相同，才给平均值和最突出的一锭。
export function computeConclusion(group, items) {
  const members = memberViews(group, items);
  const missing = members.filter(m => !m.result).map(m => m.code);
  if (missing.length) return { status: "pending", missing, members };
  const scores = members.map(scoreOf);
  const spread = Math.max(...scores) - Math.min(...scores);
  const sediments = [...new Set(members.map(m => String(m.result.sediment ?? "").trim()))];
  if (spread <= MAX_SCORE_SPREAD && sediments.length === 1) {
    const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
    const standout = members.reduce((best, m) => {
      const diff = scoreOf(m) - scoreOf(best);
      if (diff !== 0) return diff > 0 ? m : best;
      return String(m.result.at) > String(best.result.at) ? m : best;
    });
    return {
      status: "concluded",
      average,
      spread,
      sediment: sediments[0],
      standout: { ref: standout.ref, code: standout.code, score: scoreOf(standout) },
      members
    };
  }
  const reasons = [];
  if (spread > MAX_SCORE_SPREAD) reasons.push(`评分差${spread}分，超过${MAX_SCORE_SPREAD}分`);
  if (sediments.length > 1) reasons.push("沉淀等级不一致");
  return { status: "diverged", spread, sediments, reason: reasons.join("；"), members };
}

export function summarizeConclusion(conclusion) {
  if (conclusion.status === "concluded") {
    return `平均${conclusion.average}分，最突出${conclusion.standout.code}（${conclusion.standout.score}分）`;
  }
  if (conclusion.status === "pending") return `待数据：${conclusion.missing.join("、")}缺有效结果`;
  return `未下结论：${conclusion.reason}`;
}

// 条件更正：每次只能改动一个锁定条件；更正后原结论作废（存入历史），结论按新条件重算。
export function applyCorrection(group, input, items) {
  const next = input.conditions && typeof input.conditions === "object" ? input.conditions : { [input.field]: input.value };
  const changes = CONDITION_FIELDS
    .map(([field, label]) => ({ field, label, from: group.conditions[field], to: String(next[field] ?? "").trim() }))
    .filter(c => c.to && c.to !== c.from);
  if (changes.length !== 1) throw new GroupError(400, "correction_scope", "每次更正只能改动一个条件");
  const [change] = changes;
  const voided = computeConclusion(group, items);
  group.conditions = { ...group.conditions, [change.field]: change.to };
  group.revision = (group.revision || 1) + 1;
  group.history ||= [];
  group.history.push({
    at: new Date().toISOString(),
    type: "correct",
    field: change.field,
    label: change.label,
    from: change.from,
    to: change.to,
    voided: summarizeConclusion(voided)
  });
  return change;
}

export function presentGroup(group, items) {
  const conclusion = computeConclusion(group, items);
  const { members, ...rest } = conclusion;
  return { ...group, members, conclusion: rest, conclusionText: summarizeConclusion(conclusion) };
}
