const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { error } = require('./integrity');
const { reloadModel } = require('./risk-model');
let running = false;

async function trainModel() {
  if (process.env.VERCEL) throw error('Train locally and deploy the exported model; hosted training is disabled', 409);
  if (running) throw error('Training is already running', 409);
  const directory = path.join(__dirname, '..', 'model');
  if (!fs.existsSync(path.join(directory, 'smart_asset_final_dataset.csv'))) throw error('Training dataset is missing');
  const localPython = path.join(__dirname, '..', '..', '.venv-risk', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.PYTHON_BIN || (fs.existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
  running = true;
  try {
    const result = await new Promise((resolve, reject) => {
      execFile(python, [path.join(directory, 'train_risk_model.py')], {
        cwd: directory, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024
      }, (failure, stdout) => {
        if (failure) {
          const message = failure.code === 'ENOENT' ? 'Python is unavailable; configure PYTHON_BIN or .venv-risk'
            : failure.killed ? 'Training exceeded the three-minute limit'
              : 'Training failed; verify the dataset and install src/model/requirements.txt';
          return reject(error(message, failure.killed ? 409 : 400));
        }
        try { resolve(JSON.parse(stdout.trim())); } catch (_) { reject(error('Training returned an invalid result')); }
      });
    });
    reloadModel();
    return result;
  } finally { running = false; }
}
module.exports = { trainModel, isTraining: () => running };
