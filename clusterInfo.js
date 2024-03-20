const clusterInfo = {
  1: {
    port: "2000",
    ip: "0.0.0.0"
  },
  2: {
    port: "2001",
    ip: "0.0.0.0"
  },
  3: {
    port: "2002",
    ip: "0.0.0.0"
  }
  // 4: {
  //   port: "2003",
  //   ip: "0.0.0.0",
  // },
  // 5: {
  //   port: "2004",
  //   ip: "0.0.0.0",
  // },
};

const retrieveNodeId = (port) => {
  let nodeId = "";
  Object.entries(clusterInfo)?.forEach(([key, val]) => {
    if (val?.port == port) {
      nodeId = key;
    }
  });
  return nodeId;
};

module.exports = retrieveNodeId;
