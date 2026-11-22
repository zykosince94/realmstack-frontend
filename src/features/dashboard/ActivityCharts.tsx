import { useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Activity } from "lucide-react";
import { useActivity } from "../../hooks/queries";
import { columnPath, formatCount, nearestIndex, niceScale } from "../../lib/chart";

// Series colours, validated (dataviz validate_palette.js, dark mode, against the panel
// surface #152235): lightness band, chroma, colour-blind separation and contrast all pass.
const CCU_COLOR = "#1fa892";
const DAU_COLOR = "#5b86f0";

// One drawing size for both charts; the SVG scales to its container (viewBox).
const W = 560;
const H = 230;
const M = { top: 16, right: 46, bottom: 28, left: 40 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const BASE_Y = M.top + PLOT_H;

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayLabel = (date: string, long = false) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", ...(long ? { weekday: "short" } : {}) });

/**
 * Player activity: concurrent players over 24 hours and daily active players over 30 days.
 * Two charts, not one with two axes: the measures differ in scale and in time range.
 * Each is a single series, so the title names it and there is no legend box; values are
 * read with the hover tooltip, the arrow keys, or the table view.
 */
export function ActivityCharts() {
  const q = useActivity();
  const a = q.data;
  const empty = a && a.ccu.every((p) => p.players === 0) && a.dau.every((p) => p.players === 0);
  return (
    <section className="panel activity-panel" aria-label="Player activity">
      <div className="panel-heading">
        <div><h3>Player activity</h3><p>Derived from player sessions: a player counts as online in a 15-minute window in which their game signed in or refreshed its session.</p></div>
        <Activity size={20} />
      </div>
      {q.isPending ? <p className="empty-text">Loading activity…</p>
        : !a ? <p className="empty-text">Activity could not be loaded.</p>
        : (
          <>
            <div className="activity-tiles">
              <div className="activity-tile"><small>Online now</small><b>{formatCount(a.ccu_now)}</b><span>last 15 minutes</span></div>
              <div className="activity-tile"><small>Peak online</small><b>{formatCount(a.ccu_peak_24h)}</b><span>last 24 hours</span></div>
              <div className="activity-tile"><small>Active today</small><b>{formatCount(a.dau_today)}</b><span>since 00:00 UTC</span></div>
            </div>
            {empty ? <p className="empty-text">No player sessions in this environment yet. Activity appears here once players sign in.</p> : (
              <div className="activity-charts">
                <CcuChart points={a.ccu} />
                <DauChart points={a.dau} />
              </div>
            )}
            <details className="chart-table">
              <summary>Show the data as a table</summary>
              <div className="chart-table-grid">
                <div className="table-wrap"><table aria-label="Concurrent players by 15 minutes">
                  <thead><tr><th>From</th><th>Players online</th></tr></thead>
                  <tbody>{a.ccu.map((p) => <tr key={p.at}><td>{new Date(p.at).toLocaleString()}</td><td>{p.players}</td></tr>)}</tbody>
                </table></div>
                <div className="table-wrap"><table aria-label="Daily active players">
                  <thead><tr><th>Day (UTC)</th><th>Active players</th></tr></thead>
                  <tbody>{a.dau.map((p) => <tr key={p.date}><td>{p.date}</td><td>{p.players}</td></tr>)}</tbody>
                </table></div>
              </div>
            </details>
          </>
        )}
    </section>
  );
}

/** Arrow keys move the readout like the pointer does; focus starts at the latest point. */
function useReadout(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  return {
    index,
    setIndex,
    focusProps: {
      tabIndex: 0,
      onFocus: () => setIndex(count - 1),
      onBlur: () => setIndex(null),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((i) => Math.max(0, (i ?? count) - 1)); }
        if (event.key === "ArrowRight") { event.preventDefault(); setIndex((i) => Math.min(count - 1, (i ?? -1) + 1)); }
        if (event.key === "Escape") setIndex(null);
      },
    },
  };
}

function Grid({ ticks, y }: { ticks: number[]; y: (v: number) => number }) {
  return (
    <g className="chart-grid">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{formatCount(t)}</text>
        </g>
      ))}
    </g>
  );
}

function Tooltip({ x, value, unit, label }: { x: number; value: number; unit: string; label: string }) {
  // Values lead, labels follow; positioned over the hovered X, kept inside the chart.
  const left = Math.min(88, Math.max(12, (x / W) * 100));
  return (
    <div className="chart-tooltip" role="status" style={{ left: `${left}%` }}>
      <b>{formatCount(value)}</b> <span>{unit}</span>
      <small>{label}</small>
    </div>
  );
}

function CcuChart({ points }: { points: { at: string; players: number }[] }) {
  const n = points.length;
  const { max, ticks } = niceScale(Math.max(...points.map((p) => p.players)));
  const x = (i: number) => M.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => M.top + PLOT_H * (1 - v / max);
  const readout = useReadout(n);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.players).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1).toFixed(1)},${BASE_Y}L${x(0).toFixed(1)},${BASE_Y}Z`;
  const last = points[n - 1];
  const hovered = readout.index === null ? null : points[readout.index];
  function onPointer(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    readout.setIndex(nearestIndex(((event.clientX - box.left) / Math.max(box.width, 1)) * PLOT_W, PLOT_W, n));
  }
  return (
    <figure className="chart" aria-label={`Concurrent players, last 24 hours. Now ${last.players}. Use the arrow keys to read each 15-minute window.`} role="group" {...readout.focusProps}>
      <figcaption><span className="chart-key" style={{ background: CCU_COLOR }} /> Concurrent players <small>last 24 hours, 15-minute windows</small></figcaption>
      <div className="chart-frame">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <Grid ticks={ticks} y={y} />
          <g className="chart-axis">
            {points.map((p, i) => {
              const d = new Date(p.at);
              return d.getMinutes() === 0 && d.getHours() % 6 === 0 ? <text key={p.at} x={x(i)} y={H - 8} textAnchor="middle">{time(p.at)}</text> : null;
            })}
          </g>
          <path d={area} fill={CCU_COLOR} fillOpacity={0.1} />
          <path d={line} fill="none" stroke={CCU_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* The end point is labelled; everything else is read from the axis, tooltip or table. */}
          <circle cx={x(n - 1)} cy={y(last.players)} r={4} fill={CCU_COLOR} stroke="var(--panel)" strokeWidth={2} />
          <text className="chart-end-label" x={x(n - 1) + 9} y={y(last.players)} dy="0.32em">{formatCount(last.players)}</text>
          {readout.index !== null && hovered && (
            <g className="chart-crosshair">
              <line x1={x(readout.index)} x2={x(readout.index)} y1={M.top} y2={BASE_Y} />
              <circle cx={x(readout.index)} cy={y(hovered.players)} r={4} fill={CCU_COLOR} stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
          {/* The hit area is the whole plot: the reader aims at a time, not at a 2px line. */}
          <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} fill="transparent" onPointerMove={onPointer} onPointerLeave={() => readout.setIndex(null)} />
        </svg>
        {readout.index !== null && hovered && <Tooltip x={x(readout.index)} value={hovered.players} unit="online" label={`${time(hovered.at)} – ${time(new Date(new Date(hovered.at).getTime() + 15 * 60_000).toISOString())}`} />}
      </div>
    </figure>
  );
}

function DauChart({ points }: { points: { date: string; players: number }[] }) {
  const n = points.length;
  const { max, ticks } = niceScale(Math.max(...points.map((p) => p.players)));
  const slot = PLOT_W / n;
  const barW = Math.min(24, slot - 2); // capped thickness; the 2px gap separates neighbours
  const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
  const y = (v: number) => M.top + PLOT_H * (1 - v / max);
  const readout = useReadout(n);
  const today = points[n - 1];
  const hovered = readout.index === null ? null : points[readout.index];
  return (
    <figure className="chart" aria-label={`Daily active players, last 30 days. Today so far ${today.players}. Use the arrow keys to read each day.`} role="group" {...readout.focusProps}>
      <figcaption><span className="chart-key bar" style={{ background: DAU_COLOR }} /> Daily active players <small>last 30 days (UTC); today is partial</small></figcaption>
      <div className="chart-frame">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <Grid ticks={ticks} y={y} />
          <g className="chart-axis">
            {points.map((p, i) => ((n - 1 - i) % 7 === 0 ? <text key={p.date} x={x(i) + barW / 2} y={H - 8} textAnchor="middle">{dayLabel(p.date)}</text> : null))}
          </g>
          {points.map((p, i) => (
            <path key={p.date} className={`chart-bar ${readout.index === i ? "hovered" : ""}`} d={columnPath(x(i), barW, y(p.players), BASE_Y)} fill={DAU_COLOR} />
          ))}
          <text className="chart-end-label" x={x(n - 1) + barW / 2} y={y(today.players) - 7} textAnchor="middle">{formatCount(today.players)}</text>
          {/* Each column's hit target is its whole slot, taller and wider than the bar. */}
          {points.map((p, i) => (
            <rect key={p.date} x={M.left + i * slot} y={M.top} width={slot} height={PLOT_H} fill="transparent"
              onPointerEnter={() => readout.setIndex(i)} onPointerLeave={() => readout.setIndex(null)} />
          ))}
        </svg>
        {readout.index !== null && hovered && <Tooltip x={x(readout.index) + barW / 2} value={hovered.players} unit="active" label={dayLabel(hovered.date, true)} />}
      </div>
    </figure>
  );
}
