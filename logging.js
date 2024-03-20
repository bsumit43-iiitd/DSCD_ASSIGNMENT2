const fs = require("fs");
const path = require("path");


const nodeIdIndex = process.argv.indexOf("--nodeId");
const nodeId = nodeIdIndex !== -1 ? parseInt(process.argv[nodeIdIndex + 1]) : 0;


const logToFile = (level, message, filename) => {
  const timestamp = new Date().toISOString();

  const logMessage = `[${timestamp}] [${level.toUpperCase()}] - ${message}\n`;

  const logFilePath = path.join(__dirname, `logs_node_${nodeId}`, filename);

  fs.appendFile(logFilePath, logMessage, { flag: "a+" }, (err) => {
    if (err) {
      console.error(`Error writing to log file ${filename}:`, err);
    }
  });
};


const logDir = path.join(__dirname, `logs_node_${nodeId}`);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

["logs.txt", "metadata.txt", "dump.txt"].forEach((filename) => {
  const logFilePath = path.join(logDir, filename);
  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, "");
  }
});



// logToFile("info", "This is an info message.", "logs.txt");
// logToFile("error", "This is an error message.", "metadata.txt");
// logToFile("info", "This is an access log message.", "dump.txt");

module.exports = logToFile;
