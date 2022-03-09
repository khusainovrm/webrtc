const path = require('path');

module.exports = {
  mode: 'production',
  entry: './build/main/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: './browser/webrtc.umd.js',
    library: {
      type: 'umd',
      name: 'webrtc',
    },
    globalObject: 'this',
  },
};
