/**
 * 下载 Piper 中文女声（华燕 medium）模型到 models/piper/。
 * 仍需从 https://github.com/rhasspy/piper/releases 下载对应平台的 piper 可执行文件，并设置 .env 中 PIPER_BIN。
 *
 * 网络超时 / 无法访问 huggingface.co 时：
 * 1. 在项目根目录 .env 设置 HF_ENDPOINT=https://hf-mirror.com 后重试；
 * 2. 或设置 HTTP_PROXY / HTTPS_PROXY；
 * 3. 或浏览器打开下方「手动下载」链接，将两个文件放入 models/piper/。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const files = ['zh_CN-huayan-medium.onnx', 'zh_CN-huayan-medium.onnx.json'];

function hfBase() {
  const raw = (process.env.HF_ENDPOINT || process.env.PIPER_HF_ENDPOINT || 'https://huggingface.co').trim();
  return raw.replace(/\/$/, '');
}

function buildUrl(baseHost, filename) {
  return `${baseHost}/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/${filename}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const s = `${err?.cause?.code || ''} ${err?.code || ''} ${err?.message || ''} ${err?.cause?.message || ''}`;
  return /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|fetch failed|socket|network|aborted/i.test(s);
}

async function downloadOnce(url, dest, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    console.log(`已保存 ${dest}（${buf.length} 字节）`);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWithRetry(url, dest, { retries = 4, timeoutMs } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadOnce(url, dest, timeoutMs);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < retries && isRetryable(e)) {
        const wait = Math.min(3000 * 2 ** (attempt - 1), 60000);
        console.warn(`下载失败（第 ${attempt}/${retries} 次）: ${e.message || e}，${Math.round(wait / 1000)}s 后重试…`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function printManualHelp(host) {
  const h = host.replace(/\/$/, '');
  console.error('\n--- 手动下载 ---');
  console.error('将下列文件保存到项目目录 models/piper/ ，文件名须完全一致：');
  for (const f of files) {
    console.error(`  ${buildUrl(h, f)}`);
  }
  console.error('\n国内可尝试将 HF_ENDPOINT=https://hf-mirror.com 写入 .env 后重新运行 npm run fetch-piper');
  console.error('若在服务器上，请检查防火墙、出站策略，或在本机下载后 scp 上传到 models/piper/。\n');
}

async function main() {
  const host = hfBase();
  const root = path.join(projectRoot, 'models', 'piper');
  const onnxTimeout = 900000;
  const jsonTimeout = 120000;

  console.log(`使用下载源: ${host}`);
  if (host.includes('huggingface.co')) {
    console.log('若连接超时，可在 .env 中设置 HF_ENDPOINT=https://hf-mirror.com 后重试。\n');
  }

  try {
    await fs.mkdir(root, { recursive: true });
    for (const f of files) {
      const url = buildUrl(host, f);
      const dest = path.join(root, f);
      const timeoutMs = f.endsWith('.json') ? jsonTimeout : onnxTimeout;
      await downloadWithRetry(url, dest, { retries: 4, timeoutMs });
    }
  } catch (e) {
    console.error('\n下载失败:', e.message || e);
    printManualHelp(host);
    process.exit(1);
  }

  console.log(
    '\n下一步：从 https://github.com/rhasspy/piper/releases 下载对应系统的 piper，解压后在 .env 设置 PIPER_BIN。',
  );
}

main().catch((e) => {
  console.error(e);
  printManualHelp(hfBase());
  process.exit(1);
});
