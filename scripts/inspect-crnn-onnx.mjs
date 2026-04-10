import * as ort from 'onnxruntime-web';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = join(__dirname, '..', 'client', 'public', 'models', 'crnn_lite_lstm.onnx');
if (!fs.existsSync(p)) {
  console.error('Missing', p);
  process.exit(1);
}
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/`;
const session = await ort.InferenceSession.create(p, { executionProviders: ['wasm'] });
console.log('inputNames', session.inputNames);
console.log('outputNames', session.outputNames);
for (const name of session.inputNames) {
  console.log('input', name, session.inputMetadata?.[name]);
}
for (const name of session.outputNames) {
  console.log('output', name, session.outputMetadata?.[name]);
}
await session.release?.();
