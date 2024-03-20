const fs = require("fs");
const path = require("path");
const readline = require("readline");

const nodeIdIndex = process.argv.indexOf("--nodeId");
const nodeId = nodeIdIndex !== -1 ? parseInt(process.argv[nodeIdIndex + 1]) : 0;

function readLastLine(filePath) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity // To treat both '\r\n' and '\n' as newlines
    });

    let lastLine = "";

    rl.on("line", (line) => {
      lastLine = line;
    });

    rl.on("close", () => {
      resolve(lastLine);
    });

    rl.on("error", (err) => {
      reject(err);
    });
  });
}

function extractMessage(logString) {
  const lastIndex = logString.lastIndexOf("-"); // Find the last occurrence of '-'
  if (lastIndex !== -1) {
    let inputString = logString.substring(lastIndex + 1).trim(); // Extract the message part and trim any leading/trailing spaces
    const keyValuePairs = inputString.split(",").map((pair) => pair.trim()); // Split string by commas and remove leading/trailing spaces
    const keyValueDict = {};
    keyValuePairs.forEach((pair) => {
      const [key, value] = pair.split(":").map((item) => item.trim()); // Split each pair by colon and remove leading/trailing spaces
      keyValueDict[key] = value; // Convert value to integer
    });
    return keyValueDict;
  } else {
    // If no '-' is found, return the entire string
    return {};
  }
}

function extractLogs(logString) {
  const lastIndex = logString.lastIndexOf("-"); // Find the last occurrence of '-'
  if (lastIndex !== -1) {
    let inputString = logString.substring(lastIndex + 1).trim(); // Extract the message part and trim any leading/trailing spaces
    let last_i = inputString.lastIndexOf(" ");
    if (last_i !== -1) {
      let msg = inputString.split(" ");
      let term = msg.pop();
      msg = msg.join(" ").trim();
      return {
        term: term,
        msg: msg
      };
    } else {
      return {};
    }
  } else {
    // If no '-' is found, return the entire string
    return {};
  }
}

const readlogFile = async () => {
  const logFilePath = path.join(__dirname, `logs_node_${nodeId}`, "logs.txt");
  let resp = [];
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(logFilePath),
      crlfDelay: Infinity // To treat both '\r\n' and '\n' as newlines
    });

    rl.on("line", (line) => {
      let dic = extractLogs(line);
      resp.push(dic);
    });

    rl.on("close", () => {
      console.log(resp);
      resolve(resp);
    });

    rl.on("error", (err) => {
      reject(err);
    });
  });
};

const readmetadataFile = async () => {
  const logFilePath = path.join(
    __dirname,
    `logs_node_${nodeId}`,
    "metadata.txt"
  );
  let res = await readLastLine(logFilePath)
    .then((lastLine) => {
      if (lastLine) {
        let dic = extractMessage(lastLine);

        return dic;
      }
    })
    .catch((err) => {
      console.error("Error reading file:", err);
    });
  return res || {};
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

module.exports = { readmetadataFile, readlogFile };
