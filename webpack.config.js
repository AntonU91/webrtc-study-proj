const webpack = require('webpack');

module.exports = {
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer"),
      "util": require.resolve("util"),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      global: 'global',
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};
