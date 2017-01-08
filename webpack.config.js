var ExtractTextPlugin = require("extract-text-webpack-plugin");

module.exports = {
	entry: ["./js/app.js", "./css/main.scss"],
	output: {
		path: __dirname + "/build",
		filename: "app.js",
		publicPath: "/build",
	},
	module: {
		loaders: [
			{test: /\.(png|gif|ttf|eot|svg|woff|woff2)(\?[a-z0-9]+)?$/, loader: "file-loader"},
			{test: /\.(png|gif|ttf|eot|svg|woff|woff2)(\?[a-z0-9=.]+)?$/, loader: "file-loader"},
			{test: /\.css$/, loader: "style!css"},
			{test: /\.html$/, loader: "html"},
			{test: /\.scss$/, loader: ExtractTextPlugin.extract("css!sass")},
		],
	},
	plugins: [
		new ExtractTextPlugin("[name].css", {
			allChunks: true,
		}),
	],
};
