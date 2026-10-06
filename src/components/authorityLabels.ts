/**
 * authorityId → 人类可读名称（P4.2-0 A 项：提示框展示增强，纯数据映射，不碰 DOM）。
 *
 * 为什么在前端保留一份：`data/relations/authorities.json` 位于**未被发布**的 `data/` 目录
 * （Vite 只发布 `public/`），而 `public/data/relations/` 里只有 54 个年份 sidecar。
 * P4.2-0 的约束是「只改前端展示、不修改 relations 数据」，因此不新增 / 不搬运数据文件，
 * 而是在前端镜像这张 8 条 authority 的 `label` 表（逐字照录，含 `scope` 注释）。
 *
 * 同步责任：新增 authority 时本表需同步；未登记项**回退显示原始 id**（不臆造名称）。
 * 关系层语义不受本表影响：不参与颜色 / entityId / 地图逻辑，只影响提示框一行文案。
 * 冻结来源：`data/relations/authorities.json`（8 条，`version: 1`）。
 */

/** `data/relations/authorities.json` 中 `scope: "feature-level"` 的 7 条 */
export const AUTHORITY_LABEL: Record<string, string> = {
  'auth:SCAP': 'Supreme Commander for the Allied Powers',
  'auth:US-OCCUPATION-ZONE': 'United States Occupation Zone in Germany',
  'auth:SOVIET-OCCUPATION-ZONE': 'Soviet Occupation Zone in Germany',
  'auth:UK-OCCUPATION-ZONE': 'United Kingdom Occupation Zone in Germany',
  'auth:FR-OCCUPATION-ZONE': 'French Occupation Zone in Germany',
  'auth:UK-BMA': 'British Military Administration (Eritrea)',
  'auth:BEIC': 'British East India Company',
  // scope: "historical-background"：不得作为规则输出（OQ-C1），此处仅为展示完备性保留
  'auth:ALLIED-CONTROL-COUNCIL': 'Allied Control Council for Germany',
};

/** 取 authorityId 的展示名；未登记则回退原始 id（保证任何 id 都有可读输出） */
export function authorityLabel(id: string): string {
  return AUTHORITY_LABEL[id] ?? id;
}
