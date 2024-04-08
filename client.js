const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const leaderIndex = process.argv.indexOf("--leader");
const leaderAdd =
  leaderIndex !== -1 ? process.argv[leaderIndex + 1] : "0.0.0.0:2000";
let PORT = leaderAdd.split(":")?.[1];
let IP = leaderAdd.split(":")?.[0];
const readline = require("readline");
const PROTO_FILE = "./raft/raft.proto";
const packageDef = protoLoader.loadSync(path.resolve(__dirname, PROTO_FILE));
const grpcObj = grpc.loadPackageDefinition(packageDef);

const clusterInfo = {
  1: {
    port: "2000",
    ip: "34.121.134.182",
  },
  2: {
    port: "2001",
    ip: "34.72.28.96",
  },
  3: {
    port: "2002",
    ip: "34.72.14.89",
  },
  4: {
    port: "2003",
    ip: "34.29.99.93",
  },
  5: {
    port: "2004",
    ip: "34.66.6.91",
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
  client = new grpcObj.RaftService(
    `${IP}:${PORT}`,
    grpc.credentials.createInsecure()
  );
}

Array.prototype.sample = function () {
  return this[Math.floor(Math.random() * this.length)];
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});



async function requestServer(operation, key, value = "", count = 0) {
  try {
    client.ServeClient(
      {

        request:
         operation?.toLowerCase() == "set"
           ? `SET ${key} ${value}`
           : `GET ${key}`,
      },
      (err, response) => {
        if (err) {
          if (count > 10) {
            console.log("Exceeded Retry");
            return false;
          } else {
            setTimeout(()=>{
              lId = Object.keys(clusterInfo)?.sample();
              retrieveIpPort(lId);
              requestServer(operation, key, value, ++count);
            },[5000])
            
          }
          console.error("Error sending message:", err);
          return false;
        } else {
          if (!response?.success) {
            console.log(response?.data);
            if (response?.leaderId) {
              // retrieveIpPort(lId);
              requestServer(operation, key, value);
              return true;
            } else {
              lId = Object.keys(clusterInfo)?.sample();
              retrieveIpPort(lId);
              requestServer(operation, key, value);
            }
          } else {
            promptUser();
            console.log(response?.data);
          }
        }
      }
     
    );
  } catch (err) {
    // console.log(err);
    if (count > 10) {
      console.log("Exceeded Retry");
      return false;
    } else {
      setTimeout(()=>{
        lId = Object.keys(clusterInfo)?.sample();
        retrieveIpPort(lId);
        requestServer(operation, key, value, ++count);
      },[5000])
      
    }
  }
}

 function promptUser(){
  rl.question("Choose an option \n 1. Set Value, \n 2. Get Value \n 3.exit \n",
  (option) => {
    if (option.toLowerCase() == "1") {
      rl.question("Enter key: ", (key) => {
        rl.question("Enter value:", async (value) => {
          result = await requestServer("set",key,value);
        })
      })
      promptUser();
    }
    else if(option.toLowerCase() == "2") {
      rl.question("Enter key: ", async (key) => {
        result = await requestServer("get",key);
      })
      promptUser();
    }
    else{

    }
  })
}
promptUser();
// setTimeout(() => {
//   requestServer("set", "a", "5");
//   requestServer("set", "b", "df");
//   requestServer("set", "c", "324");
//   setTimeout(() => {
//     requestServer("get", "a");
//     requestServer("get", "b");
//     requestServer("get", "c");
//   },5000);
// }, 10000);
