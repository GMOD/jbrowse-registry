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
			{test: /node_modules.*\.json$/, loader: "json-loader"},
			{test: /\.html$/, loader: "html"},
			{test: /\.scss$/, loader: ExtractTextPlugin.extract(['css-loader', 'sass-loader'])},
		],
	},
	plugins: [
		new ExtractTextPlugin({ filename: "[name].css", allChunks: true }),
	],
};
