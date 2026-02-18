import { useEffect, useRef } from "react";

function divergingColor(value, maxAbs) {
  const limit = Math.max(maxAbs, 1e-9);
  const t = Math.max(-1, Math.min(1, value / limit));

  if (t >= 0) {
    const r = Math.round(250 - t * 28);
    const g = Math.round(250 - t * 190);
    const b = Math.round(250 - t * 190);
    return `rgb(${r},${g},${b})`;
  }

  const n = Math.abs(t);
  const r = Math.round(250 - n * 185);
  const g = Math.round(250 - n * 145);
  const b = Math.round(250 - n * 20);
  return `rgb(${r},${g},${b})`;
}

export default function DeltaHeatmapCanvas({
  heatmap,
  maxAbs = null,
  showLegend = true,
  plotWidth = 420,
  plotHeight = 320,
}) {
  const canvasRef = useRef(null);
  const valid = !!(heatmap?.triangle_sizes && heatmap?.saturations && heatmap?.grid);
  const cols = valid ? heatmap.triangle_sizes.length : 0;
  const rows = valid ? heatmap.saturations.length : 0;

  const mLeft = 60;
  const mBottom = 50;
  const mTop = 14;
  const mRight = showLegend ? 68 : 20;
  const totalW = plotWidth + mLeft + mRight;
  const totalH = plotHeight + mTop + mBottom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !valid) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalW, totalH);

    const cellW = plotWidth / cols;
    const cellH = plotHeight / rows;
    const inferredMaxAbs = heatmap.grid.reduce((acc, row) => {
      const rowMax = row.reduce((rAcc, v) => Math.max(rAcc, Math.abs(v)), 0);
      return Math.max(acc, rowMax);
    }, 0);
    const scaleMaxAbs = Math.max(
      1e-9,
      Number.isFinite(maxAbs) ? maxAbs : inferredMaxAbs
    );

    for (let si = 0; si < rows; si += 1) {
      const ry = rows - 1 - si;
      for (let ci = 0; ci < cols; ci += 1) {
        const value = heatmap.grid[si][ci];
        ctx.fillStyle = divergingColor(value, scaleMaxAbs);
        ctx.fillRect(
          mLeft + ci * cellW,
          mTop + ry * cellH,
          cellW + 0.5,
          cellH + 0.5
        );
      }
    }

    ctx.strokeStyle = "var(--border, #ccc)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mLeft, mTop, plotWidth, plotHeight);

    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--text-secondary")
      .trim() || "#7c7a72";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const xLabelStep = Math.max(1, Math.ceil(cols / 8));
    for (let ci = 0; ci < cols; ci += xLabelStep) {
      const x = mLeft + ci * cellW + cellW / 2;
      ctx.fillText(
        Math.round(heatmap.triangle_sizes[ci]).toString(),
        x,
        mTop + plotHeight + 16
      );
    }
    ctx.font = "11px sans-serif";
    ctx.fillText("Triangle Size (px)", mLeft + plotWidth / 2, mTop + plotHeight + 38);

    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    const yLabelStep = Math.max(1, Math.ceil(rows / 8));
    for (let si = 0; si < rows; si += yLabelStep) {
      const ry = rows - 1 - si;
      const y = mTop + ry * cellH + cellH / 2 + 3;
      ctx.fillText(heatmap.saturations[si].toFixed(2), mLeft - 6, y);
    }
    ctx.save();
    ctx.translate(14, mTop + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";
    ctx.fillText("Saturation", 0, 0);
    ctx.restore();

    if (showLegend) {
      const barX = mLeft + plotWidth + 14;
      const barW = 14;
      const barH = plotHeight;
      for (let i = 0; i < barH; i += 1) {
        const t = 1 - i / barH;
        const value = (t * 2 - 1) * scaleMaxAbs;
        ctx.fillStyle = divergingColor(value, scaleMaxAbs);
        ctx.fillRect(barX, mTop + i, barW, 1.5);
      }
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, mTop, barW, barH);
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--text-secondary")
        .trim() || "#7c7a72";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      const labels = [scaleMaxAbs, scaleMaxAbs / 2, 0, -scaleMaxAbs / 2, -scaleMaxAbs];
      labels.forEach((v, idx) => {
        const frac = 1 - idx / (labels.length - 1);
        const y = mTop + (1 - frac) * barH + 3;
        ctx.fillText(v.toFixed(3), barX + barW + 4, y);
      });
    }
  }, [cols, heatmap, mLeft, mTop, mRight, mBottom, maxAbs, plotHeight, plotWidth, rows, showLegend, totalH, totalW, valid]);

  if (!valid) return null;
  return (
    <div className="heatmap-visual">
      <canvas ref={canvasRef} className="heatmap-canvas" />
    </div>
  );
}
