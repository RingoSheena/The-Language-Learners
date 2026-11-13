import { useState } from 'react'
import {
  axisTicks,
  CHART_RANGES,
  countSeries,
  earliestDay,
  formatDayKey,
  futureBuckets,
  latestDay,
  pastBuckets,
  retentionSeries,
} from '../activityCharts.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const percent = (rate) => `${Math.round(rate * 100)}%`

// "Mar 3" for a one-day bar, "Mar 3 – Mar 9" for a longer one
function barDates({ start, end }) {
  const short = (key) => formatDayKey(key, {})
  return start === end ? short(start) : `${short(start)} – ${short(end)}`
}

// Each chart: how to build its bars from the server's daily history, how to
// describe them, and which cards clicking a bar lists (`opens`: 'added',
// 'reviewed', or 'due'). `noun` is singular, for "12 reviews".
const CHARTS = [
  {
    id: 'added',
    opens: 'added',
    title: 'Cards added',
    noun: 'card',
    bars: (history, range, today, earliest) =>
      countSeries(history.added, pastBuckets(range, today, earliest)),
  },
  {
    id: 'reviews',
    opens: 'reviewed',
    title: 'Cards reviewed',
    noun: 'review',
    bars: (history, range, today, earliest) =>
      countSeries(history.reviews, pastBuckets(range, today, earliest)),
  },
  {
    id: 'due',
    opens: 'due',
    title: 'Coming due',
    noun: 'card',
    bars: (history, range, today) =>
      countSeries(history.due, futureBuckets(range, today, latestDay(history.due))),
  },
  {
    id: 'retention',
    opens: 'reviewed',
    title: 'Retention',
    retention: true,
    bars: (history, range, today, earliest) =>
      retentionSeries(history.reviews, history.passed, pastBuckets(range, today, earliest)),
  },
]

function summarize(chart, bars) {
  if (chart.retention) {
    const reviews = bars.reduce((sum, bar) => sum + bar.reviews, 0)
    const passed = bars.reduce((sum, bar) => sum + bar.passed, 0)
    return reviews > 0
      ? `${percent(passed / reviews)} passed of ${plural(reviews, 'review')}`
      : 'No reviews yet'
  }
  return plural(bars.reduce((sum, bar) => sum + bar.value, 0), chart.noun)
}

function barTitle(chart, bar) {
  if (!chart.retention) return `${barDates(bar)}: ${plural(bar.value, chart.noun)}`
  return bar.value === null
    ? `${barDates(bar)}: no reviews`
    : `${barDates(bar)}: ${percent(bar.value)} passed (${bar.passed} passed, ` +
        `${bar.reviews - bar.passed} failed)`
}

function ActivityChart({ chart, history, today, earliest, onSelectBar }) {
  const [rangeId, setRangeId] = useState(CHART_RANGES[0].id)
  const range = CHART_RANGES.find((option) => option.id === rangeId)
  const bars = chart.bars(history, range, today, earliest)
  // Bars scale to the y axis, whose top is the first round number at or
  // above the busiest bar: most reviews for retention, otherwise the highest
  // count
  const ticks = axisTicks(Math.max(...bars.map((bar) => (chart.retention ? bar.reviews : bar.value))))
  const top = ticks.at(-1)
  const summary = summarize(chart, bars)

  return (
    <figure className="activity-chart">
      <div className="activity-chart-header">
        <figcaption>
          <strong>{chart.title}</strong>
          <span className="activity-chart-summary">{summary}</span>
        </figcaption>
        <div className="activity-chart-ranges" role="group" aria-label={`${chart.title} range`}>
          {CHART_RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === rangeId}
              onClick={() => setRangeId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="activity-chart-body">
        <div
          className="activity-chart-y-axis"
          aria-hidden="true"
          // The labels are positioned absolutely, so they don't size the axis
          style={{ width: `${top.toLocaleString().length}ch` }}
        >
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
              {tick.toLocaleString()}
            </span>
          ))}
        </div>
        <div className="activity-chart-main">
          <div className="activity-chart-plot">
            <svg
              viewBox={`0 0 ${bars.length} 100`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${chart.title}, ${range.label}: ${summary}`}
            >
              {ticks.slice(1).map((tick) => (
                <line
                  key={tick}
                  className="activity-chart-gridline"
                  x1={0}
                  x2={bars.length}
                  y1={100 - (tick / top) * 100}
                  y2={100 - (tick / top) * 100}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {bars.map((bar, index) => {
                // Bars with nothing behind them have no cards to list
                if (!(chart.retention ? bar.reviews : bar.value)) return null
                const title = barTitle(chart, bar)
                const open = () => onSelectBar(chart.opens, bar)
                return (
                  <g
                    key={bar.start}
                    className="activity-chart-bar-group"
                    role="button"
                    tabIndex={0}
                    aria-label={`${title}. Show these cards`}
                    onClick={open}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        open()
                      }
                    }}
                  >
                    <title>{title}</title>
                    {/* The full column is clickable, so short bars are easy to hit */}
                    <rect className="activity-chart-hit" x={index} width={1} y={0} height={100} />
                    {chart.retention ? (
                      // As tall as the bar's review count, split into passed
                      // (bottom) and failed (top)
                      <>
                        <rect
                          className="activity-chart-bar activity-chart-bar-failed"
                          x={index + 0.1}
                          width={0.8}
                          y={100 - (bar.reviews / top) * 100}
                          height={((bar.reviews - bar.passed) / top) * 100}
                        />
                        <rect
                          className="activity-chart-bar activity-chart-bar-passed"
                          x={index + 0.1}
                          width={0.8}
                          y={100 - (bar.passed / top) * 100}
                          height={(bar.passed / top) * 100}
                        />
                      </>
                    ) : (
                      <rect
                        className={`activity-chart-bar activity-chart-bar-${chart.id}`}
                        x={index + 0.1}
                        width={0.8}
                        y={100 - (bar.value / top) * 100}
                        height={(bar.value / top) * 100}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="activity-chart-axis">
            <span>{formatDayKey(bars[0].start)}</span>
            <span>{formatDayKey(bars.at(-1).end)}</span>
          </div>
        </div>
      </div>
      {chart.retention && (
        <ul className="activity-chart-legend">
          <li>
            <span className="activity-chart-swatch activity-chart-bar-passed" />
            Passed
          </li>
          <li>
            <span className="activity-chart-swatch activity-chart-bar-failed" />
            Failed
          </li>
        </ul>
      )}
    </figure>
  )
}

// Charts of cards added, reviews, cards coming due, and retention over time.
// history is the stats response's daily counts (see server/src/flashcardStats.js).
// onSelectBar(kind, { start, end }) opens the cards behind a clicked bar.
export default function ActivityCharts({ history, today, onSelectBar }) {
  const earliest = earliestDay(history.added, history.reviews) ?? today

  return (
    <section className="activity-charts" aria-label="Activity over time">
      {CHARTS.map((chart) => (
        <ActivityChart
          key={chart.id}
          chart={chart}
          history={history}
          today={today}
          earliest={earliest}
          onSelectBar={onSelectBar}
        />
      ))}
    </section>
  )
}
