// 一口世界钟。种植成熟、软窗和工坊阶段日都用世界日。
// 1×：一真实分钟 = 120 世界分钟（2 世界时）。
// 一世界日 = 12 真实分钟 = 720 真实秒。一真实日约 120 世界日。
// 农机仍吃加速后的真实秒。倍率同时加快这口钟和农机，不另开跳阶段。
export const WORLD_MIN_PER_REAL_MIN = 120;
export const DAY_SECONDS = (1440 / WORLD_MIN_PER_REAL_MIN) * 60;
