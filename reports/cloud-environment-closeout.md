# 云环境收尾核验（2026-11-08）

本报告记录最初的环境收尾阶段。后续几何修复已重建派生数据，当前结果见 [快照源数据与几何管线修复](snapshot-source-repair.md)；下文的 165 文件未变等结论仅指当时的检查。

## 修改范围

- `data/identity/colors.json`：仅新增 `auto:italy#1: #79cbcb`。该值与当前生成实体索引、年份数据以及构建器确定性分配结果一致，不覆盖已有颜色。当前上游在公元前 300 年加入 Italy，使早期 Italy 与 1878–2010 的 Italy 被既有身份算法分为两个 run；后者需要独立注册。没有修改身份算法。
- `tests/relations/run.mjs`：R1 逐年核对 manifest、年份文件与 sidecar 数量，总量从 manifest 计算；T12 独立遍历年份文件的 subject/name 字段，核对有 key 的 feature 总数与覆盖审计；验证报告的 recordsChecked 使用实际记录数。没有将旧硬编码替换为新硬编码，原有集合、字段、确定性及文件保护检查仍保留。
- 本报告记录上游取证、回归及配置保存状态。

## 上游取证

通过现有 Git HTTPS 认证只读获取 `aourednik/historical-basemaps` 历史。在仓库外隔离目录重建旧版本，没有替换当前项目数据。

- 当前上游：`4b5039e50d8d2464b065bd76ad6086cd4597108d`。
- 更新前主线：`da7a4b735ecef70aebdc9c73e409d8a2500d50f3`。
- 本地 54 个原始 GeoJSON 全部与当前上游文件的 JSON 内容相同。
- 旧版本使用当前构建脚本与配置在隔离目录重建，精确复现封存报告：17,469 features、1,929,821 vertices、3,055 个具名实体，新增颜色 0。当前保留数据为 17,481 features、1,932,467 vertices、3,056 个具名实体。

|年份|旧构建 features|当前 features|上游变化及解释|
|---|---:|---:|---|
|−300|153|156|`d7cc908`：新增 Carthaginian Empire 两个要素及 Italy 一个|
|1878|239|239|`d7cc908` 及 Patagonia 海岸线更新，顶点改变，数量不变|
|1914|177|177|`bb79aea` 合入芬兰边界修订，主权证据 Finland → Russia，数量不变|
|1920|206|208|芬兰边界修订，新增两个 USSR 要素|
|1930|201|208|芬兰边界修订，原始新增九个 White Russia 要素，其中两个被既有量化流程丢弃，产物净增七个|

上述净增 12 个要素均有 key：覆盖审计旧预期 10,423 → 当前输入实际 10,435。两个失败源于绑定旧上游版本的测试数量，没有发现 sidecar 丢失或重复记录。既有 1945 年六条 C5 sovereignId warning 保持原状；这是原有 warning 模式，不属于本次修改范围。

## 验证

- `npm run data:verify`：通过全部数据断言；AR7 注册表命中 3,057/3,057（包括 UNNAMED）。
- `node tests/relations/run.mjs --validation ...`：19/19 通过；115 个受保护文件运行前后哈希一致。
- `npm run build`：TypeScript 与 Vite 生产构建通过；保留原有大 chunk 提示。
- Chromium/Playwright 开发环境：初始 2010、提交年份 1492、下一快照 1500、54 个快照及历史/当前 GeoJSON、Worker HTTP 200、页面脚本错误 0。
- 生产 preview 的 Chromium/Playwright 交互回归同样通过：2010 → 1492 → 1500，`/assets/maplibre-gl-worker.mjs` HTTP 200，页面脚本错误 0；dist 与 public 的 manifest 完全一致。
- 已保留原始及 public/data 的 165 个文件：收尾前后 SHA-256 全部一致。只刷新了忽略的 dist 构建产物。
- 可复用安装脚本在当前实例成功执行：复用已有依赖和数据，不运行重新下载或数据重建分支；校验、关系测试与生产构建通过。

## 环境配置状态

当时实例运行状态正常，网络策略已应用。实例标识保留于本地检查记录，不作为项目配置。

草稿读取 `{}` 返回 `INVALID_ARGUMENT`：`The current environment draft could not be verified. Retry the read before editing the configuration.`

仅提交 schema 合法的 `{config: {start_skill: <string>}}`，以及完整的 install_script/start_skill 两字符串请求，均返回 `INVALID_ARGUMENT`：`Setup could not be completed; saving the draft could not be confirmed.`

无参读取同样失败，且服务未返回字段路径、非法值或后台异常详情；目前没有证据表明是脚本参数内容错误，无法从可用接口进一步确定后台根因。没有更改网络、密钥、仓库成员或注入平台标识来绕过错误。草稿持久化未确认，不能报告保存成功。

仓库外保留：

- `/workspace/.onboarding-tools/environment-config-proposal.json`：完整合法配置载荷，可提交 install_script 与 start_skill。
- `/workspace/.onboarding-tools/install-map-reusable.sh`：已执行通过的安装/验证脚本，优先保留已生成数据；缺失数据的恢复分支使用临时副本构建以保护受控文件。
- `/workspace/.onboarding-tools/upstream-evidence.json`、`processed-diff.json`：上游及隔离构建差异。
- `/workspace/.onboarding-tools/data-verify.log`、`relations-validation.json`、`production-build.log`、`reusable-install.log`：本次验证结果。

剩余阻塞：平台需恢复本聊天草稿的读取/保存能力；接口当前未提供足够诊断信息以在项目内修复。未执行发布。
