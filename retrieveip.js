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
  
  const retrieveNodeIp = (port) => {
    let nodeId = "";
    Object.entries(clusterInfo)?.forEach(([key, val]) => {
      if (val?.port == port) {
        nodeId = val?.ip;
      }
    });
    return nodeId;
  };
  
  module.exports = retrieveNodeIp;
  