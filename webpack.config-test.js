var nodeExternals = require('webpack-node-externals');

module.exports = {
  // in order to ignore built-in modules like path, fs, etc.
  target: 'node',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '']
  },
  module: {
    preLoaders: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'tslint-loader'
      }
    ],
    loaders: [
      {
        test: /\.ts$/,
        loader: 'ts-loader'
      }
    ]
  },
  // in order to ignore all modules in node_modules folder
  externals: [nodeExternals()],
  tslint: { configFile: './tslint-custom.json' }
};