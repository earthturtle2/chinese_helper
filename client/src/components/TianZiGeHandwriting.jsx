import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { recognizeInkCanvas } from '../utils/crnnHandwriting';

const LOGICAL_SIZE = 120;
const INK_COLOR = '#1a1a1a';
const GRID_COLOR = '#b8c5b0';

function setupHiDpiCanvas(canvas, logicalSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = logicalSize * dpr;
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${logicalSize}px`;
  canvas.style.height = `${logicalSize}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawGridOnly(ctx, size) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
}

function clearInk(ctx) {
  const c = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.restore();
}

/**
 * 田字格 + 笔迹层；本地 ONNX CRNN 识别，无键盘输入（DESIGN.md 手写识别闭环）。
 */
const TianZiGeHandwriting = forwardRef(function TianZiGeHandwriting({ charCount, disabled }, ref) {
  const count = Math.max(1, Math.min(charCount || 1, 12));
  const gridRefs = useRef([]);
  const inkRefs = useRef([]);
  const inkCtxRefs = useRef([]);
  const drawingRef = useRef(false);
  const [status, setStatus] = useState('');
  const [modelError, setModelError] = useState(null);

  const redrawGrids = useCallback(() => {
    for (let i = 0; i < count; i++) {
      const g = gridRefs.current[i];
      if (!g) continue;
      const ctx = g.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.width = LOGICAL_SIZE * dpr;
      g.height = LOGICAL_SIZE * dpr;
      g.style.width = `${LOGICAL_SIZE}px`;
      g.style.height = `${LOGICAL_SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGridOnly(ctx, LOGICAL_SIZE);
    }
  }, [count]);

  const resetInkLayers = useCallback(() => {
    for (let i = 0; i < count; i++) {
      const c = inkRefs.current[i];
      if (!c) continue;
      let ctx = inkCtxRefs.current[i];
      if (!ctx) {
        ctx = setupHiDpiCanvas(c, LOGICAL_SIZE);
        inkCtxRefs.current[i] = ctx;
      }
      clearInk(ctx);
    }
  }, [count]);

  useEffect(() => {
    redrawGrids();
    resetInkLayers();
  }, [count, redrawGrids, resetInkLayers]);

  const getLocalCoords = (canvas, e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * LOGICAL_SIZE;
    const y = ((e.clientY - r.top) / r.height) * LOGICAL_SIZE;
    return { x, y };
  };

  const onPointerDown = (e, idx) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = e.currentTarget;
    let ctx = inkCtxRefs.current[idx];
    if (!ctx) {
      ctx = setupHiDpiCanvas(canvas, LOGICAL_SIZE);
      inkCtxRefs.current[idx] = ctx;
    }
    const { x, y } = getLocalCoords(canvas, e);
    drawingRef.current = true;
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e, idx) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = e.currentTarget;
    const { x, y } = getLocalCoords(canvas, e);
    const ctx = inkCtxRefs.current[idx];
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const onPointerUp = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drawingRef.current = false;
  };

  const clearAll = useCallback(() => {
    resetInkLayers();
    setStatus('');
    setModelError(null);
  }, [resetInkLayers]);

  const recognize = async () => {
    setModelError(null);
    setStatus('识别中…');
    const parts = [];
    try {
      for (let i = 0; i < count; i++) {
        const ink = inkRefs.current[i];
        if (!ink) {
          parts.push('');
          continue;
        }
        const raw = await recognizeInkCanvas(ink);
        const ch = raw ? [...raw][0] : '';
        parts.push(ch || '');
      }
      const text = parts.join('');
      setStatus(text ? `识别结果：${text}` : '未识别到字迹，请重写');
      return text;
    } catch (e) {
      console.error(e);
      const msg = e?.message || '识别失败';
      setModelError(msg);
      setStatus('');
      return '';
    }
  };

  useImperativeHandle(ref, () => ({
    recognize,
    clear: clearAll,
  }));

  return (
    <div className="tianzige-handwriting">
      {modelError && <p className="hint-text tianzige-error">手写模型：{modelError}</p>}
      <div className="tianzige-row">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="tianzige-cell-wrap">
            <div className="tianzige-cell-inner">
              <canvas
                ref={(el) => {
                  gridRefs.current[i] = el;
                }}
                className="tianzige-grid-canvas"
                aria-hidden
              />
              <canvas
                ref={(el) => {
                  inkRefs.current[i] = el;
                }}
                className="tianzige-ink-canvas"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={(e) => onPointerMove(e, i)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="tianzige-toolbar">
        <button type="button" className="btn-text tianzige-clear" onClick={clearAll} disabled={disabled}>
          重写
        </button>
      </div>
      {status && <p className="hint-text tianzige-hint">{status}</p>}
      <p className="hint-text tianzige-hint">
        在田字格内书写后点击「确认」，系统将本地识别手写（无需键盘）。首次加载模型约数秒。
      </p>
    </div>
  );
});

export default TianZiGeHandwriting;
