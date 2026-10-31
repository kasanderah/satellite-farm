// 阶段图的编辑器和主游戏共用这一份判断。
// 主流程是和入口头连在一起的那一团（边不分方向，出口不算节点）。
// 飘在外面的阶段会保存，编译时丢掉，不参与运行。
// 自然右口和硬作业右口可以同时存在。没做硬作业仍可走自然线。

export function analyzeGraph(graph) {
  const stages = Array.isArray(graph?.stages) ? graph.stages : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  const errors = [];
  const warnings = [];
  if (!graph || !graph.entry || !Array.isArray(graph.stages) || !Array.isArray(graph.edges)) {
    return { errors: ['缺少阶段图'], warnings, main: new Set(), floating: new Set(stages.map(stage => stage.id)), origins: new Map(), headId: null };
  }
  if (edges.some(edge => edge.kind !== 'hard' && edge.kind !== 'natural')) {
    errors.push('阶段图的边只能是 hard 或 natural');
  }
  const head = byId.get(graph.entry.to);
  if (!head || head.role !== 'head') errors.push('入口要接到一个头阶段');

  const adj = new Map();
  const link = (a, b) => {
    if (!a || !b || a === 'exit' || b === 'exit') return;
    if (!byId.has(a) || !byId.has(b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const edge of edges) link(edge.from, edge.to);

  const main = new Set();
  if (head && head.role === 'head') {
    const stack = [head.id];
    while (stack.length) {
      const id = stack.pop();
      if (main.has(id)) continue;
      main.add(id);
      for (const next of adj.get(id) || []) if (!main.has(next)) stack.push(next);
    }
  }
  const headsInMain = [...main].filter(id => byId.get(id)?.role === 'head');
  if (headsInMain.length > 1) errors.push('主流程里有两个头');

  const floating = new Set(stages.filter(stage => !main.has(stage.id)).map(stage => stage.id));
  for (const id of floating) {
    warnings.push({ id, text: '飘着，保存但不参与运行' });
    const stage = byId.get(id);
    (stage?.jobs || []).forEach((job, index) => {
      warnings.push({ id: jobKey(id, index), text: '挂在飘阶段上，不参与运行' });
    });
  }

  const origins = new Map();
  let age = 0;
  for (const stage of stages) {
    if (!main.has(stage.id)) continue;
    origins.set(stage.id, age);
    if (Number(stage.days) > 0) age += Number(stage.days);
  }

  for (const id of main) {
    const stage = byId.get(id);
    const origin = origins.get(id) || 0;
    const span = Number(stage.days) > 0 ? Number(stage.days) : 0;
    (stage.jobs || []).forEach((job, index) => {
      const key = jobKey(id, index);
      if (job.kind === 'hard') {
        const linked = edges.some(edge => edge.from === id && edge.kind === 'hard' && edge.job === job.job && (edge.to === 'exit' || byId.has(edge.to)));
        if (!linked) {
          warnings.push({ id: key, text: '硬作业右边没接下阶段' });
          warnings.push({ id, text: '有硬作业右边没接' });
        }
      }
      if (job.full || !(span > 0)) return;
      const from = Number(job.from);
      const to = Number(job.to);
      if (!(to > from) || from < origin - 1e-6 || to > origin + span + 1e-6) {
        warnings.push({ id: key, text: '窗口和阶段时长冲突' });
        warnings.push({ id, text: '有作业窗口和阶段时长冲突' });
      }
    });
  }

  const hardMiss = warnings.some(item => item.text === '硬作业右边没接下阶段');
  if (hardMiss) errors.push('硬作业右边没接下阶段');
  return { errors, warnings, main, floating, origins, headId: head && head.role === 'head' ? head.id : null };
}

export function warningsFor(report, id) {
  return (report?.warnings || []).filter(item => item.id === id);
}

export function jobKey(stageId, index) {
  return 'job:' + stageId + ':' + index;
}

export function compilePlayableGraph(graph) {
  const report = analyzeGraph(graph);
  if (report.errors.length) {
    const err = new Error(report.errors[0]);
    err.report = report;
    throw err;
  }
  const stages = graph.stages.filter(stage => report.main.has(stage.id)).map(stage => ({
    ...stage,
    jobs: (stage.jobs || []).map(job => ({ ...job })),
  }));
  const keep = new Set(stages.map(stage => stage.id));
  keep.add('exit');
  const edges = graph.edges.filter(edge => keep.has(edge.from) && keep.has(edge.to)).map(edge => ({ ...edge }));
  const growDays = stages.reduce((sum, stage) => sum + (Number(stage.days) > 0 ? Number(stage.days) : 0), 0);
  return {
    entry: { job: graph.entry.job || 'sow', to: graph.entry.to },
    edges,
    stages,
    growDays,
  };
}

// 窗口在图上仍是作物绝对日。编辑器里的「开始」是挂靠阶段第 0 天再加的天数。
export function windowParts(job, origin) {
  if (!job || job.full) return { start: 0, length: 0, full: true };
  const from = Number(job.from) || 0;
  const to = Number(job.to) || 0;
  const start = Math.round((from - (origin || 0)) * 100) / 100;
  const length = Math.round((to - from) * 100) / 100;
  return { start, length, full: false };
}

export function hangSlots(jobs) {
  const rows = (jobs || []).map((job, index) => ({
    index,
    from: job.full ? -1 : Number(job.from) || 0,
  }));
  rows.sort((a, b) => a.from - b.from || a.index - b.index);
  const slots = new Array(rows.length);
  let x = 0;
  let prev = null;
  for (const row of rows) {
    if (prev != null && row.from !== prev) x += 16;
    slots[row.index] = x;
    x += 12;
    prev = row.from;
  }
  return { slots, width: Math.max(112, 36 + x) };
}
