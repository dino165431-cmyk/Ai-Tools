const fileOperations = require('./utils/file-operations')
const globalConfig = require('./utils/global-config')
const createMCPClient = require('./utils/mcp-client')
const notebookRuntime = require('./utils/notebook-runtime')
const webOperations = require('./utils/web-operations')

// Ensure built-in presets exist and are ordered first.
try {
  globalConfig.ensureBuiltins?.()
} catch (e) {
  // ignore (only available in uTools runtime)
}

window.globalConfig = globalConfig
window.fileOperations = fileOperations
window.createMCPClient = createMCPClient
window.notebookRuntime = notebookRuntime
window.webOperations = webOperations
