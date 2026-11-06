// 资产工坊里的手动作业表。存进和主游戏同一把钥匙。
import { MANUAL_EFFECTS, MANUAL_MACHINES, manualJobs, writeManualJobs, normalizeManualJobs } from './manual-jobs.js';

export function createManualWorkshop({ panel }) {
  let on = false;

  function paint() {
    if (!panel) return;
    const jobs = manualJobs();
    panel.innerHTML = `<h2>手动作业</h2>
<p class="fs-note">主游戏的「喷灌」读 id 为 irrigate 的那一条。窗内能派走的撒药、追肥优先；派不走才轮到这里。钥匙和可玩页同一份。</p>
${jobs.map((job, index) => `<fieldset data-i="${index}">
<label>id<input data-k="id" value="${job.id}"></label>
<label>名称<input data-k="name" value="${job.name}"></label>
<label>效果<select data-k="effect">${MANUAL_EFFECTS.map(item => `<option value="${item.id}"${item.id === job.effect ? ' selected' : ''}>${item.name}</option>`).join('')}</select></label>
<label>效果量<input data-k="delta" type="number" step="1" value="${job.delta}"></label>
<label>耗料 id<input data-k="stock" value="${job.stock}" placeholder="空着不耗"></label>
<label>耗料数量<input data-k="stockNeed" type="number" step="1" value="${job.stockNeed}"></label>
<div class="me-sync">${MANUAL_MACHINES.map(item => `<label><input data-m="${item.id}" type="checkbox"${job.machines.includes(item.id) ? ' checked' : ''}>${item.name}</label>`).join('')}</div>
<label>说明<input data-k="note" value="${job.note}"></label>
</fieldset>`).join('')}
<div class="foot"><button type="button" id="manual-save">保存</button><button type="button" id="manual-add">再加一条</button></div>`;
    panel.querySelector('#manual-save')?.addEventListener('click', save);
    panel.querySelector('#manual-add')?.addEventListener('click', () => {
      const next = readForm();
      next.push({ id: 'job' + (next.length + 1), name: '新作业', machines: ['omni'], effect: 'moisture', delta: 4, stock: '', stockNeed: 0, note: '' });
      writeManualJobs(localStorage, next);
      paint();
    });
  }

  function readForm() {
    const blocks = [...panel.querySelectorAll('fieldset')];
    return normalizeManualJobs(blocks.map(block => {
      const val = (key) => block.querySelector(`[data-k="${key}"]`)?.value || '';
      const machines = [...block.querySelectorAll('[data-m]')].filter(el => el.checked).map(el => el.dataset.m);
      return {
        id: val('id'),
        name: val('name'),
        effect: val('effect'),
        delta: Number(val('delta')),
        stock: val('stock'),
        stockNeed: Number(val('stockNeed')),
        note: val('note'),
        machines,
      };
    }));
  }

  function save() {
    writeManualJobs(localStorage, readForm());
    paint();
  }

  return {
    setActive(next) {
      on = !!next;
      if (panel) panel.hidden = !on;
      if (on) paint();
    },
  };
}
