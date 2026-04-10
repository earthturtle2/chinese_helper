import * as ort from 'onnxruntime-web';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = join(__dirname, 'public', 'models', 'crnn_lite_lstm.onnx');
if (!fs.existsSync(p)) {
  console.error('Missing', p);
  process.exit(1);
}
import { pathToFileURL } from 'url';
ort.env.wasm.wasmPaths = pathToFileURL(join(__dirname, 'node_modules/onnxruntime-web/dist/')).href + '/';
const session = await ort.InferenceSession.create(p, { executionProviders: ['wasm'] });
console.log('inputNames', session.inputNames);
console.log('outputNames', session.outputNames);
console.log('inputMetadata', session.inputMetadata);
console.log('outputMetadata', session.outputMetadata);
