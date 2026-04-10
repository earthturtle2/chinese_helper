/**
 * 下载 Piper 中文女声（华燕 medium）模型到 models/piper/。
 * 仍需从 https://github.com/rhasspy/piper/releases 下载对应平台的 piper 可执行文件，并设置 .env 中 PIPER_BIN。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'models', 'piper');
const base =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/';
const files = ['zh_CN-huayan-medium.onnx', 'zh_CN-huayan-medium.onnx.json'];

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  console.log(`已保存 ${dest}（${buf.length} 字节）`);
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  for (const f of files) {
    await download(base + f, path.join(root, f));
  }
  console.log('\n下一步：从 https://github.com/rhasspy/piper/releases 下载 Windows/Linux 的 piper 压缩包，解压后在 .env 设置 PIPER_BIN=.../piper.exe（或 piper 可执行文件路径）。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
