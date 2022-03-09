const path = require('path');

module.exports = {
  mode: 'production',
  entry: './build/main/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: './browser/budu-webrtc.umd.js',
    library: {
      type: 'umd',
      name: 'budu-webrtc',
    },
    globalObject: 'this',
  },
};
