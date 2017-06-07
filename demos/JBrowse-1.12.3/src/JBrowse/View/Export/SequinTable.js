/**
 * Support for Sequin Feature table export.  See
 * http://www.ncbi.nlm.nih.gov/Sequin/table.html.
 */

define("JBrowse/View/Export/SequinTable", [ 'dojo/_base/declare',
         'dojo/_base/array',
         'JBrowse/View/Export'
       ],
       function( declare, array, ExportBase ) {

return declare( ExportBase,

{
    /**
     * Data export driver for BED format.
     * @constructs
     */
    // constructor: function( args ) {
    // },

    /**
     * print the BED track definition line
     * @private
     */
    _printHeader: function( feature ) {
        // print the BED header
        this.print( '>Feature '+(feature.get('seq_id') || this.refSeq.name)+"\n" );
        return true;
    },

    /**
     * Format a feature into a string.
     * @param {Object} feature feature object (like those returned from JBrowse/Store/SeqFeature/*)
     * @returns {String} BED string representation of the feature
     */
    formatFeature: function( feature ) {
        var thisB = this;
        if( ! this.headerPrinted )
            this.headerPrinted = this._printHeader( feature );

        var featLine = [ feature.get('start')+1,
                         feature.get('end'),
                         feature.get('type') || 'region'
                       ];
        if( feature.get('strand') == -1 ) {
            var t = featLine[0];
            featLine[0] = featLine[1];
            featLine[1] = t;
        }

        // make the qualifiers
        var qualifiers = array.map(
            array.filter( feature.tags(), function(t) {
                              return ! { start: 1, end: 1, type: 1, strand: 1, seq_id: 1 }[ t.toLowerCase() ];
                          }),
            function( tag ) {
                return [ tag.toLowerCase(), thisB.stringifyAttributeValue( feature.get(tag) ) ];
            });

        return featLine.join("\t")+"\n" + array.map( qualifiers, function( q ) { return "\t\t\t"+q.join("\t")+"\n"; } ).join('');
    },

    stringifyAttributeValue: function( val ) {
        return val.hasOwnProperty( 'toString' )
                   ? val.toString() :
               val.values
                   ? function(val) {
                       return val instanceof Array
                           ? val.join(',')
                           : val;
                   }.call(this,val.values) :
               val instanceof Array
                   ? val.join(',')
                   : val;
    }
});
});