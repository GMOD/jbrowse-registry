var MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: ["./js/app.js", "./css/main.scss"],
  output: {
    path: __dirname + "/build",
    filename: "app.js",
    publicPath: "/build",
  },
  module: {
    rules: [
      {
        test: /\.(png|gif|ttf|eot|svg|woff|woff2)(\?[a-z0-9]+)?$/,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
      {
        test: /\.(png|gif|ttf|eot|svg|woff|woff2)(\?[a-z0-9=]+)?$/,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
      {
        test: /\.scss$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin()
  ],
};
