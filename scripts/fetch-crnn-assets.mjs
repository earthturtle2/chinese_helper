/**
 * 下载 chineseocr_lite 的 CRNN ONNX 与 keys.py，并提取 alphabet 到 public/models。
 * 设计文档：浏览器端 ONNX WASM 手写识别（DESIGN.md §3.1 / §5.3）。
 */
import fs from 'fs';
import https from 'https';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'client', 'public', 'models');

const ONNX_URL =
  'https://raw.githubusercontent.com/DayBreak-u/chineseocr_lite/onnx/models/crnn_lite_lstm.onnx';
const KEYS_URL = 'https://raw.githubusercontent.com/DayBreak-u/chineseocr_lite/onnx/crnn/keys.py';

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchBinary(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

function fetchText(url) {
  return fetchBinary(url).then((b) => b.toString('utf8'));
}

/** 解析 Python `alphabetChinese = u'...'`（支持 \' 转义，容忍空格） */
function extractAlphabet(py) {
  const m = py.match(/alphabetChinese\s*=\s*u'/);
  if (!m) throw new Error('alphabetChinese not found in keys.py');
  let i = m.index + m[0].length;
  let out = '';
  while (i < py.length) {
    const c = py[i];
    if (c === '\\') {
      i++;
      if (i < py.length) out += py[i++];
      continue;
    }
    if (c === "'") break;
    out += c;
    i++;
  }
  return out;
}

async function main() {
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const onnxPath = join(OUT_DIR, 'crnn_lite_lstm.onnx');
  const alphabetPath = join(OUT_DIR, 'alphabet-chinese.txt');

  if (
    !force &&
    fs.existsSync(onnxPath) &&
    fs.statSync(onnxPath).size > 1_000_000 &&
    fs.existsSync(alphabetPath) &&
    fs.statSync(alphabetPath).size > 1000
  ) {
    console.log('[fetch-crnn] Models already present, skip download. Use --force to re-download.');
    return;
  }

  console.log('[fetch-crnn] Downloading CRNN ONNX...');
  const onnx = await fetchBinary(ONNX_URL);
  fs.writeFileSync(onnxPath, onnx);
  console.log('[fetch-crnn] Wrote crnn_lite_lstm.onnx', `(${(onnx.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('[fetch-crnn] Downloading keys.py...');
  const keysPy = await fetchText(KEYS_URL);
  const alphabet = extractAlphabet(keysPy);
  fs.writeFileSync(alphabetPath, alphabet, 'utf8');
  console.log('[fetch-crnn] Wrote alphabet-chinese.txt', `(chars: ${[...alphabet].length})`);
  console.log('[fetch-crnn] Done.');
}

main().catch((e) => {
  console.error('[fetch-crnn] Failed:', e.message);
  process.exit(1);
});
