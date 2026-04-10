const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * @param {string} text
 * @param {{ bin: string; modelPath: string; timeoutMs?: number; lengthScale?: number | null }} opts
 * @returns {Promise<Buffer>}
 */
async function synthToWav(text, opts) {
  const { bin, modelPath, timeoutMs = 120000, lengthScale = null } = opts;
  if (!bin || !modelPath) {
    const err = new Error('Piper 未配置');
    err.code = 'PIPER_NOT_CONFIGURED';
    throw err;
  }
  if (!fsSync.existsSync(bin)) {
    const err = new Error(`Piper 可执行文件不存在: ${bin}`);
    err.code = 'PIPER_BIN_MISSING';
    throw err;
  }
  if (!fsSync.existsSync(modelPath)) {
    const err = new Error(`Piper 模型不存在: ${modelPath}`);
    err.code = 'PIPER_MODEL_MISSING';
    throw err;
  }
  const jsonPath = `${modelPath}.json`;
  if (!fsSync.existsSync(jsonPath)) {
    const err = new Error(`缺少模型配置: ${jsonPath}`);
    err.code = 'PIPER_JSON_MISSING';
    throw err;
  }

  const outFile = path.join(os.tmpdir(), `piper-${crypto.randomBytes(8).toString('hex')}.wav`);

  const spawnArgs = ['--model', modelPath];
  if (lengthScale != null && Number.isFinite(lengthScale) && lengthScale > 0) {
    spawnArgs.push('--length_scale', String(lengthScale));
  }
  spawnArgs.push('--output_file', outFile);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fs.unlink(outFile).catch(() => {});
      reject(Object.assign(new Error('Piper 合成超时'), { code: 'PIPER_TIMEOUT' }));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      fs.unlink(outFile).catch(() => {});
      reject(err);
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Piper 退出码 ${code}`));
          await fs.unlink(outFile).catch(() => {});
          return;
        }
        const buf = await fs.readFile(outFile);
        await fs.unlink(outFile).catch(() => {});
        resolve(buf);
      } catch (e) {
        await fs.unlink(outFile).catch(() => {});
        reject(e);
      }
    });

    child.stdin.write(text, 'utf8');
    child.stdin.end();
  });
}

function isConfigured(config) {
  return Boolean(config.piperBin && config.piperModel);
}

module.exports = { synthToWav, isConfigured };
