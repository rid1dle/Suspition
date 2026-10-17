// Plain CommonJS so it runs on any Node and can explain the problem before a .ts file is loaded.
const NEED = 24;

function nodeOk(version) {
  return Number(String(version).replace(/^v/, '').split('.')[0]) >= NEED;
}

const MESSAGE = (version) => `Suspition needs Node ${NEED} or newer (this is Node ${version}).\nRun: nvm use 24   (or once: nvm alias default 24), then try again.`;

if (require.main === module && !nodeOk(process.version)) {
  console.error(MESSAGE(process.version));
  process.exit(1);
}

module.exports = { nodeOk, MESSAGE };
