require({cache:{
'JBrowse/Store/TabixIndexedFile':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/array',
           'JBrowse/Util',
           'JBrowse/Util/TextIterator',
           'JBrowse/Store/LRUCache',
           'JBrowse/Errors',
           'JBrowse/Model/XHRBlob',
           'JBrowse/Model/BGZip/BGZBlob',
           'JBrowse/Model/TabixIndex'
       ],
       function(
           declare,
           array,
           Util,
           TextIterator,
           LRUCache,
           Errors,
           XHRBlob,
           BGZBlob,
           TabixIndex
       ) {

return declare( null, {

    constructor: function( args ) {
        this.browser = args.browser;
        this.index = new TabixIndex({ blob: new BGZBlob( args.tbi ), browser: args.browser } );
        this.data  = new BGZBlob( args.file );
        this.indexLoaded = this.index.load();

        this.chunkSizeLimit = args.chunkSizeLimit || 2000000;
    },

    getLines: function( ref, min, max, itemCallback, finishCallback, errorCallback ) {
        var thisB = this;
        var args = Array.prototype.slice.call(arguments);
        this.indexLoaded.then(function() {
            thisB._fetch.apply( thisB, args );
        }, errorCallback);
    },

    _fetch: function( ref, min, max, itemCallback, finishCallback, errorCallback ) {
        errorCallback = errorCallback || function(e) { console.error(e, e.stack); };

        var chunks = this.index.blocksForRange( ref, min, max);
        if ( ! chunks ) {
            errorCallback('Error in index fetch ('+[ref,min,max].join(',')+')');
            return;
        }

        // toString function is used by the cache for making cache keys
        chunks.toString = chunks.toUniqueString = function() {
            return this.join(', ');
        };

        // check the chunks for any that are over the size limit.  if
        // any are, don't fetch any of them
        for( var i = 0; i<chunks.length; i++ ) {
            var size = chunks[i].fetchedSize();
            if( size > this.chunkSizeLimit ) {
                errorCallback( new Errors.DataOverflow('Too much data. Chunk size '+Util.commifyNumber(size)+' bytes exceeds chunkSizeLimit of '+Util.commifyNumber(this.chunkSizeLimit)+'.' ) );
                return;
            }
        }

        var fetchError;
        try {
            this._fetchChunkData(
                chunks,
                ref,
                min,
                max,
                itemCallback,
                finishCallback,
                errorCallback
            );
        } catch( e ) {
            errorCallback( e );
        }
    },

    _fetchChunkData: function( chunks, ref, min, max, itemCallback, endCallback, errorCallback ) {
        var thisB = this;

        if( ! chunks.length ) {
            endCallback();
            return;
        }

        var allItems = [];
        var chunksProcessed = 0;

        var cache = this.chunkCache = this.chunkCache || new LRUCache({
            name: 'TabixIndexedFileChunkedCache',
            fillCallback: dojo.hitch( this, '_readChunkItems' ),
            sizeFunction: function( chunkItems ) {
                return chunkItems.length;
            },
            maxSize: 100000 // cache up to 100,000 items
        });

        var regRef = this.browser.regularizeReferenceName( ref );

        var haveError;
        array.forEach( chunks, function( c ) {
            cache.get( c, function( chunkItems, e ) {
                if( e && !haveError )
                    errorCallback( e );
                if(( haveError = haveError || e )) {
                    return;
                }

                for( var i = 0; i< chunkItems.length; i++ ) {
                    var item = chunkItems[i];
                    if( item._regularizedRef == regRef ) {
                        // on the right ref seq
                        if( item.start > max ) // past end of range, can stop iterating
                            break;
                        else if( item.end >= min ) // must be in range
                            itemCallback( item );
                    }
                }
                if( ++chunksProcessed == chunks.length ) {
                    endCallback();
                }
            });
        });
    },

    _readChunkItems: function( chunk, callback ) {
        var thisB = this;
        var items = [];

        thisB.data.read(chunk.minv.block, chunk.maxv.block - chunk.minv.block + 1, function( data ) {
            data = new Uint8Array(data);
            //console.log( 'reading chunk %d compressed, %d uncompressed', chunk.maxv.block-chunk.minv.block+65536, data.length );
            var lineIterator = new TextIterator.FromBytes({ bytes: data, offset: 0 });
            try {
                thisB._parseItems(
                    lineIterator,
                    function(i) { items.push(i); },
                    function() { callback(items); }
                );
            } catch( e ) {
                callback( null, e );
            }
        },
        function(e) {
            callback( null, e );
        });
    },

    _parseItems: function( lineIterator, itemCallback, finishCallback ) {
        var that = this;
        var itemCount = 0;

        var maxItemsWithoutYielding = 300;
        while ( true ) {
            // if we've read no more than a certain number of items this cycle, read another one
            if( itemCount <= maxItemsWithoutYielding ) {
                var item = this.parseItem( lineIterator );
                if( item ) {
                    itemCallback( item );
                    itemCount++;
                }
                else {
                    finishCallback();
                    return;
                }
            }
            // if we're not done but we've read a good chunk of
            // items, schedule the rest of our work in a timeout to continue
            // later, avoiding blocking any UI stuff that needs to be done
            else {
                window.setTimeout( function() {
                    that._parseItems( lineIterator, itemCallback, finishCallback );
                }, 1);
                return;
            }
        }
    },

    parseItem: function( iterator ) {
        var metaChar = this.index.metaChar;
        var line, item;
        do {
            line = iterator.getline();
        } while( line && (    line.charAt(0) == metaChar // meta line, skip
                           || line.charAt( line.length - 1 ) != "\n" // no newline at the end, incomplete
                           || ! ( item = this.tryParseLine( line ) )   // line could not be parsed
                         )
               );

        if( line && item )
            return item;

        return null;
    },

    tryParseLine: function( line ) {
        try {
            return this.parseLine( line );
        } catch(e) {
            //console.warn('parse failed: "'+line+'"');
            return null;
        }
    },

    parseLine: function( line ) {
        var fields = line.split( "\t" );
        fields[fields.length-1] = fields[fields.length-1].replace(/\n$/,''); // trim off the newline
        var item = { // note: index column numbers are 1-based
            ref:   fields[this.index.columnNumbers.ref-1],
            _regularizedRef: this.browser.regularizeReferenceName( fields[this.index.columnNumbers.ref-1] ),
            start: parseInt(fields[this.index.columnNumbers.start-1]),
            end:   parseInt(fields[this.index.columnNumbers.end-1]),
            fields: fields
        };
        return item;
    }

});
});

},
'JBrowse/Model/BGZip/BGZBlob':function(){
/**
 * File blob in Heng Li's `bgzip` format.
 */
define( [
            'dojo/_base/declare',
            'jszlib/inflate',
            'jszlib/arrayCopy'
        ],
        function(
            declare,
            inflate,
            arrayCopy
        ) {

var BGZBlob = declare( null,
{
    constructor: function( blob ) {
        this.blob = blob;
    },

    blockSize: 1<<16,

    slice: function(s, l) {
        return new BGZBlob( this.blob.slice( s, l ) );
    },

    fetch: function( callback, failCallback ) {
        this.blob.fetch(
            this._wrap( callback ),
            failCallback
        );
    },

    read: function( offset, length, callback, failCallback ) {
        this.blob.read( offset,
                        length + this.blockSize, //< need to over-fetch by a whole block size
                        this._wrap( callback, length ),
                        failCallback
                      );
    },

    _wrap: function( callback, maxLen ) {
        var thisB = this;
        return function( bgzData ) {
            callback( thisB.unbgzf( bgzData, maxLen ) );
        };
    },

    readInt: function(ba, offset) {
        return (ba[offset + 3] << 24) | (ba[offset + 2] << 16) | (ba[offset + 1] << 8) | (ba[offset]);
    },

    readShort: function(ba, offset) {
        return (ba[offset + 1] << 8) | (ba[offset]);
    },

    readFloat: function(ba, offset) {
        var temp = new Uint8Array( 4 );
        for( var i = 0; i<4; i++ ) {
            temp[i] = ba[offset+i];
        }
        var fa = new Float32Array( temp.buffer );
        return fa[0];
    },

    unbgzf: function(data, lim) {
        lim = Math.min( lim || Infinity, data.byteLength - 27);
        var oBlockList = [];
        var totalSize = 0;

        for( var ptr = [0]; ptr[0] < lim; ptr[0] += 8) {

            var ba = new Uint8Array( data, ptr[0], 18 );

            // check the bgzf block magic
            if( !( ba[0] == 31 && ba[1] == 139 ) ) {
                console.error( 'invalid BGZF block header, skipping', ba );
                break;
            }

            var xlen = this.readShort( ba, 10 );
            var compressedDataOffset = ptr[0] + 12 + xlen;

            // var inPtr = ptr[0];
            // var bSize = Utils.readShort( ba, 16 );
            // var logLength = Math.min(data.byteLength-ptr[0], 40);
            // console.log( xlen, bSize, bSize - xlen - 19, new Uint8Array( data, ptr[0], logLength ), logLength );

            var unc;
            try {
                unc = inflate(
                    data,
                    compressedDataOffset,
                    data.byteLength - compressedDataOffset,
                    ptr
                );
            } catch( inflateError ) {
                // if we have a buffer error and we have already
                // inflated some data, there is probably just an
                // incomplete BGZF block at the end of the data, so
                // ignore it and stop inflating
                if( /^Z_BUF_ERROR/.test(inflateError.statusString) && oBlockList.length ) {
                    break;
                }
                // otherwise it's some other kind of real error
                else {
                    throw inflateError;
                }
            }
            if( unc.byteLength ) {
                totalSize += unc.byteLength;
                oBlockList.push( unc );
            }
            // else {
            //     console.error( 'BGZF decompression failed for block ', compressedDataOffset, data.byteLength-compressedDataOffset, [inPtr] );
            // }
        }

        if (oBlockList.length == 1) {
            return oBlockList[0];
        } else {
            var out = new Uint8Array(totalSize);
            var cursor = 0;
            for (var i = 0; i < oBlockList.length; ++i) {
                var b = new Uint8Array(oBlockList[i]);
                arrayCopy(b, 0, out, cursor, b.length);
                cursor += b.length;
            }
            return out.buffer;
        }
    }



});

return BGZBlob;
});
},
'JBrowse/Model/TabixIndex':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/array',
           'dojo/_base/Deferred',
           'JBrowse/has',
           'jDataView',
           'JBrowse/Util',
           'JBrowse/Model/BGZip/VirtualOffset'
       ],
       function(
           declare,
           array,
           Deferred,
           has,
           jDataView,
           Util,
           VirtualOffset
       ) {

// inner class representing a chunk
var Chunk = Util.fastDeclare({
    constructor: function(minv,maxv,bin) {
        this.minv = minv;
        this.maxv = maxv;
        this.bin = bin;
    },
    toUniqueString: function() {
        return this.minv+'..'+this.maxv+' (bin '+this.bin+')';
    },
    toString: function() {
        return this.toUniqueString();
    },
    compareTo: function( b ) {
        return this.minv.compareTo(b.minv) || this.maxv.compareTo(b.maxv) || this.bin - b.bin;
    },
    compare: function( b ) {
        return this.compareTo( b );
    },
    fetchedSize: function() {
        return this.maxv.block + (1<<16) - this.minv.block + 1;
    }
});

return declare( null, {

   constructor: function( args ) {
       this.browser = args.browser;
       this.blob = args.blob;
       this.load();
   },

   load: function() {
       var thisB = this;
       return this._loaded = this._loaded || function() {
           var d = new Deferred();
           if( ! has('typed-arrays') )
               d.reject( 'This web browser lacks support for JavaScript typed arrays.' );
           else
               this.blob.fetch( function( data) {
                                    thisB._parseIndex( data, d );
                                }, dojo.hitch( d, 'reject' ) );
           return d;
       }.call(this);
   },

   // fetch and parse the index
   _parseIndex: function( bytes, deferred ) {

       this._littleEndian = true;
       var data = new jDataView( bytes, 0, undefined, this._littleEndian );

       // check TBI magic numbers
       if( data.getInt32() != 21578324 /* "TBI\1" */) {
           // try the other endianness if no magic
           this._littleEndian = false;
           data = new jDataView( bytes, 0, undefined, this._littleEndian );
           if( data.getInt32() != 21578324 /* "TBI\1" */) {
               console.error('Not a TBI file');
               deferred.reject('Not a TBI file');
               return;
           }
       }

       // number of reference sequences in the index
       var refCount = data.getInt32();
       this.presetType = data.getInt32();
       this.columnNumbers = {
           ref:   data.getInt32(),
           start: data.getInt32(),
           end:   data.getInt32()
       };
       this.metaValue = data.getInt32();
       this.metaChar = this.metaValue ? String.fromCharCode( this.metaValue ) : null;
       this.skipLines = data.getInt32();

       // read sequence dictionary
       this._refIDToName = new Array( refCount );
       this._refNameToID = {};
       var nameSectionLength = data.getInt32();
       this._parseNameBytes( data.getBytes( nameSectionLength, undefined, false ) );

       // read the per-reference-sequence indexes
       this._indices = new Array( refCount );
       for (var i = 0; i < refCount; ++i) {
           // the binning index
           var binCount = data.getInt32();
           var idx = this._indices[i] = { binIndex: {} };
           for (var j = 0; j < binCount; ++j) {
               var bin        = data.getInt32();
               var chunkCount = data.getInt32();
               var chunks = new Array( chunkCount );
               for (var k = 0; k < chunkCount; ++k) {
                   var u = new VirtualOffset( data.getBytes(8) );
                   var v = new VirtualOffset( data.getBytes(8) );
                   this._findFirstData( u );
                   chunks[k] = new Chunk( u, v, bin );
               }
               idx.binIndex[bin] = chunks;
           }
           // the linear index
           var linearCount = data.getInt32();
           var linear = idx.linearIndex = new Array( linearCount );
           for (var k = 0; k < linearCount; ++k) {
               linear[k] = new VirtualOffset( data.getBytes(8) );
               this._findFirstData( linear[k] );
           }
       }
       deferred.resolve({ success: true });
   },

   _findFirstData: function( virtualOffset ) {
       var fdl = this.firstDataLine;
       this.firstDataLine = fdl ? fdl.compareTo( virtualOffset ) > 0 ? virtualOffset
                                                                     : fdl
                                : virtualOffset;
   },

   _parseNameBytes: function( namesBytes ) {
       var offset = 0;

       function getChar() {
           var b = namesBytes[ offset++ ];
           return b ? String.fromCharCode( b ) : null;
       }

       function getString() {
           var c, s = '';
           while(( c = getChar() ))
               s += c;
           return s.length ? s : null;
       }

       var refName, refID = 0;
       for( ; refName = getString(); refID++ ) {
           this._refIDToName[refID] = refName;
           this._refNameToID[ this.browser.regularizeReferenceName( refName ) ] = refID;
       }
   },

    /**
     * Interrogate whether a store has data for a given reference
     * sequence.  Calls the given callback with either true or false.
     *
     * Implemented as a binary interrogation because some stores are
     * smart enough to regularize reference sequence names, while
     * others are not.
     */
    hasRefSeq: function( seqName, callback, errorCallback ) {
       var thisB = this;
       seqName = thisB.browser.regularizeReferenceName( seqName );
       thisB.load().then( function() {
           if( seqName in thisB._refNameToID ) {
               callback(true);
               return;
           }
           callback( false );
       });
   },

   getRefId: function( refName ) {
       refName = this.browser.regularizeReferenceName( refName );
       return this._refNameToID[refName];
   },

   TAD_LIDX_SHIFT: 14,

   blocksForRange: function( refName, beg, end ) {
       if( beg < 0 )
           beg = 0;

       var tid = this.getRefId( refName );
       var indexes = this._indices[tid];
       if( ! indexes )
           return [];

       var linearIndex = indexes.linearIndex,
            binIndex   = indexes.binIndex;

       var bins = this._reg2bins(beg, end);

       var min_off = linearIndex.length
           ? linearIndex[
                 ( beg >> this.TAD_LIDX_SHIFT >= linearIndex.length )
                     ?  linearIndex.length - 1
                     :  beg >> this.TAD_LIDX_SHIFT
               ]
           : new VirtualOffset( 0, 0 );

       var i, l, n_off = 0;
       for( i = 0; i < bins.length; ++i ) {
           n_off += ( binIndex[ bins[i] ] || [] ).length;
       }

       if( n_off == 0 )
           return [];

       var off = [];

       var chunks;
       for (i = n_off = 0; i < bins.length; ++i)
           if (( chunks = binIndex[ bins[i] ] ))
               for (var j = 0; j < chunks.length; ++j)
                   if( min_off.compareTo( chunks[j].maxv ) < 0 )
                       off[n_off++] = new Chunk( chunks[j].minv, chunks[j].maxv, chunks[j].bin );

       if( ! off.length )
           return [];

       off = off.sort( function(a,b) {
                           return a.compareTo(b);
                       });

       // resolve completely contained adjacent blocks
       for (i = 1, l = 0; i < n_off; ++i) {
           if( off[l].maxv.compareTo( off[i].maxv ) < 0 ) {
               ++l;
               off[l].minv = off[i].minv;
               off[l].maxv = off[i].maxv;
           }
       }
       n_off = l + 1;

       // resolve overlaps between adjacent blocks; this may happen due to the merge in indexing
       for (i = 1; i < n_off; ++i)
           if ( off[i-1].maxv.compareTo(off[i].minv) >= 0 )
               off[i-1].maxv = off[i].minv;
       // merge adjacent blocks
       for (i = 1, l = 0; i < n_off; ++i) {
           if( off[l].maxv.block == off[i].minv.block )
               off[l].maxv = off[i].maxv;
           else {
               ++l;
               off[l].minv = off[i].minv;
               off[l].maxv = off[i].maxv;
           }
       }
       n_off = l + 1;

       return off.slice( 0, n_off );
   },

    /* calculate bin given an alignment covering [beg,end) (zero-based, half-close-half-open) */
    _reg2bin: function(beg, end) {
        --end;
        if (beg>>14 == end>>14) return ((1<<15)-1)/7 + (beg>>14);
        if (beg>>17 == end>>17) return ((1<<12)-1)/7 + (beg>>17);
        if (beg>>20 == end>>20) return ((1<<9)-1)/7 + (beg>>20);
        if (beg>>23 == end>>23) return ((1<<6)-1)/7 + (beg>>23);
        if (beg>>26 == end>>26) return ((1<<3)-1)/7 + (beg>>26);
        return 0;
    },

    /* calculate the list of bins that may overlap with region [beg,end) (zero-based) */
    _reg2bins: function(beg, end) {
        var k, list = [];
        --end;
        list.push(0);
        for (k = 1 + (beg>>26); k <= 1 + (end>>26); ++k) list.push(k);
        for (k = 9 + (beg>>23); k <= 9 + (end>>23); ++k) list.push(k);
        for (k = 73 + (beg>>20); k <= 73 + (end>>20); ++k) list.push(k);
        for (k = 585 + (beg>>17); k <= 585 + (end>>17); ++k) list.push(k);
        for (k = 4681 + (beg>>14); k <= 4681 + (end>>14); ++k) list.push(k);
        return list;
    }

});
});

},
'jDataView/jdataview':function(){
define([], function() {
var scope = {};

//
// jDataView by Vjeux - Jan 2010
//
// A unique way to read a binary file in the browser
// http://github.com/vjeux/jDataView
// http://blog.vjeux.com/ <vjeuxx@gmail.com>
//

(function (global) {

var compatibility = {
	ArrayBuffer: typeof ArrayBuffer !== 'undefined',
	DataView: typeof DataView !== 'undefined' &&
		('getFloat64' in DataView.prototype ||				// Chrome
		 'getFloat64' in new DataView(new ArrayBuffer(1))), // Node
	// NodeJS Buffer in v0.5.5 and newer
	NodeBuffer: typeof Buffer !== 'undefined' && 'readInt16LE' in Buffer.prototype
};

var dataTypes = {
	'Int8': 1,
	'Int16': 2,
	'Int32': 4,
	'Uint8': 1,
	'Uint16': 2,
	'Uint32': 4,
	'Float32': 4,
	'Float64': 8
};

var nodeNaming = {
	'Int8': 'Int8',
	'Int16': 'Int16',
	'Int32': 'Int32',
	'Uint8': 'UInt8',
	'Uint16': 'UInt16',
	'Uint32': 'UInt32',
	'Float32': 'Float',
	'Float64': 'Double'
};

var jDataView = function (buffer, byteOffset, byteLength, littleEndian) {
	if (!(this instanceof jDataView)) {
		throw new Error("jDataView constructor may not be called as a function");
	}

	this.buffer = buffer;

	// Handle Type Errors
	if (!(compatibility.NodeBuffer && buffer instanceof Buffer) &&
		!(compatibility.ArrayBuffer && buffer instanceof ArrayBuffer) &&
		typeof buffer !== 'string') {
		throw new TypeError('jDataView buffer has an incompatible type');
	}

	// Check parameters and existing functionnalities
	this._isArrayBuffer = compatibility.ArrayBuffer && buffer instanceof ArrayBuffer;
	this._isDataView = compatibility.DataView && this._isArrayBuffer;
	this._isNodeBuffer = compatibility.NodeBuffer && buffer instanceof Buffer;

	// Default Values
	this._littleEndian = Boolean(littleEndian);

	var bufferLength = this._isArrayBuffer ? buffer.byteLength : buffer.length;
	if (byteOffset === undefined) {
		byteOffset = 0;
	}
	this.byteOffset = byteOffset;

	if (byteLength === undefined) {
		byteLength = bufferLength - byteOffset;
	}
	this.byteLength = byteLength;

	if (!this._isDataView) {
		// Do additional checks to simulate DataView
		if (typeof byteOffset !== 'number') {
			throw new TypeError('jDataView byteOffset is not a number');
		}
		if (typeof byteLength !== 'number') {
			throw new TypeError('jDataView byteLength is not a number');
		}
		if (byteOffset < 0) {
			throw new Error('jDataView byteOffset is negative');
		}
		if (byteLength < 0) {
			throw new Error('jDataView byteLength is negative');
		}
	}

	// Instanciate
	if (this._isDataView) {
		this._view = new DataView(buffer, byteOffset, byteLength);
		this._start = 0;
	}
	this._start = byteOffset;
	if (byteOffset + byteLength > bufferLength) {
		throw new Error("jDataView (byteOffset + byteLength) value is out of bounds");
	}

	this._offset = 0;

	// Create uniform reading methods (wrappers) for the following data types

	if (this._isDataView) { // DataView: we use the direct method
		for (var type in dataTypes) {
			if (!dataTypes.hasOwnProperty(type)) {
				continue;
			}
			(function(type, view){
				var size = dataTypes[type];
				view['get' + type] = function (byteOffset, littleEndian) {
					// Handle the lack of endianness
					if (littleEndian === undefined) {
						littleEndian = view._littleEndian;
					}

					// Handle the lack of byteOffset
					if (byteOffset === undefined) {
						byteOffset = view._offset;
					}

					// Move the internal offset forward
					view._offset = byteOffset + size;

					return view._view['get' + type](byteOffset, littleEndian);
				};
			})(type, this);
		}
	} else if (this._isNodeBuffer && compatibility.NodeBuffer) {
		for (var type in dataTypes) {
			if (!dataTypes.hasOwnProperty(type)) {
				continue;
			}

			var name;
			if (type === 'Int8' || type === 'Uint8') {
				name = 'read' + nodeNaming[type];
			} else if (littleEndian) {
				name = 'read' + nodeNaming[type] + 'LE';
			} else {
				name = 'read' + nodeNaming[type] + 'BE';
			}

			(function(type, view, name){
				var size = dataTypes[type];
				view['get' + type] = function (byteOffset, littleEndian) {
					// Handle the lack of endianness
					if (littleEndian === undefined) {
						littleEndian = view._littleEndian;
					}

					// Handle the lack of byteOffset
					if (byteOffset === undefined) {
						byteOffset = view._offset;
					}

					// Move the internal offset forward
					view._offset = byteOffset + size;

					return view.buffer[name](view._start + byteOffset);
				};
			})(type, this, name);
		}
	} else {
		for (var type in dataTypes) {
			if (!dataTypes.hasOwnProperty(type)) {
				continue;
			}
			(function(type, view){
				var size = dataTypes[type];
				view['get' + type] = function (byteOffset, littleEndian) {
					// Handle the lack of endianness
					if (littleEndian === undefined) {
						littleEndian = view._littleEndian;
					}

					// Handle the lack of byteOffset
					if (byteOffset === undefined) {
						byteOffset = view._offset;
					}

					// Move the internal offset forward
					view._offset = byteOffset + size;

					if (view._isArrayBuffer && (view._start + byteOffset) % size === 0 && (size === 1 || littleEndian)) {
						// ArrayBuffer: we use a typed array of size 1 if the alignment is good
						// ArrayBuffer does not support endianess flag (for size > 1)
						return new global[type + 'Array'](view.buffer, view._start + byteOffset, 1)[0];
					} else {
						// Error checking:
						if (typeof byteOffset !== 'number') {
							throw new TypeError('jDataView byteOffset is not a number');
						}
						if (byteOffset + size > view.byteLength) {
							throw new Error('jDataView (byteOffset + size) value is out of bounds');
						}

						return view['_get' + type](view._start + byteOffset, littleEndian);
					}
				};
			})(type, this);
		}
	}
};

if (compatibility.NodeBuffer) {
	jDataView.createBuffer = function () {
		return new Buffer(arguments);
	};
} else if (compatibility.ArrayBuffer) {
	jDataView.createBuffer = function () {
		return new Uint8Array(arguments).buffer;
	};
} else {
	jDataView.createBuffer = function () {
		return String.fromCharCode.apply(null, arguments);
	};
}

jDataView.prototype = {
	compatibility: compatibility,

	// Helpers

	_getBytes: function (length, byteOffset, littleEndian) {
		var result;

		// Handle the lack of endianness
		if (littleEndian === undefined) {
			littleEndian = this._littleEndian;
		}

		// Handle the lack of byteOffset
		if (byteOffset === undefined) {
			byteOffset = this._offset;
		}

		// Error Checking
		if (typeof byteOffset !== 'number') {
			throw new TypeError('jDataView byteOffset is not a number');
		}
		if (length < 0 || byteOffset + length > this.byteLength) {
			throw new Error('jDataView length or (byteOffset+length) value is out of bounds');
		}

		byteOffset += this._start;

		if (this._isArrayBuffer) {
			result = new Uint8Array(this.buffer, byteOffset, length);
		}
		else {
			result = this.buffer.slice(byteOffset, byteOffset + length);

			if (!this._isNodeBuffer) {
				result = Array.prototype.map.call(result, function (ch) {
					return ch.charCodeAt(0) & 0xff;
				});
			}
		}

		if (littleEndian && length > 1) {
			if (!(result instanceof Array)) {
				result = Array.prototype.slice.call(result);
			}

			result.reverse();
		}

		this._offset = byteOffset - this._start + length;

		return result;
	},

	// wrapper for external calls (do not return inner buffer directly to prevent it's modifying)
	getBytes: function (length, byteOffset, littleEndian) {
		var result = this._getBytes.apply(this, arguments);

		if (!(result instanceof Array)) {
			result = Array.prototype.slice.call(result);
		}

		return result;
	},

	getString: function (length, byteOffset) {
		var value;

		if (this._isNodeBuffer) {
			// Handle the lack of byteOffset
			if (byteOffset === undefined) {
				byteOffset = this._offset;
			}

			// Error Checking
			if (typeof byteOffset !== 'number') {
				throw new TypeError('jDataView byteOffset is not a number');
			}
			if (length < 0 || byteOffset + length > this.byteLength) {
				throw new Error('jDataView length or (byteOffset+length) value is out of bounds');
			}

			value = this.buffer.toString('ascii', this._start + byteOffset, this._start + byteOffset + length);
			this._offset = byteOffset + length;
		}
		else {
			value = String.fromCharCode.apply(null, this._getBytes(length, byteOffset, false));
		}

		return value;
	},

	getChar: function (byteOffset) {
		return this.getString(1, byteOffset);
	},

	tell: function () {
		return this._offset;
	},

	seek: function (byteOffset) {
		if (typeof byteOffset !== 'number') {
			throw new TypeError('jDataView byteOffset is not a number');
		}
		if (byteOffset < 0 || byteOffset > this.byteLength) {
			throw new Error('jDataView byteOffset value is out of bounds');
		}

		return this._offset = byteOffset;
	},

	// Compatibility functions on a String Buffer

	_getFloat64: function (byteOffset, littleEndian) {
		var b = this._getBytes(8, byteOffset, littleEndian),

			sign = 1 - (2 * (b[0] >> 7)),
			exponent = ((((b[0] << 1) & 0xff) << 3) | (b[1] >> 4)) - (Math.pow(2, 10) - 1),

		// Binary operators such as | and << operate on 32 bit values, using + and Math.pow(2) instead
			mantissa = ((b[1] & 0x0f) * Math.pow(2, 48)) + (b[2] * Math.pow(2, 40)) + (b[3] * Math.pow(2, 32)) +
						(b[4] * Math.pow(2, 24)) + (b[5] * Math.pow(2, 16)) + (b[6] * Math.pow(2, 8)) + b[7];

		if (exponent === 1024) {
			if (mantissa !== 0) {
				return NaN;
			} else {
				return sign * Infinity;
			}
		}

		if (exponent === -1023) { // Denormalized
			return sign * mantissa * Math.pow(2, -1022 - 52);
		}

		return sign * (1 + mantissa * Math.pow(2, -52)) * Math.pow(2, exponent);
	},

	_getFloat32: function (byteOffset, littleEndian) {
		var b = this._getBytes(4, byteOffset, littleEndian),

			sign = 1 - (2 * (b[0] >> 7)),
			exponent = (((b[0] << 1) & 0xff) | (b[1] >> 7)) - 127,
			mantissa = ((b[1] & 0x7f) << 16) | (b[2] << 8) | b[3];

		if (exponent === 128) {
			if (mantissa !== 0) {
				return NaN;
			} else {
				return sign * Infinity;
			}
		}

		if (exponent === -127) { // Denormalized
			return sign * mantissa * Math.pow(2, -126 - 23);
		}

		return sign * (1 + mantissa * Math.pow(2, -23)) * Math.pow(2, exponent);
	},

	_getInt32: function (byteOffset, littleEndian) {
		var b = this._getUint32(byteOffset, littleEndian);
		return b > Math.pow(2, 31) - 1 ? b - Math.pow(2, 32) : b;
	},

	_getUint32: function (byteOffset, littleEndian) {
		var b = this._getBytes(4, byteOffset, littleEndian);
		return (b[0] * Math.pow(2, 24)) + (b[1] << 16) + (b[2] << 8) + b[3];
	},

	_getInt16: function (byteOffset, littleEndian) {
		var b = this._getUint16(byteOffset, littleEndian);
		return b > Math.pow(2, 15) - 1 ? b - Math.pow(2, 16) : b;
	},

	_getUint16: function (byteOffset, littleEndian) {
		var b = this._getBytes(2, byteOffset, littleEndian);
		return (b[0] << 8) + b[1];
	},

	_getInt8: function (byteOffset) {
		var b = this._getUint8(byteOffset);
		return b > Math.pow(2, 7) - 1 ? b - Math.pow(2, 8) : b;
	},

	_getUint8: function (byteOffset) {
		return this._getBytes(1, byteOffset)[0];
	}
};

if (typeof jQuery !== 'undefined' && jQuery.fn.jquery >= "1.6.2") {
	var convertResponseBodyToText = function (byteArray) {
		// http://jsperf.com/vbscript-binary-download/6
		var scrambledStr;
		try {
			scrambledStr = IEBinaryToArray_ByteStr(byteArray);
		} catch (e) {
			// http://stackoverflow.com/questions/1919972/how-do-i-access-xhr-responsebody-for-binary-data-from-javascript-in-ie
			// http://miskun.com/javascript/internet-explorer-and-binary-files-data-access/
			var IEBinaryToArray_ByteStr_Script =
				"Function IEBinaryToArray_ByteStr(Binary)\r\n"+
				"	IEBinaryToArray_ByteStr = CStr(Binary)\r\n"+
				"End Function\r\n"+
				"Function IEBinaryToArray_ByteStr_Last(Binary)\r\n"+
				"	Dim lastIndex\r\n"+
				"	lastIndex = LenB(Binary)\r\n"+
				"	if lastIndex mod 2 Then\r\n"+
				"		IEBinaryToArray_ByteStr_Last = AscB( MidB( Binary, lastIndex, 1 ) )\r\n"+
				"	Else\r\n"+
				"		IEBinaryToArray_ByteStr_Last = -1\r\n"+
				"	End If\r\n"+
				"End Function\r\n";

			// http://msdn.microsoft.com/en-us/library/ms536420(v=vs.85).aspx
			// proprietary IE function
			window.execScript(IEBinaryToArray_ByteStr_Script, 'vbscript');

			scrambledStr = IEBinaryToArray_ByteStr(byteArray);
		}

		var lastChr = IEBinaryToArray_ByteStr_Last(byteArray),
		result = "",
		i = 0,
		l = scrambledStr.length % 8,
		thischar;
		while (i < l) {
			thischar = scrambledStr.charCodeAt(i++);
			result += String.fromCharCode(thischar & 0xff, thischar >> 8);
		}
		l = scrambledStr.length;
		while (i < l) {
			result += String.fromCharCode(
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8,
				(thischar = scrambledStr.charCodeAt(i++), thischar & 0xff), thischar >> 8);
		}
		if (lastChr > -1) {
			result += String.fromCharCode(lastChr);
		}
		return result;
	};

	jQuery.ajaxSetup({
		converters: {
			'* dataview': function(data) {
				return new jDataView(data);
			}
		},
		accepts: {
			dataview: "text/plain; charset=x-user-defined"
		},
		responseHandler: {
			dataview: function (responses, options, xhr) {
				// Array Buffer Firefox
				if ('mozResponseArrayBuffer' in xhr) {
					responses.text = xhr.mozResponseArrayBuffer;
				}
				// Array Buffer Chrome
				else if ('responseType' in xhr && xhr.responseType === 'arraybuffer' && xhr.response) {
					responses.text = xhr.response;
				}
				// Internet Explorer (Byte array accessible through VBScript -- convert to text)
				else if ('responseBody' in xhr) {
					responses.text = convertResponseBodyToText(xhr.responseBody);
				}
				// Older Browsers
				else {
					responses.text = xhr.responseText;
				}
			}
		}
	});

	jQuery.ajaxPrefilter('dataview', function(options, originalOptions, jqXHR) {
		// trying to set the responseType on IE 6 causes an error
		if (jQuery.support.ajaxResponseType) {
			if (!options.hasOwnProperty('xhrFields')) {
				options.xhrFields = {};
			}
			options.xhrFields.responseType = 'arraybuffer';
		}
		options.mimeType = 'text/plain; charset=x-user-defined';
	});
}

global.jDataView = (global.module || {}).exports = jDataView;
if (typeof module !== 'undefined') {
	module.exports = jDataView;
}

})(scope);

return scope.jDataView;
});
},
'JBrowse/Model/BGZip/VirtualOffset':function(){
/**
 * a virtual offset into a bgzipped file
 */
define([
         'JBrowse/Util'
       ],
       function( Util ) {

var VirtualOffset = Util.fastDeclare({
    constructor: function(b, o) {
        if( arguments.length >= 2 ) {
            this.block  = b;
            this.offset = o;
        }
        else {
            this._fromBytes( b );
        }
    },

    _fromBytes: function( ba, offset ) {
        offset = offset || 0;

        //console.log( 'readVob', offset );
        var block =
              ba[offset  ] * 0x10000000000
            + ba[offset+1] * 0x100000000
            + ba[offset+2] * 0x1000000
            + ba[offset+3] * 0x10000
            + ba[offset+4] * 0x100
            + ba[offset+5];
        var bint = (ba[offset+6] << 8) | ba[offset+7];
        if (block == 0 && bint == 0) {
            this.block = this.offset = null;
        } else {
            this.block = block;
            this.offset = bint;
        }
    },
    toString: function() {
        return '' + this.block + ':' + this.offset;
    },
    compareTo: function(b) {
        return this.block - b.block || this.offset - b.offset;
    },
    cmp: function(b) {
        return this.compareTo( b );
    }
});

return VirtualOffset;

});
},
'JBrowse/Store/SeqFeature/GlobalStatsEstimationMixin':function(){
/**
 * Mixin that adds _estimateGlobalStats method to a store, which
 * samples a section of the features in the store and uses those to
 * esimate the statistics of the whole data set.
 */

define([
           'dojo/_base/declare',
           'dojo/_base/array',
           'dojo/Deferred',
           'JBrowse/Errors'
       ],
       function( declare, array, Deferred, Errors ) {

return declare( null, {

    /**
     * Fetch a region of the current reference sequence and use it to
     * estimate the feature density of the store.
     * @private
     */
    _estimateGlobalStats: function( refseq ) {
        var deferred = new Deferred();

        refseq = refseq || this.refSeq;
        var timeout = this.storeTimeout || 3000;

        var startTime = new Date();

        var statsFromInterval = function( length, callback ) {
            var thisB = this;
            var sampleCenter = refseq.start*0.75 + refseq.end*0.25;
            var start = Math.max( 0, Math.round( sampleCenter - length/2 ) );
            var end = Math.min( Math.round( sampleCenter + length/2 ), refseq.end );
            var features = [];
            this._getFeatures({ ref: refseq.name, start: start, end: end},
                              function( f ) { features.push(f); },
                              function( error ) {
                                  features = array.filter( features, function(f) { return f.get('start') >= start && f.get('end') <= end; } );
                                  callback.call( thisB, length,
                                                 {
                                                     featureDensity: features.length / length,
                                                     _statsSampleFeatures: features.length,
                                                     _statsSampleInterval: { ref: refseq.name, start: start, end: end, length: length }
                                                 });
                              },
                              function( error ) {
                                      callback.call( thisB, length,  null, error );
                              });
        };

        var maybeRecordStats = function( interval, stats, error ) {
            if( error ) {
                if( error.isInstanceOf(Errors.DataOverflow) ) {
                     console.log( 'Store statistics found chunkSizeLimit error, using empty: '+(this.source||this.name) );
                     deferred.resolve( { featureDensity: 0, error: 'global stats estimation found chunkSizeError' } );
                }
                else {
                    deferred.reject( error );
                }
            } else {
                 var refLen = refseq.end - refseq.start;
                 if( stats._statsSampleFeatures >= 300 || interval * 2 > refLen || error ) {
                     console.log( 'Store statistics: '+(this.source||this.name), stats );
                     deferred.resolve( stats );
                 } else if( ((new Date()) - startTime) < timeout ) {
                     statsFromInterval.call( this, interval * 2, maybeRecordStats );
                 } else {
                     console.log( 'Store statistics timed out: '+(this.source||this.name) );
                     deferred.resolve( { featureDensity: 0, error: 'global stats estimation timed out' } );
                 }
            }
        };

        statsFromInterval.call( this, 100, maybeRecordStats );
        return deferred;
    }

});
});

},
'JBrowse/Store/SeqFeature/BED/Parser':function(){
/* The function to parse the bed files. The standard BED file format (BED-6) is "chr\tstart(0based)\tEnd(1based)\tname\tscore\tstrand

BED-3 is the minimal parsed line by this parser (i.e. includes only first three fields)
Optional header lines start with '#'
*/
define( [
            'dojo/_base/declare',
            'dojo/_base/array',
            'dojo/_base/lang',
            'JBrowse/Util/TextIterator',
            'JBrowse/Util/GFF3'
        ],
        function (
            declare,
            array,
            lang,
            TextIterator,
            GFF3
        ) {


var bed_feature_names = 'seq_id start end name score strand'.split(" ");


return declare( null, {

    constructor: function( args ) {
        lang.mixin( this, {
                        featureCallback:   args.featureCallback || function() {},
                        endCallback:       args.endCallback || function() {},
                        commentCallback:   args.commentCallback || function() {},
                        errorCallback:     args.errorCallback || function(e) { console.error(e); },
                        store:             args.store,
                        // if this is true, the parser ignores the
                        // rest of the lines in the file.  currently
                        // set when the file switches over to FASTA
                        eof: false
                    });
    },


    /**
     * Parse the bytes that contain the BED header, storing the parsed
     * data in this.header.
     */
    parseHeader: function( headerBytes ) {

        // parse the header lines
        var headData = {};
        var lineIterator = new TextIterator.FromBytes({ bytes: headerBytes });
        var line;
        while(( line = lineIterator.getline() )) {

            // only interested in meta and header lines
            if( line[0] != '#' )
                continue;

            // parse meta line using the parseHeader configuration callback function
            var metaData = (this.config.parseHeader||function() {})(line);
            var key = metaData.key;
            headData[key] = metaData.value;
        }

        this.header = headData;
        return headData;
    },
    finish: function() {
        this.endCallback();
    },
    addLine: function( line ) {
        var match;
        if( this.eof ) {
            // do nothing
        } else if( /^\s*[^#\s>]/.test(line) ) { //< feature line, most common case
            line = line.replace( /\r?\n?$/g, '' );
            var f = this.parse_feature( line );
            this.featureCallback( this._return_item([f]) );
        }
        // directive or comment
        else if(( match = /^\s*(\#+)(.*)/.exec( line ) )) {
            var hashsigns = match[1], contents = match[2];
            contents = contents.replace(/\s*/,'');
            this._return_item({ comment: contents });
        }
        else if( /^\s*$/.test( line ) ) {
            // blank line, do nothing
        }
        else if( /^\s*>/.test(line) ) {
            // implicit beginning of a FASTA section.  just stop
            // parsing, since we don't currently handle sequences
            this._return_all_under_construction_features();
            this.eof = true;
        }
        else { // it's a parse error
            line = line.replace( /\r?\n?$/g, '' );
            throw "GFF3 parse error.  Cannot parse '"+line+"'.";
        }
    },

    parse_feature: function( line ) {
        var f = array.map( line.split("\t"), function(a) {
            if( a == '.' ) {
                return null;
            }
            return a;
        });

        // unescape only the ref and source columns
        f[0] = GFF3.unescape( f[0] );

        var parsed = {};
        for( var i = 0; i < bed_feature_names.length; i++ ) {
            if(f[i]) {
                parsed[ bed_feature_names[i] ] = f[i] == '.' ? null : f[i];
            }
        }
        if( parsed.start !== null )
            parsed.start = parseInt( parsed.start, 10 );
        if( parsed.end !== null )
            parsed.end = parseInt( parsed.end, 10 );
        if( parsed.score != null )
            parsed.score = parseFloat( parsed.score, 10 );

        parsed.strand = {'+':1,'-':-1}[parsed.strand] || 0;

        return parsed;
    },

    _return_item: function(i) {
        if( i[0] )
            this.featureCallback( i );
        else if( i.comment )
            this.commentCallback( i, this.store );
    }

});
});

},
'JBrowse/Util/GFF3':function(){
/**
 * Fast, low-level functions for parsing and formatting GFF3.
 * JavaScript port of Robert Buels's Bio::GFF3::LowLevel Perl module.
 */

define([
           'dojo/_base/array',
           'dojo/_base/lang'
       ],
       function(
           array,
           lang
       ) {
var gff3_field_names = 'seq_id source type start end score strand phase attributes'.split(' ');

return {

    parse_feature: function( line ) {
        var f = array.map( line.split("\t"), function(a) {
            if( a == '.' ) {
                return null;
            }
            return a;
        });

        // unescape only the ref and source columns
        f[0] = this.unescape( f[0] );
        f[1] = this.unescape( f[1] );

        f[8] = this.parse_attributes( f[8] );
        var parsed = {};
        for( var i = 0; i < gff3_field_names.length; i++ ) {
            parsed[ gff3_field_names[i] ] = f[i] == '.' ? null : f[i];
        }
        if( parsed.start !== null )
            parsed.start = parseInt( parsed.start, 10 );
        if( parsed.end !== null )
            parsed.end = parseInt( parsed.end, 10 );
        if( parsed.score !== null )
            parsed.score = parseFloat( parsed.score, 10 );
        if( parsed.strand != null )
            parsed.strand = {'+':1,'-':-1}[parsed.strand] || 0;
        return parsed;
    },

    parse_directive: function( line ) {
        var match = /^\s*\#\#\s*(\S+)\s*(.*)/.exec( line );
        if( ! match )
            return null;
        var name = match[1], contents = match[2];

        var parsed = { directive : name };
        if( contents.length ) {
            contents = contents.replace( /\r?\n$/, '' );
            parsed.value = contents;
        }

        // do a little additional parsing for sequence-region and genome-build directives
        if( name == 'sequence-region' ) {
            var c = contents.split( /\s+/, 3 );
            parsed.seq_id = c[0];
            parsed.start  = c[1].replace(/\D/g,'');
            parsed.end    = c[2].replace(/\D/g,'');
        }
        else if( name == 'genome-build' ) {
            var c = contents.split( /\s+/, 2 );
            parsed.source    = c[0];
            parsed.buildname = c[1];
        }

        return parsed;
    },

    unescape: function( s ) {
        if( s === null )
            return null;

        return s.replace( /%([0-9A-Fa-f]{2})/g, function( match, seq ) {
                              return String.fromCharCode( parseInt( seq, 16 ) );
                          });
    },

    escape: function( s ) {
        return s.replace( /[\n\r\t;=%&,\x00-\x1f\x7f-\xff]/g, function( ch ) {
                              var hex = ch.charCodeAt(0).toString(16).toUpperCase();
                              if( hex.length < 2 ) // lol, apparently there's no native function for fixed-width hex output
                                  hex = '0'+hex;
                              return '%'+hex;
                          });
    },

    parse_attributes: function( attrString ) {

        if( !( attrString && attrString.length ) || attrString == '.' )
            return {};

        attrString = attrString.replace(/\r?\n$/, '' );

        var attrs = {};
        array.forEach( attrString.split(';'), function( a ) {
            var nv = a.split( '=', 2 );
            if( !( nv[1] && nv[1].length ) )
                return;
            var arec = attrs[ nv[0] ];
            if( ! arec )
                arec = attrs[ nv[0] ] = [];

            arec.push.apply(
                arec,
                array.map(
                    nv[1].split(','),
                    this.unescape
                ));
        },this);

        return attrs;
    },

    format_feature: function( f ) {
        var attrString =
            f.attributes === null || typeof f.attributes == 'undefined'
                ? '.' : this.format_attributes( f.attributes );

        var translate_strand=['-','.','+'];
        var fields = [];
        for( var i = 0; i<8; i++ ) {
            var val = f[ gff3_field_names[i] ];
            if(i==6) // deserialize strand
                fields[i] = val === null || val === undefined ? '.' : translate_strand[val+1];
            else
                fields[i] = val === null || val === undefined ? '.' : this.escape( ''+val );
        }
        fields[8] = attrString;

        return fields.join("\t")+"\n";
    },

    format_attributes: function( attrs ) {
        var attrOrder = [];
        for( var tag in attrs ) {
            var val = attrs[tag];
            var valstring = val.hasOwnProperty( 'toString' )
                                ? this.escape( val.toString() ) :
                            lang.isArray(val.values)
                                ? function(val) {
                                    return lang.isArray(val)
                                        ? array.map( val, this.escape ).join(',')
                                        : this.escape( val );
                                  }.call(this,val.values) :
                            lang.isArray(val)
                                ? array.map( val, this.escape ).join(',')
                                : this.escape( val );
            attrOrder.push( this.escape( tag )+'='+valstring);
        }
        return attrOrder.length ? attrOrder.join(';') : '.';
    }
};
});

}}});
define("JBrowse/Store/SeqFeature/BEDTabix", [
            'dojo/_base/declare',
            'dojo/_base/lang',
            'dojo/_base/array',
            'dojo/Deferred',
            'JBrowse/Store/SeqFeature',
            'JBrowse/Store/DeferredStatsMixin',
            'JBrowse/Store/DeferredFeaturesMixin',
            'JBrowse/Store/TabixIndexedFile',
            'JBrowse/Store/SeqFeature/GlobalStatsEstimationMixin',
            'JBrowse/Model/XHRBlob',
            'JBrowse/Model/SimpleFeature',
            './BED/Parser'
        ],
        function(
            declare,
            lang,
            array,
            Deferred,
            SeqFeatureStore,
            DeferredStatsMixin,
            DeferredFeaturesMixin,
            TabixIndexedFile,
            GlobalStatsEstimationMixin,
            XHRBlob,
            SimpleFeature,
            Parser
        ) {

return declare( [ SeqFeatureStore, DeferredStatsMixin, DeferredFeaturesMixin, GlobalStatsEstimationMixin, Parser ], {

    constructor: function( args ) {
        var thisB = this;

        var tbiBlob = args.tbi ||
            new XHRBlob(
                this.resolveUrl(
                    this.getConf('tbiUrlTemplate',[]) || this.getConf('urlTemplate',[])+'.tbi'
                )
            );

        var fileBlob = args.file ||
            new XHRBlob(
                this.resolveUrl( this.getConf('urlTemplate',[]) )
            );

        this.indexedData = new TabixIndexedFile(
            {
                tbi: tbiBlob,
                file: fileBlob,
                browser: this.browser,
                chunkSizeLimit: args.chunkSizeLimit || 1000000
            });

        this.parser = new Parser({
            commentCallback: (this.config.commentCallback || function(i) {  }),
            store: this
        });

        this.getHeader()
            .then( function( header ) {
                thisB._deferred.features.resolve({success:true});
                thisB._estimateGlobalStats()
                    .then(
                    function( stats ) {
                        thisB.globalStats = stats;
                        thisB._deferred.stats.resolve( stats );
                    },
                    lang.hitch( thisB, '_failAllDeferred' )
                );
            },
            lang.hitch( thisB, '_failAllDeferred' )
        );
    },


    /**fetch and parse the Header line */
    getHeader: function() {
        var thisB = this;
        return this._parsedHeader || ( this._parsedHeader = function() {
                var d = new Deferred();
                var reject = lang.hitch( d, 'reject' );

                thisB.indexedData.indexLoaded.then( function() {
                        var maxFetch = thisB.indexedData.index.firstDataLine
                            ? (thisB.indexedData.index.firstDataLine.block + thisB.indexedData.data.blockSize - 1) * 2
                            : null;

                        thisB.indexedData.data.read(
                            0,
                            maxFetch,
                            function( bytes ) {
                                thisB.parser.parseHeader( new Uint8Array( bytes ) );
                                d.resolve( thisB.header );
                            },
                            reject
                        );
                    },
                    reject
                );

                return d;
            }.call(this));
    },
    _getFeatures: function(query, featureCallback, finishCallback, errorCallback){
        var thisB = this;
        thisB.getHeader().then(function(){
            thisB.indexedData.getLines(
                query.ref || thisB.refSeq.name,
                query.start,
                query.end,
                function( line ) {
                    var f = thisB.lineToFeature(line);
                    thisB.config.featureCallback ?
                        featureCallback(thisB.config.featureCallback(f, thisB)) :
                        featureCallback(f);
                },
                finishCallback,
                errorCallback

            );
        }, errorCallback);
    },



    _featureData: function( data ) {
        var f = lang.mixin( {}, data );
        for( var a in data.matrix ) {
            f[ a.toLowerCase() ] = data.attributes[a].join(',');
        }

        return f;
    },
    _formatFeature: function( data ) {
        var f = new SimpleFeature({
            data: this._featureData( data ),
            id: data.seq_id + "_"+ data.start + "_" +data.end+ "_" + data.name
        });
        f._reg_seq_id = this.browser.regularizeReferenceName( data.seq_id );
        return f;
    },
    //read the line
    lineToFeature: function( line ){
        var fields = line.fields;
        for (var i = 0; i < fields.length; i++) {
            if(fields[i] == '.') {
                fields[i] = null;
            }
        }

        var featureData = {
            start:  line.start,
            end:    line.end,
            seq_id: line.ref,
            name:   fields[3],
            score:  fields[4] ? +fields[4] : null,
            strand: {'+':1,'-':-1}[fields[5]] || 0
        };

        var f = new SimpleFeature({
            id: fields.slice(0,5).join('/'),
            data: featureData,
            fields: fields
        });

        return f;
    },

    /**
     * Interrogate whether a store has data for a given reference
     * sequence.  Calls the given callback with either true or false.
     *
     * Implemented as a binary interrogation because some stores are
     * smart enough to regularize reference sequence names, while
     * others are not.
     */
    hasRefSeq: function( seqName, callback, errorCallback ) {
        return this.indexedData.index.hasRefSeq( seqName, callback, errorCallback );
    },

    saveStore: function() {
        return {
            urlTemplate: this.config.file.url,
            tbiUrlTemplate: this.config.tbi.url
        };
    }


});
});
