const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const leaderIndex = process.argv.indexOf("--leader");
const leaderAdd =
  leaderIndex !== -1 ? parseInt(process.argv[leaderIndex + 1]) : "0.0.0.0:2000";
let PORT = leaderAdd.split(":")?.[1];
let IP = leaderAdd.split(":")?.[0];

const PROTO_FILE = "./raft/raft.proto";
const packageDef = protoLoader.loadSync(path.resolve(__dirname, PROTO_FILE));
const grpcObj = grpc.loadPackageDefinition(packageDef);

const clusterInfo = {
  1: {
    port: "2000",
    ip: "0.0.0.0",
  },
  2: {
    port: "2001",
    ip: "0.0.0.0",
  },
  3: {
    port: "2002",
    ip: "0.0.0.0",
  },
  4: {
    port: "2003",
    ip: "0.0.0.0",
  },
  5: {
    port: "2004",
    ip: "0.0.0.0",
  },
};

if (!grpcObj.RaftService) {
  console.error(
    "Error: RaftService is not defined in the imported grpc object."
  );
  process.exit(1);
}

let client = new grpcObj.RaftService(
  `${IP}:${PORT}`,
  grpc.credentials.createInsecure()
);

function retrieveIpPort(leaderId) {
  IP = clusterInfo?.[leaderId]?.ip;
  PORT = clusterInfo?.[leaderId]?.port;
}

Array.prototype.sample = function () {
  return this[Math.floor(Math.random() * this.length)];
};

function requestServer(operation, key, value = "") {
  try {
    client.ServeClient(
      {
        request:
          operation.toLowercase() == "set"
            ? `SET ${key} ${value}`
            : `GET ${key}`,
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          if (!response?.success) {
            console.log(response?.data);
            if (response?.leaderId) {
              retrieveIpPort(lId);
              requestServer(operation, key, value);
            } else {
              lId = Object.keys(clusterInfo)?.sample();
              retrieveIpPort(lId);
              requestServer(operation, key, value);
            }
          } else {
            console.log(response?.data);
          }
        }
      }
    );
  } catch (err) {
    lId = Object.keys(clusterInfo)?.sample();
    retrieveIpPort(lId);
    requestServer(operation, key, value);
  }
}

requestServer("set", "a", "5");
requestServer("set", "b", "df");
requestServer("set", "c", "324");
requestServer("get", "a");
requestServer("get", "b");
requestServer("get", "c");
