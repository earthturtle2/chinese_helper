/**
 * 统一手写识别入口：优先使用 HWDB 单字分类 CNN，若不可用则回退到 CRNN 行级模型。
 */
import {
  isHwdbModelAvailable,
  recognizeMultiCellInk as hwdbRecognize,
  recognizeMultiCellInkDetailed as hwdbRecognizeDetailed,
} from './hwdbRecognition';
import { recognizeMultiCellInk as crnnRecognize } from './crnnHandwriting';

let backend = null; // 'hwdb' | 'crnn'

async function detectBackend() {
  if (backend) return backend;
  const ok = await isHwdbModelAvailable();
  backend = ok ? 'hwdb' : 'crnn';
  console.log(`[handwriting] Using ${backend === 'hwdb' ? 'HWDB 单字分类 CNN' : 'CRNN 行级 OCR'}`);
  return backend;
}

export async function recognizeMultiCellInk(inkCanvases) {
  const b = await detectBackend();
  if (b === 'hwdb') {
    return hwdbRecognize(inkCanvases);
  }
  return crnnRecognize(inkCanvases);
}

export async function recognizeMultiCellInkDetailed(inkCanvases, options = {}) {
  const b = await detectBackend();
  if (b === 'hwdb') {
    return hwdbRecognizeDetailed(inkCanvases, options);
  }
  const text = await crnnRecognize(inkCanvases);
  return {
    backend: 'crnn',
    text,
    chars: Array.from(text).map((char) => ({
      text: char,
      candidates: [{ char, probability: 1, score: 0 }],
      modelInputPreview: null,
    })),
  };
}

export { detectBackend };
