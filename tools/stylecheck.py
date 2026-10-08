# 风格体检：复用 art-ref/palette.py 的 OKLab 转换与统计（与报告 5.1 节同一算法）
# 用法：python3 tools/stylecheck.py a.png b.png ...   → 每张图 + 合并
import sys, json, numpy as np
src = open('/workspace/art-ref/palette.py').read().split('# HUD 裁切')[0]
g = {}; exec(src, g)
def metrics(px):
    lab = g['rgb2oklab'](px); L = lab[:, 0]; ch = np.hypot(lab[:, 1], lab[:, 2])
    hue = np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360
    strong = ch > 0.08
    hh = np.histogram(hue[strong], 12, (0, 360))[0]; hh = hh / max(hh.sum(), 1); h = hh[hh > 0]
    eff = float(np.exp(-(h * np.log(h)).sum())) if strong.sum() > 50 else float('nan')
    m4 = ch > 0.04; h4 = np.histogram(hue[m4], 12, (0, 360))[0]; h4 = h4 / max(h4.sum(), 1); h4 = h4[h4 > 0]
    eff4 = float(np.exp(-(h4 * np.log(h4)).sum())) if m4.sum() > 50 else float('nan')   # 补充：中等彩度(C>0.04)像素的有效色相数
    neutral = (ch <= 0.02).mean(); crop_like = ((ch > 0.02) & (ch <= 0.12)).mean(); signal = (ch > 0.12).mean()
    return dict(L_mean=round(float(L.mean()), 3), L_p5=round(float(np.percentile(L, 5)), 3), L_p95=round(float(np.percentile(L, 95)), 3),
                strong_chroma=round(float(strong.mean()), 4), eff_hues=round(eff, 2), eff_hues_C04=round(eff4, 2), chromatic_C006=round(float((ch > 0.06).mean()), 3),
                share_neutral_C02=round(float(neutral), 3), share_mid_C02_12=round(float(crop_like), 3), share_hi_C12=round(float(signal), 4))
crop = None
args = sys.argv[1:]
if args and args[0].startswith('--crop='): crop = tuple(map(float, args[0][7:].split(','))); args = args[1:]
allpx = []
for f in args:
    px = g['load'](f, crop); allpx.append(px); print(f.split('/')[-1], json.dumps(metrics(px)))
if len(allpx) > 1: print('COMBINED', json.dumps(metrics(np.vstack(allpx))))
