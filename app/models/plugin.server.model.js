var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var PluginSchema = new Schema({
    name:	{
	    		type: String,
	 		required: true
	 	},

    version: 	{
			type:String
		},

    license: 	{
			type:String
		},

    description:{
			type: String,
			required: true
		},

    gmodProject:{
			type: String,
			required: true
		},

    author:	{
			type: String,
			required: true
		},

    location: 	{
			type:String,
			unique:true,
			required:true
		},
    
    added:      {
			type:Date,
			default:Date.now
		}
});

mongoose.model('Plugin', PluginSchema, 'plugins');
mongoose.model('Pending', PluginSchema,'pending');

