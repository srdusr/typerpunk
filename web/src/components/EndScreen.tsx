import { useEffect, useRef, useState, FC } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Stats, Theme } from '../types';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
} from 'chart.js';
import type { ChartData } from 'chart.js';
ChartJS.register(LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale);

interface Props {
    stats: Stats;
    wpmHistory: Array<{ time: number; wpm: number; raw: number; isError: boolean }>;
    onPlayAgain: () => void;
    onMainMenu: () => void;
    text: string;
    userInput: string;
    charTimings?: Array<{ time: number; isCorrect: boolean; char: string; index: number }>;
    keypressHistory?: Array<{ time: number; index: number; isCorrect: boolean }>;
}

export const EndScreen: FC<Props> = ({ stats, wpmHistory, onPlayAgain, onMainMenu, text, userInput, charTimings, keypressHistory }) => {
    // Responsive flag must be declared first
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
    const { theme, toggleTheme } = useTheme();
    const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 700);

    // Debug log
    console.log('EndScreen wpmHistory:', wpmHistory);
    console.log('EndScreen stats:', stats);
    console.log('EndScreen charTimings:', charTimings);
    console.log('EndScreen userInput:', userInput);
    console.log('EndScreen text:', text);

    // --- Monkeytype-style rolling window graph data for WPM and RAW ---
    const graphInterval = 1.0; // seconds, for 1s intervals
    const wpmWindow = 2.0; // seconds (WPM window)
    const rawWindow = 0.5; // seconds (RAW window)
    let graphPoints: { time: number; wpm: number; raw: number }[] = [];
    if (charTimings && charTimings.length > 0) {
        const maxTime = Math.max(charTimings[charTimings.length - 1].time, stats.time);
        for (let t = 1; t <= Math.ceil(maxTime); t += graphInterval) { // start at 1s, step by 1s
            // WPM: correct chars in last 2.0s
            const wpmChars = charTimings.filter(c => c.time > t - wpmWindow && c.time <= t);
            const wpmCorrect = wpmChars.filter(c => c.isCorrect).length;
            const wpm = wpmCorrect > 0 ? (wpmCorrect / 5) / (wpmWindow / 60) : 0;
            // RAW: all chars in last 0.5s
            const rawChars = charTimings.filter(c => c.time > t - rawWindow && c.time <= t);
            const raw = rawChars.length > 0 ? (rawChars.length / 5) / (rawWindow / 60) : 0;
            graphPoints.push({ time: t, wpm, raw });
        }
        // Apply moving average smoothing to WPM and RAW
        const smoothWPM: number[] = [];
        const smoothRAW: number[] = [];
        const smoothWindow = 10; // more smoothing
        for (let i = 0; i < graphPoints.length; i++) {
            let sumWPM = 0, sumRAW = 0, count = 0;
            for (let j = Math.max(0, i - smoothWindow + 1); j <= i; j++) {
                sumWPM += graphPoints[j].wpm;
                sumRAW += graphPoints[j].raw;
                count++;
            }
            smoothWPM.push(sumWPM / count);
            smoothRAW.push(sumRAW / count);
        }
        graphPoints = graphPoints.map((p, i) => ({ ...p, wpm: smoothWPM[i], raw: smoothRAW[i] }));
    } else if (stats.time > 0 && text.length > 0) {
        // fallback: simulate timings
        const charTimingsSim: { time: number; isCorrect: boolean }[] = [];
        for (let i = 0; i < stats.correctChars + stats.incorrectChars; i++) {
            const charTime = (i / (stats.correctChars + stats.incorrectChars)) * stats.time;
            const isCorrect = i < stats.correctChars;
            charTimingsSim.push({ time: charTime, isCorrect });
        }
        for (let t = 1; t <= Math.ceil(stats.time); t += graphInterval) {
            const wpmChars = charTimingsSim.filter(c => c.time > t - wpmWindow && c.time <= t);
            const wpmCorrect = wpmChars.filter(c => c.isCorrect).length;
            const wpm = wpmCorrect > 0 ? (wpmCorrect / 5) / (wpmWindow / 60) : 0;
            const rawChars = charTimingsSim.filter(c => c.time > t - rawWindow && c.time <= t);
            const raw = rawChars.length > 0 ? (rawChars.length / 5) / (rawWindow / 60) : 0;
            graphPoints.push({ time: t, wpm, raw });
        }
        // Apply moving average smoothing to WPM and RAW
        const smoothWPM: number[] = [];
        const smoothRAW: number[] = [];
        const smoothWindow = 10;
        for (let i = 0; i < graphPoints.length; i++) {
            let sumWPM = 0, sumRAW = 0, count = 0;
            for (let j = Math.max(0, i - smoothWindow + 1); j <= i; j++) {
                sumWPM += graphPoints[j].wpm;
                sumRAW += graphPoints[j].raw;
                count++;
            }
            smoothWPM.push(sumWPM / count);
            smoothRAW.push(sumRAW / count);
        }
        graphPoints = graphPoints.map((p, i) => ({ ...p, wpm: smoothWPM[i], raw: smoothRAW[i] }));
    }
    // --- Chart.js data and options ---
    // Build labels for every second
    const xMax = Math.ceil(stats.time);
    const allLabels = Array.from({length: xMax}, (_, i) => (i+1).toString());
    // Map graphPoints by time for quick lookup
    const graphPointsByTime = Object.fromEntries(graphPoints.map(p => [Math.round(p.time), p]));
    // --- Error points for the graph (Monkeytype style, per-error, at closest WPM value, using keypressHistory) ---
    let errorPoints: { x: number; y: number }[] = [];
    if (keypressHistory && keypressHistory.length > 0) {
        keypressHistory.forEach(({ time, isCorrect }) => {
            if (!isCorrect) {
                let p = graphPoints.reduce((prev, curr) =>
                    Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev, graphPoints[0]);
                if (p) {
                    errorPoints.push({ x: p.time, y: p.wpm });
                }
            }
        });
    } else if (charTimings && charTimings.length > 0) {
        charTimings.forEach(({ time, isCorrect }) => {
            if (!isCorrect) {
                let p = graphPoints.reduce((prev, curr) =>
                    Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev, graphPoints[0]);
                if (p) {
                    errorPoints.push({ x: p.time, y: p.wpm });
                }
            }
        });
    }
    console.log('EndScreen errorPoints:', errorPoints);
    console.log('EndScreen graphPoints:', graphPoints);
    const chartData = {
        labels: allLabels,
        datasets: [
            {
                label: 'WPM',
                data: graphPoints.map((p) => ({ x: p.time, y: p.wpm })),
                borderColor: '#00ff9d',
                backgroundColor: 'rgba(0,255,157,0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4, // smoother line
                type: 'line',
                order: 1,
                yAxisID: 'y',
                pointStyle: 'line',
            },
            {
                label: 'RAW',
                data: graphPoints.map((p) => ({ x: p.time, y: p.raw })),
                borderColor: '#00cc8f',
                backgroundColor: 'rgba(0,204,143,0.1)',
                borderWidth: 1,
                borderDash: [10, 8],
                pointRadius: 0,
                tension: 0.25,
                type: 'line',
                order: 2,
                yAxisID: 'y',
                pointStyle: 'line',
            },
            {
                label: 'Errors',
                data: errorPoints,
                borderColor: '#ff3b3b',
                borderWidth: 0,
                backgroundColor: '#ff3b3b',
                pointRadius: 3,
                type: 'scatter',
                showLine: false,
                order: 3,
                yAxisID: 'y',
                pointStyle: 'circle',
            },
        ],
    } as ChartData<'line'>;
    // --- Dynamic X-axis step size for time (responsive, long time) ---
    let xStep = 1;
    let autoSkip = false;
    let maxTicksLimit = 100;
    let xMin = 1;
    if (window.innerWidth < 700) {
        xStep = 2;
        autoSkip = true;
        maxTicksLimit = 10;
        xMin = 2; // start at 2 for even spacing if skipping by 2
    }
    // Calculate max number of x labels that fit in the viewport (assume 40px per label)
    const maxLabels = Math.floor((isMobileScreen ? window.innerWidth : 600) / 40); // 600px for graph area on desktop
    if (xMax > maxLabels) {
        xStep = Math.ceil(xMax / maxLabels);
    } else if (xMax > 60) xStep = 10;
    else if (xMax > 30) xStep = 5;
    const chartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                align: 'center',
                labels: {
                    color: '#00ff9d',
                    font: { family: 'JetBrains Mono, monospace', size: 12 },
                    boxWidth: 24,
                    boxHeight: 12,
                    usePointStyle: false,
                    symbol: (ctx: any) => {
                      const {dataset} = ctx;
                      return function customLegendSymbol(ctx2: any, x: any, y: any, width: any, height: any) {
                        ctx2.save();
                        if (dataset.label === 'RAW') {
                          // Dashed line
                          ctx2.strokeStyle = dataset.borderColor || '#00cc8f';
                          ctx2.lineWidth = 3;
                          ctx2.setLineDash([8, 5]);
                          ctx2.beginPath();
                          ctx2.moveTo(x, y + height / 2);
                          ctx2.lineTo(x + width, y + height / 2);
                          ctx2.stroke();
                          ctx2.setLineDash([]);
                        } else if (dataset.label === 'Errors') {
                          // Small dot
                          ctx2.fillStyle = dataset.borderColor || '#ff3b3b';
                          ctx2.beginPath();
                          ctx2.arc(x + width / 2, y + height / 2, 4, 0, 2 * Math.PI);
                          ctx2.fill();
                        } else if (dataset.label === 'WPM') {
                          // Solid line
                          ctx2.strokeStyle = dataset.borderColor || '#00ff9d';
                          ctx2.lineWidth = 3;
                          ctx2.beginPath();
                          ctx2.moveTo(x, y + height / 2);
                          ctx2.lineTo(x + width, y + height / 2);
                          ctx2.stroke();
                        }
                        ctx2.restore();
                      };
                    },
                },
            },
            tooltip: {
                enabled: true,
                mode: 'nearest',
                intersect: false,
                usePointStyle: true,
                callbacks: {
                    labelPointStyle: function(context: any) {
                      if (context.dataset.label === 'WPM') {
                        return { pointStyle: 'line', rotation: 0, borderWidth: 2, borderDash: [] };
                      }
                      if (context.dataset.label === 'RAW') {
                        // Chart.js does not support dashed line in tooltip, so use line
                        return { pointStyle: 'line', rotation: 0, borderWidth: 2, borderDash: [] };
                      }
                      if (context.dataset.label === 'Errors') {
                        return { pointStyle: 'circle', rotation: 0, borderWidth: 0, radius: 4 };
                      }
                      return { pointStyle: 'circle', rotation: 0 };
                    },
                    label: function(context: any) {
                        if (context.dataset.label === 'WPM') {
                            return `WPM: ${Math.round(context.parsed.y)}`;
                        }
                        if (context.dataset.label === 'RAW') {
                            return `Raw: ${Math.round(context.parsed.y)}`;
                        }
                        if (context.dataset.label === 'Errors') {
                            if (context.chart.tooltip?._errorShown) return '';
                            context.chart.tooltip._errorShown = true;
                            let errorText = '';
                            if (charTimings && charTimings.length > 0 && text) {
                                const errorPoint = context.raw;
                                const closest = charTimings.reduce((prev, curr) =>
                                    Math.abs(curr.time - errorPoint.x) < Math.abs(prev.time - errorPoint.x) ? curr : prev, charTimings[0]);
                                if (!closest.isCorrect) {
                                    const idx = closest.index;
                                    let start = idx, end = idx;
                                    while (start > 0 && text[start-1] !== ' ') start--;
                                    while (end < text.length && text[end] !== ' ') end++;
                                    const word = text.slice(start, end).trim();
                                    if (word.length > 0) {
                                        errorText = `Error: "${word}"`;
                                    } else {
                                        errorText = `Error: '${closest.char}'`;
                                    }
                                }
                            }
                            return errorText || 'Error';
                        }
                        return '';
                    },
                    title: function() { return ''; },
                },
                backgroundColor: 'rgba(30,30,30,0.97)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: '#00ff9d',
                borderWidth: 1,
                caretSize: 6,
                padding: 10,
                external: function(context: any) {
                    if (context && context.tooltip) {
                        context.tooltip._errorShown = false;
                    }
                },
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Time (s)',
                    color: '#646669',
                    font: { family: 'JetBrains Mono, monospace', size: 13, weight: 'bold' },
                    align: 'center',
                },
                min: xMin,
                max: xMax,
                type: 'linear',
                offset: false, // no extra space/lines before 1 or after xMax, even spacing
                ticks: {
                    color: '#646669',
                    font: { family: 'JetBrains Mono, monospace', size: 12 },
                    stepSize: xStep,
                    autoSkip: autoSkip,
                    maxTicksLimit: maxTicksLimit,
                    callback: function(val: string | number) {
                        const tickNum = Number(val);
                        return Number.isInteger(tickNum) ? tickNum : '';
                    },
                    maxRotation: 0,
                    minRotation: 0,
                },
                grid: { color: 'rgba(100,102,105,0.15)' },
                beginAtZero: false,
            },
            y: {
                title: {
                    display: true,
                    text: 'WPM',
                    color: '#646669',
                    font: { family: 'JetBrains Mono, monospace', size: 13, weight: 'bold' },
                },
                beginAtZero: true,
                ticks: {
                    color: '#646669',
                    font: { family: 'JetBrains Mono, monospace', size: 12 },
                },
                grid: { color: 'rgba(100,102,105,0.15)' },
                position: 'left',
            },
        },
    };
    // --- Axis scaling and responsive graph width ---
    const minGraphWidth = 320;
    const maxGraphWidth = 1200;
    const pxPerSecond = 60;
    const graphHeight = isMobileScreen ? 160 : 220;
    const graphWidth = Math.min(Math.max(minGraphWidth, Math.min((xMax) * pxPerSecond, maxGraphWidth)), window.innerWidth - 32);
    const margin = 40;
    const axisFont = '12px JetBrains Mono, monospace';
    const maxTime = stats.time || (graphPoints.length > 0 ? graphPoints[graphPoints.length - 1].time : 1);
    const maxWPM = graphPoints.length > 0 ? Math.max(...graphPoints.map(p => p.wpm)) : 0;

    // --- Dynamic Y-axis step size for WPM ---
    let yStep = xMax > 60 ? 10 : (maxWPM > 50 ? 10 : 5);
    let yMax = Math.max(yStep, Math.ceil(maxWPM / yStep) * yStep);
    if (window.innerWidth < 700 && yMax > 60) {
        yStep = 20;
        yMax = Math.max(yStep, Math.ceil(maxWPM / yStep) * yStep);
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || graphPoints.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Set canvas size
        canvas.width = graphWidth;
        canvas.height = graphHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // --- Draw axes ---
        ctx.strokeStyle = '#646669';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Y axis
        ctx.moveTo(margin, margin);
        ctx.lineTo(margin, canvas.height - margin);
        // X axis
        ctx.moveTo(margin, canvas.height - margin);
        ctx.lineTo(canvas.width - margin, canvas.height - margin);
        ctx.stroke();
        // --- Draw Y ticks and labels ---
        ctx.font = axisFont;
        ctx.fillStyle = '#646669';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let yValue = 0; yValue <= yMax; yValue += yStep) {
            const y = canvas.height - margin - (yValue / yMax) * (canvas.height - 2 * margin);
            ctx.beginPath();
            ctx.moveTo(margin - 6, y);
            ctx.lineTo(margin, y);
            ctx.stroke();
            ctx.fillText(Math.round(yValue).toString(), margin - 8, y);
        }
        // --- Draw X ticks and labels (every whole second) ---
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let xValue = 0; xValue <= xMax; xValue += 1) {
            const x = margin + xValue * ((canvas.width - 2 * margin) / (xMax || 1));
        ctx.beginPath();
            ctx.moveTo(x, canvas.height - margin);
            ctx.lineTo(x, canvas.height - margin + 6);
        ctx.stroke();
            if (xValue % 5 === 0 || xValue === 0 || xValue === xMax) {
                ctx.fillText(xValue.toString(), x, canvas.height - margin + 8);
            }
        }
        // --- Draw WPM line ---
        ctx.strokeStyle = '#00ff9d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        graphPoints.forEach((point, i) => {
            const x = margin + point.time * ((canvas.width - 2 * margin) / (xMax || 1));
            const y = canvas.height - margin - (point.wpm / yMax) * (canvas.height - 2 * margin);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // --- Axis labels ---
        ctx.save();
        ctx.font = 'bold 13px JetBrains Mono, monospace';
        ctx.fillStyle = '#646669';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Time (s)', canvas.width / 2, canvas.height - 2);
        ctx.save();
        ctx.translate(10, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('WPM', 0, 0);
        ctx.restore();
        ctx.restore();
    }, [graphPoints]);

    useEffect(() => {
        const handleResize = () => setIsMobileScreen(window.innerWidth < 700);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Text highlighting (per-letter, using charTimings) ---
    const renderText = () => {
        if (!text) return null;
        const inputChars = userInput ? userInput.split('') : [];
        // Split text into words with trailing spaces (so spaces stay with words)
        const wordRegex = /[^\s]+\s*/g;
        const wordMatches = text.match(wordRegex) || [];
        let charIndex = 0;
        return wordMatches.map((word, wIdx) => {
            const chars = [];
            for (let i = 0; i < word.length; i++) {
                const char = word[i];
                const inputChar = inputChars[charIndex];
                let className = 'neutral';
                let displayChar = char;
                if (charIndex < inputChars.length) {
                    if (inputChar === char) {
                        className = 'correct';
                    } else {
                        className = 'incorrect';
                        displayChar = inputChar; // Show the mistyped character
                    }
                }
                chars.push(
                    <span key={`char-${charIndex}`} className={className}>{displayChar}</span>
                );
                charIndex++;
            }
            return <span key={`word-${wIdx}`}>{chars}</span>;
        });
    };
    // --- Layout ---
    return (
        <div className="end-screen" style={{ maxWidth: 900, margin: '0 auto', minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100vh', boxSizing: 'border-box', overflow: 'hidden' }}>
            {/* Logo at top, same as TypingGame */}
            <div className="logo" onClick={onMainMenu}>TyperPunk</div>
            {/* Main content area, all in one flex column, no fixed elements */}
            <div style={{
                width: '100%',
                flex: '1 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                overflow: 'hidden',
                maxHeight: 'calc(100vh - 220px)',
                boxSizing: 'border-box',
            }}>
                {/* Text */}
                <div className="end-screen-text" style={{ fontSize: '1.25rem', lineHeight: 1.7, maxWidth: 700, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '1rem 1.5rem', textAlign: 'left', wordBreak: 'break-word', height: 'auto' }}>
                    <div className="text-display" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', width: '100%' }}>{renderText()}</div>
                </div>
                {/* Desktop: WPM | Graph | ACC */}
                {!isMobileScreen && (
                  <>
                    {/* WPM far left, fixed to viewport edge */}
                    <div style={{ position: 'fixed', left: '2rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                      <div className="end-screen-stat wpm" style={{ textAlign: 'left', alignItems: 'flex-start', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                        <div className="stat-label" style={{ textAlign: 'left', width: '100%' }}>WPM</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'left', width: '100%' }}>{Math.round(stats.wpm)}</div>
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'left', width: '100%' }}>RAW</div>
                        <div className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '1.2rem', textAlign: 'left', width: '100%' }}>{Math.round(stats.rawWpm)}</div>
                      </div>
                    </div>
                    {/* ACC far right, fixed to viewport edge */}
                    <div style={{ position: 'fixed', right: '2rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div className="end-screen-stat acc" style={{ textAlign: 'right', alignItems: 'flex-end', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                        <div className="stat-label" style={{ textAlign: 'right', width: '100%' }}>ACC</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'right', width: '100%' }}>{Math.round(stats.accuracy)}%</div>
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'right', width: '100%' }}>ERR</div>
                        <div className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '1.2rem', textAlign: 'right', width: '100%' }}>{stats.incorrectChars}</div>
                      </div>
                    </div>
                    {/* Graph center, take all available space with margin for stats */}
                    <div style={{ margin: '0 auto 1.5rem auto', width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                      {graphPoints.length > 0 && (
                        <div className="graph-container" style={{ flex: '1 1 0', minWidth: 0, width: '100%', maxWidth: '100%', maxHeight: graphHeight, minHeight: graphHeight, height: graphHeight, margin: '0 auto', position: 'relative', background: 'rgba(0,0,0,0.02)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Line data={chartData} options={chartOptions} style={{ width: '100%', height: graphHeight }} />
                          </div>
                        </div>
                      )}
            {/* Transparent theme toggle (no class to avoid inherited styles) */}
            <button
                onClick={toggleTheme}
                style={{
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    outline: 'none',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    padding: 0,
                    margin: 0,
                    borderRadius: 0,
                }}
            >
                {theme === Theme.Dark ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                )}
            </button>
                      {/* TIME stat below graph */}
                      <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'center', width: '100%', marginTop: 12 }}>TIME</div>
                      <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'center', width: '100%' }}>{stats.time.toFixed(1)}</div>
                    </div>
                  </>
                )}
                {isMobileScreen && (
                  <>
                    {/* Graph at top, legend centered */}
                    {graphPoints.length > 0 && (
                      <div className="graph-container" style={{ flex: 'none', minWidth: 0, width: '100%', maxWidth: '100%', maxHeight: graphHeight, minHeight: graphHeight, height: graphHeight, margin: '0 auto 0.5rem auto', position: 'relative', background: 'rgba(0,0,0,0.02)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {/* Center legend above chart by wrapping chart in a flex column */}
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <Line data={chartData} options={chartOptions} style={{ width: '100%', height: graphHeight }} />
                        </div>
                      </div>
                    )}
                    {/* WPM, TIME, ACC in a row below graph */}
                    <div className="end-screen-stats" style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      alignItems: 'center',
                      width: '100%',
                      maxWidth: 700,
                      margin: '0.5rem auto 0.2rem auto',
                      gap: '0.3rem',
                    }}>
                      {/* WPM (left) */}
                      <div className="end-screen-stat wpm" style={{ textAlign: 'left', alignItems: 'flex-start', justifyContent: 'center' }}>
                        <div className="stat-label" style={{ textAlign: 'left', width: '100%' }}>WPM</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'left', width: '100%' }}>{Math.round(stats.wpm)}</div>
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'left', width: '100%' }}>RAW</div>
                        <div className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '1.2rem', textAlign: 'left', width: '100%' }}>{Math.round(stats.rawWpm)}</div>
                      </div>
                      {/* TIME (center, big) */}
                      <div className="end-screen-stat time" style={{ textAlign: 'center', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'center', width: '100%' }}>TIME</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'center', width: '100%' }}>{stats.time.toFixed(1)}</div>
                      </div>
                      {/* ACC (right) */}
                      <div className="end-screen-stat acc" style={{ textAlign: 'right', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div className="stat-label" style={{ textAlign: 'right', width: '100%' }}>ACC</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'right', width: '100%' }}>{Math.round(stats.accuracy)}%</div>
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'right', width: '100%' }}>ERR</div>
                        <div className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '1.2rem', textAlign: 'right', width: '100%' }}>{stats.incorrectChars}</div>
                      </div>
                    </div>
                    {/* Buttons closer to stats */}
                    <div className="end-screen-buttons" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', width: '100%' }}>
                      <button
                        className="end-screen-button"
                        style={{
                          width: '100%',
                          maxWidth: 250,
                          fontSize: '1rem',
                          padding: '0.7rem 1.2rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        onClick={() => { setTimeout(onPlayAgain, 0); }}
                      >
                        Play Again
                      </button>
                      <button
                        className="end-screen-button"
                        style={{
                          width: '100%',
                          maxWidth: 250,
                          fontSize: '1rem',
                          padding: '0.7rem 1.2rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        onClick={() => { setTimeout(onMainMenu, 0); }}
                      >
                        Main Menu
                      </button>
                    </div>
                  </>
                )}
            </div>
            {/* Desktop: Move the button row outside the main content and make it fixed at the bottom */}
            {!isMobileScreen && (
                <div className="end-screen-buttons" style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1.5rem', zIndex: 100, marginBottom: '8rem' }}>
                    <button
                        className="end-screen-button"
                        style={{
                            width: 180,
                            maxWidth: 250,
                            fontSize: '1.2rem',
                            padding: '1rem 2rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                        onClick={() => { setTimeout(onPlayAgain, 0); }}
                    >
                        Play Again
                    </button>
                    <button
                        className="end-screen-button"
                        style={{
                            width: 180,
                            maxWidth: 250,
                            fontSize: '1.2rem',
                            padding: '1rem 2rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                        onClick={() => { setTimeout(onMainMenu, 0); }}
                    >
                        Main Menu
                    </button>
                </div>
            )}
            {/* Theme button at the bottom, not fixed, match TypingGame */}
            <div className="future-modes-placeholder" />
            <button onClick={toggleTheme} className="theme-toggle">
                {theme === Theme.Dark ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                )}
            </button>
        </div>
    );
};

export default EndScreen;
