/** Draws a simple line chart on a canvas (device-pixel aware). */
export function drawLineChart(
  canvas: HTMLCanvasElement,
  values: number[],
  color = '#e3b341',
  reference?: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 150;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const pad = { l: 44, r: 8, t: 10, b: 18 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (reference !== undefined) {
    min = Math.min(min, reference);
    max = Math.max(max, reference);
  }
  if (max - min < 1e-6) {
    max += 1;
    min -= 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  ctx.strokeStyle = 'rgba(244,239,225,0.1)';
  ctx.fillStyle = 'rgba(244,239,225,0.55)';
  ctx.font = '10px sans-serif';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 3; k++) {
    const v = min + ((max - min) * k) / 3;
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(w - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(v.toFixed(0), 4, y(v) + 3);
  }
  ctx.fillText(`-${values.length - 1}d`, pad.l, h - 4);
  ctx.fillText('0', w - pad.r - 8, h - 4);
  if (reference !== undefined) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(244,239,225,0.35)';
    ctx.beginPath();
    ctx.moveTo(pad.l, y(reference));
    ctx.lineTo(w - pad.r, y(reference));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.lineTo(x(values.length - 1), h - pad.b);
  ctx.lineTo(x(0), h - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}
