import { useRef, useEffect } from "react";

/** RdYlGn colormap matching matplotlib's RdYlGn,
 *  mapped to the 0.3-1.0 range used in the backend. */
export function rdYlGn(p) {
  const t = Math.max(0, Math.min(1, (p - 0.3) / 0.7));
  const stops = [
    [215, 48, 39],
    [244, 109, 67],
    [253, 174, 97],
    [254, 224, 139],
    [255, 255, 191],
    [217, 239, 139],
    [166, 217, 106],
    [102, 189, 99],
    [26, 152, 80],
    [0, 104, 55],
  ];

  const n = stops.length - 1;
  const idx = t * n;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n);
  const frac = idx - lo;

  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac);
  return `rgb(${r},${g},${b})`;
}

export function marchingSegments(idx, bot, top, lft, rgt) {
  const cases = {
    1: [[bot, lft]],
    2: [[bot, rgt]],
    3: [[lft, rgt]],
    4: [[top, rgt]],
    5: [[bot, rgt], [top, lft]],
    6: [[bot, top]],
    7: [[top, lft]],
    8: [[top, lft]],
    9: [[bot, top]],
    10: [[bot, lft], [top, rgt]],
    11: [[top, rgt]],
    12: [[lft, rgt]],
    13: [[bot, rgt]],
    14: [[bot, lft]],
  };
  return cases[idx] || [];
}

export function drawContour(ctx, grid, threshold, color, lineWidth, margin, plotW, plotH, cols, rows) {
  const cellW = plotW / cols;
  const cellH = plotH / rows;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();

  for (let si = 0; si < rows - 1; si++) {
    for (let ci = 0; ci < cols - 1; ci++) {
      const ry = rows - 1 - si;
      const v00 = grid[si][ci];
      const v10 = grid[si][ci + 1];
      const v01 = grid[si + 1][ci];
      const v11 = grid[si + 1][ci + 1];

      const b00 = v00 >= threshold ? 1 : 0;
      const b10 = v10 >= threshold ? 1 : 0;
      const b01 = v01 >= threshold ? 1 : 0;
      const b11 = v11 >= threshold ? 1 : 0;
      const msIdx = b00 | (b10 << 1) | (b11 << 2) | (b01 << 3);
      if (msIdx === 0 || msIdx === 15) continue;

      const lerp = (a, b, ta, tb) => {
        if (Math.abs(tb - ta) < 1e-9) return 0.5;
        return (threshold - ta) / (tb - ta);
      };

      const ox = margin.left + ci * cellW;
      const oy = margin.top + (ry - 1) * cellH;

      const bottom = (t) => [ox + t * cellW, oy + cellH];
      const top_ = (t) => [ox + t * cellW, oy];
      const left = (t) => [ox, oy + (1 - t) * cellH];
      const right = (t) => [ox + cellW, oy + (1 - t) * cellH];

      const tBottom = lerp(0, 1, v00, v10);
      const tTop = lerp(0, 1, v01, v11);
      const tLeft = lerp(0, 1, v00, v01);
      const tRight = lerp(0, 1, v10, v11);

      const segments = marchingSegments(msIdx, bottom(tBottom), top_(tTop), left(tLeft), right(tRight));
      segments.forEach(([from, to]) => {
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
      });
    }
  }

  ctx.stroke();
  ctx.restore();
}

export default function HeatmapCanvas({
  heatmap,
  showLegend = true,
  plotWidth = null,
  plotHeight = null,
}) {
  const canvasRef = useRef(null);
  const valid = !!(heatmap?.triangle_sizes && heatmap?.saturations && heatmap?.grid);
  const cols = valid ? heatmap.triangle_sizes.length : 0;
  const rows = valid ? heatmap.saturations.length : 0;
  const mLeft = 60, mBottom = 50, mTop = 14, mRight = showLegend ? 60 : 20;
  const plotW = plotWidth ?? Math.min(560, Math.max(1, cols) * 28);
  const plotH = plotHeight ?? Math.min(440, Math.max(1, rows) * 28);
  const totalW = plotW + mLeft + mRight;
  const totalH = plotH + mTop + mBottom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !valid) return;
    const margin = { left: mLeft, bottom: mBottom, top: mTop, right: mRight };
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + "px";
    canvas.style.height = totalH + "px";
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, totalW, totalH);

    const cellW = plotW / cols;
    const cellH = plotH / rows;

    for (let si = 0; si < rows; si++) {
      const ry = rows - 1 - si;
      for (let ci = 0; ci < cols; ci++) {
        const p = heatmap.grid[si][ci];
        ctx.fillStyle = rdYlGn(p);
        ctx.fillRect(
          margin.left + ci * cellW,
          margin.top + ry * cellH,
          cellW + 0.5,
          cellH + 0.5
        );
      }
    }

    drawContour(ctx, heatmap.grid, 0.26, "rgba(0,255,255,0.9)", 2, margin, plotW, plotH, cols, rows);
    drawContour(ctx, heatmap.grid, 0.75, "rgba(255,255,255,0.9)", 2.5, margin, plotW, plotH, cols, rows);
    drawContour(ctx, heatmap.grid, 0.90, "rgba(0,0,0,0.8)", 2.5, margin, plotW, plotH, cols, rows);
    drawContour(ctx, heatmap.grid, 0.99, "rgba(0,0,255,0.7)", 2, margin, plotW, plotH, cols, rows);

    ctx.strokeStyle = "var(--border, #ccc)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--text-secondary")
      .trim() || "#7c7a72";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const xLabelStep = Math.max(1, Math.ceil(cols / 8));
    for (let ci = 0; ci < cols; ci += xLabelStep) {
      const x = margin.left + ci * cellW + cellW / 2;
      ctx.fillText(Math.round(heatmap.triangle_sizes[ci]).toString(), x, margin.top + plotH + 16);
    }
    ctx.font = "11px sans-serif";
    ctx.fillText("Triangle Size (px)", margin.left + plotW / 2, margin.top + plotH + 38);

    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    const yLabelStep = Math.max(1, Math.ceil(rows / 8));
    for (let si = 0; si < rows; si += yLabelStep) {
      const ry = rows - 1 - si;
      const y = margin.top + ry * cellH + cellH / 2 + 3;
      ctx.fillText(heatmap.saturations[si].toFixed(2), margin.left - 6, y);
    }
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";
    ctx.fillText("Saturation", 0, 0);
    ctx.restore();

    if (showLegend) {
      const barX = margin.left + plotW + 14;
      const barW = 14;
      const barH = plotH;
      for (let i = 0; i < barH; i++) {
        const p = 1 - i / barH;
        const mapped = 0.3 + p * 0.7;
        ctx.fillStyle = rdYlGn(mapped);
        ctx.fillRect(barX, margin.top + i, barW, 1.5);
      }
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, margin.top, barW, barH);

      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--text-secondary")
        .trim() || "#7c7a72";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      const barLabels = [1.0, 0.9, 0.75, 0.6, 0.3, 0.25];
      barLabels.forEach((v) => {
        const frac = (v - 0.3) / 0.7;
        const y = margin.top + (1 - frac) * barH + 3;
        ctx.fillText(v.toFixed(2), barX + barW + 4, y);
      });
    }
  }, [heatmap, valid, cols, rows, plotW, plotH, totalW, totalH, mLeft, mTop, mRight, mBottom, showLegend]);

  if (!valid) return null;
  return (
    <div className="heatmap-visual">
      <canvas ref={canvasRef} className="heatmap-canvas" />
    </div>
  );
}
