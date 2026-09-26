# 墨锭试磨室

运行：

```bash
npm start
```

访问 `http://localhost:3037`。数据保存在 `data/ink-stick-testing.json`。

## 受控试磨组

- 建组：选同一烟料、胶比和存放年限的三锭，建组时锁定纸样、加水量和室温。
- 每锭取符合锁定条件的最近一条有效试磨结果；评分差不超过八分且沉淀等级相同时，给出平均评分和最突出的一锭，否则说明原因（评分差超界 / 沉淀不一致 / 待数据）。
- 条件更正每次只能改动一个锁定条件；更正后原结论作废（留存在组历史里），结论按新条件自动重算。

## 模块分工

- `lib/grouping.js` — 分组判定：建组校验、有效结果选取、结论计算、条件更正（纯函数）。
- `lib/store.js` — 记录保存：所有写操作串行排队、先写临时文件再改名，多人同时提交不丢记录。
- `lib/page.js` — 页面并排展示：三锭并排卡片、结论横幅、更正入口。
- `server.js` — 只做 HTTP 路由，把三者接起来。

## 接口

- `GET/POST /api/items`，`PATCH /api/items/:id`，`POST /api/items/:id/logs`，`POST /api/items/:id/action`
- `GET/POST /api/groups`，`POST /api/groups/:id/correct`（body：`{ "field": "paper|water|roomTemp", "value": "新值" }`）
- `GET /api/stats`
