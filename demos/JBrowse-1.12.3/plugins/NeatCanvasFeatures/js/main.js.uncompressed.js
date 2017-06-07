require({cache:{
'JBrowse/Plugin':function(){
define([
           'dojo/_base/declare',
           'JBrowse/Component'
       ],
       function( declare, Component ) {
return declare( Component,
{
    constructor: function( args ) {
        this.name = args.name;
        this.cssLoaded = args.cssLoaded;
        this._finalizeConfig( args.config );
    },

    _defaultConfig: function() {
        return {
            baseUrl: '/plugins/'+this.name
        };
    }
});
});
},
'JBrowse/View/FeatureGlyph/ProcessedTranscript':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/array',

           'dojox/color/Palette',

           'JBrowse/Model/SimpleFeature',
           'JBrowse/View/FeatureGlyph/Segments'
       ],
       function(
           declare,
           array,

           Palette,

           SimpleFeature,
           SegmentsGlyph
       ) {

return declare( SegmentsGlyph, {
_defaultConfig: function() {
    return this._mergeConfigs(
        this.inherited(arguments),
        {
            style: {
                utrColor: function( feature, variable, glyph, track ) {
                    return glyph._utrColor( glyph.getStyle( feature.parent(), 'color' ) ).toString();
                }
            },

            subParts: 'CDS, UTR, five_prime_UTR, three_prime_UTR',

            impliedUTRs: false,

            inferCdsParts: false
        });
},

_getSubparts: function( f ) {
    var c = f.children();
    if( ! c ) return [];

    if( c && this.config.inferCdsParts )
        c = this._makeCDSs( f, c );

    if( c && this.config.impliedUTRs )
        c = this._makeUTRs( f, c );

    var filtered = [];
    for( var i = 0; i<c.length; i++ )
        if( this._filterSubpart( c[i] ) )
            filtered.push( c[i] );

    return filtered;
},

_makeCDSs: function( parent, subparts ) {
    // infer CDS parts from exon coordinates

    var codeStart =  Infinity,
          codeEnd = -Infinity;

    var i;

    // gather exons, find coding start and end
    var type, codeIndices = [], exons = [];
    for( i = 0; i < subparts.length; i++ ) {
        type = subparts[i].get('type');
        if( /^cds/i.test( type ) ) {
            // if any CDSs parts are present already,
            // bail and return all subparts as-is
            if( /:CDS:/i.test( subparts[i].get('name') ) )
                return subparts;

            codeIndices.push(i);
            if( codeStart > subparts[i].get('start') )
                codeStart = subparts[i].get('start');
            if( codeEnd < subparts[i].get('end') )
                codeEnd = subparts[i].get('end');
        }
        else {
            if( /exon/i.test( type ) ) {
                exons.push( subparts[i] );
            }
        }
    }

    // splice out unspliced cds parts
    codeIndices.sort( function(a,b) { return b - a; } );
    for ( i = codeIndices.length - 1; i >= 0; i-- )
        subparts.splice(codeIndices[i], 1);

    // bail if we don't have exons and cds
    if( !( exons.length && codeStart < Infinity && codeEnd > -Infinity ) )
        return subparts;

    // make sure the exons are sorted by coord
    exons.sort( function(a,b) { return a.get('start') - b.get('start'); } );

    // iterate thru exons again, and calculate cds parts
    var strand = parent.get('strand');
    var codePartStart =  Infinity,
          codePartEnd = -Infinity;
    for ( i = 0; i < exons.length; i++ ) {
        var start = exons[i].get('start');
        var end = exons[i].get('end');

        // CDS containing exon
        if( codeStart >= start && codeEnd <= end ) {
            codePartStart = codeStart;
            codePartEnd = codeEnd;
        }
        // 5' terminal CDS part
        else if( codeStart >= start && codeStart < end ) {
            codePartStart = codeStart;
            codePartEnd = end;
        }
        // 3' terminal CDS part
        else if( codeEnd > start && codeEnd <= end ) {
            codePartStart = start;
            codePartEnd = codeEnd;
        }
        // internal CDS part
        else if( start < codeEnd && end > codeStart ) {
            codePartStart = start;
            codePartEnd = end;
        }

        // "splice in" the calculated cds part into subparts
        // at beginning of _makeCDSs() method, bail if cds subparts are encountered
        subparts.splice(i, 0, ( new SimpleFeature(
                    {   parent: parent,
                        data: {
                            start: codePartStart,
                            end: codePartEnd,
                            strand: strand,
                            type: 'CDS',
                            name: parent.get('uniqueID') + ":CDS:" + i
                        }})));
    }

    // make sure the subparts are sorted by coord
    subparts.sort( function(a,b) { return a.get('start') - b.get('start'); } );

    return subparts;
},

_makeUTRs: function( parent, subparts ) {
    // based on Lincoln's UTR-making code in Bio::Graphics::Glyph::processed_transcript

    var codeStart =  Infinity,
          codeEnd = -Infinity;

    var i;

    var haveLeftUTR, haveRightUTR;

    // gather exons, find coding start and end, and look for UTRs
    var type, exons = [];
    for( i = 0; i<subparts.length; i++ ) {
        type = subparts[i].get('type');
        if( /^cds/i.test( type ) ) {
            if( codeStart > subparts[i].get('start') )
                codeStart = subparts[i].get('start');
            if( codeEnd < subparts[i].get('end') )
                codeEnd = subparts[i].get('end');
        }
        else if( /exon/i.test( type ) ) {
            exons.push( subparts[i] );
        }
        else if( this._isUTR( subparts[i] ) ) {
            haveLeftUTR  = subparts[i].get('start') == parent.get('start');
            haveRightUTR = subparts[i].get('end')   == parent.get('end');
        }
    }

    // bail if we don't have exons and CDS
    if( !( exons.length && codeStart < Infinity && codeEnd > -Infinity ) )
        return subparts;

    // make sure the exons are sorted by coord
    exons.sort( function(a,b) { return a.get('start') - b.get('start'); } );

    var strand = parent.get('strand');

    // make the left-hand UTRs
    var start, end;
    if( ! haveLeftUTR )
        for (i=0; i<exons.length; i++) {
            start = exons[i].get('start');
            if ( start >= codeStart ) break;
            end = codeStart > exons[i].get('end') ? exons[i].get('end') : codeStart;

            subparts.unshift( new SimpleFeature(
                                  {   parent: parent,
                                      data: {
                                          start: start,
                                          end: end,
                                          strand: strand,
                                          type: strand >= 0 ? 'five_prime_UTR' : 'three_prime_UTR'
                                      }}));
        }

    // make the right-hand UTRs
    if( ! haveRightUTR )
        for (i=exons.length-1; i>=0; i--) {
            end = exons[i].get('end');
            if( end <= codeEnd ) break;

            start = codeEnd < exons[i].get('start') ? exons[i].get('start') : codeEnd;
            subparts.push( new SimpleFeature(
                               { parent: parent,
                                 data: {
                                     start: start,
                                     end: end,
                                     strand: strand,
                                     type: strand >= 0 ? 'three_prime_UTR' : 'five_prime_UTR'
                                 }}));
        }

    return subparts;
},

_utrColor: function( baseColor ) {
    return (this._palette || (this._palette = Palette.generate( baseColor, "splitComplementary"))).colors[1];
},

_isUTR: function( feature ) {
    return /(\bUTR|_UTR|untranslated[_\s]region)\b/.test( feature.get('type') || '' );
},

getStyle: function( feature, name ) {
    if( name == 'color' ) {
        if( this._isUTR( feature ) ) {
            return this.getStyle( feature, 'utrColor' );
        }
    }

    return this.inherited(arguments);
},

_getFeatureHeight: function( viewInfo, feature ) {
    var height = this.inherited( arguments );

    if( this._isUTR( feature ) )
        return height*0.65;

    return height;
}

});
});

},
'dojox/color/Palette':function(){
define(["dojo/_base/lang", "dojo/_base/array", "./_base"],
	function(lang, arr, dxc){

	/***************************************************************
	*	dojox.color.Palette
	*
	*	The Palette object is loosely based on the color palettes
	*	at Kuler (http://kuler.adobe.com).  They are 5 color palettes
	*	with the base color considered to be the third color in the
	*	palette (for generation purposes).
	*
	*	Palettes can be generated from well-known algorithms or they
	* 	can be manually created by passing an array to the constructor.
	*
	*	Palettes can be transformed, using a set of specific params
	*	similar to the way shapes can be transformed with dojox.gfx.
	*	However, unlike with transformations in dojox.gfx, transforming
	* 	a palette will return you a new Palette object, in effect
	* 	a clone of the original.
	***************************************************************/

	//	ctor ----------------------------------------------------------------------------
	dxc.Palette = function(/* String|Array|dojox.color.Color|dojox.color.Palette */base){
		// summary:
		//		An object that represents a palette of colors.
		// description:
		//		A Palette is a representation of a set of colors.  While the standard
		//		number of colors contained in a palette is 5, it can really handle any
		//		number of colors.
		//
		//		A palette is useful for the ability to transform all the colors in it
		//		using a simple object-based approach.  In addition, you can generate
		//		palettes using dojox.color.Palette.generate; these generated palettes
		//		are based on the palette generators at http://kuler.adobe.com.

		// colors: dojox.color.Color[]
		//		The actual color references in this palette.
		this.colors = [];
		if(base instanceof dxc.Palette){
			this.colors = base.colors.slice(0);
		}
		else if(base instanceof dxc.Color){
			this.colors = [ null, null, base, null, null ];
		}
		else if(lang.isArray(base)){
			this.colors = arr.map(base.slice(0), function(item){
				if(lang.isString(item)){ return new dxc.Color(item); }
				return item;
			});
		}
		else if (lang.isString(base)){
			this.colors = [ null, null, new dxc.Color(base), null, null ];
		}
	}

	//	private functions ---------------------------------------------------------------

	//	transformations
	function tRGBA(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var r=(param=="dr")?item.r+val:item.r,
				g=(param=="dg")?item.g+val:item.g,
				b=(param=="db")?item.b+val:item.b,
				a=(param=="da")?item.a+val:item.a
			ret.colors.push(new dxc.Color({
				r: Math.min(255, Math.max(0, r)),
				g: Math.min(255, Math.max(0, g)),
				b: Math.min(255, Math.max(0, b)),
				a: Math.min(1, Math.max(0, a))
			}));
		});
		return ret;
	}

	function tCMY(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toCmy(),
				c=(param=="dc")?o.c+val:o.c,
				m=(param=="dm")?o.m+val:o.m,
				y=(param=="dy")?o.y+val:o.y;
			ret.colors.push(dxc.fromCmy(
				Math.min(100, Math.max(0, c)),
				Math.min(100, Math.max(0, m)),
				Math.min(100, Math.max(0, y))
			));
		});
		return ret;
	}

	function tCMYK(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toCmyk(),
				c=(param=="dc")?o.c+val:o.c,
				m=(param=="dm")?o.m+val:o.m,
				y=(param=="dy")?o.y+val:o.y,
				k=(param=="dk")?o.b+val:o.b;
			ret.colors.push(dxc.fromCmyk(
				Math.min(100, Math.max(0, c)),
				Math.min(100, Math.max(0, m)),
				Math.min(100, Math.max(0, y)),
				Math.min(100, Math.max(0, k))
			));
		});
		return ret;
	}

	function tHSL(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toHsl(),
				h=(param=="dh")?o.h+val:o.h,
				s=(param=="ds")?o.s+val:o.s,
				l=(param=="dl")?o.l+val:o.l;
			ret.colors.push(dxc.fromHsl(h%360, Math.min(100, Math.max(0, s)), Math.min(100, Math.max(0, l))));
		});
		return ret;
	}

	function tHSV(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toHsv(),
				h=(param=="dh")?o.h+val:o.h,
				s=(param=="ds")?o.s+val:o.s,
				v=(param=="dv")?o.v+val:o.v;
			ret.colors.push(dxc.fromHsv(h%360, Math.min(100, Math.max(0, s)), Math.min(100, Math.max(0, v))));
		});
		return ret;
	}

	//	helper functions
	function rangeDiff(val, low, high){
		//	given the value in a range from 0 to high, find the equiv
		//		using the range low to high.
		return high-((high-val)*((high-low)/high));
	}

/*=====
var __transformArgs = {
	// summary:
	//		The keywords argument to be passed to the dojox.color.Palette.transform function.  Note that
	//		while all arguments are optional, *some* arguments must be passed.  The basic concept is that
	//		you pass a delta value for a specific aspect of a color model (or multiple aspects of the same
	//		color model); for instance, if you wish to transform a palette based on the HSV color model,
	//		you would pass one of "dh", "ds", or "dv" as a value.
	// use: String?
	//		Specify the color model to use for the transformation.  Can be "rgb", "rgba", "hsv", "hsl", "cmy", "cmyk".
	// dr: Number?
	//		The delta to be applied to the red aspect of the RGB/RGBA color model.
	// dg: Number?
	//		The delta to be applied to the green aspect of the RGB/RGBA color model.
	// db: Number?
	//		The delta to be applied to the blue aspect of the RGB/RGBA color model.
	// da: Number?
	//		The delta to be applied to the alpha aspect of the RGBA color model.
	// dc: Number?
	//		The delta to be applied to the cyan aspect of the CMY/CMYK color model.
	// dm: Number?
	//		The delta to be applied to the magenta aspect of the CMY/CMYK color model.
	// dy: Number?
	//		The delta to be applied to the yellow aspect of the CMY/CMYK color model.
	// dk: Number?
	//		The delta to be applied to the black aspect of the CMYK color model.
	// dh: Number?
	//		The delta to be applied to the hue aspect of the HSL/HSV color model.
	// ds: Number?
	//		The delta to be applied to the saturation aspect of the HSL/HSV color model.
	// dl: Number?
	//		The delta to be applied to the luminosity aspect of the HSL color model.
	// dv: Number?
	//		The delta to be applied to the value aspect of the HSV color model.
};
var __generatorArgs = {
	// summary:
	//		The keyword arguments object used to create a palette based on a base color.
	// base: dojo/_base/Color
	//		The base color to be used to generate the palette.
};
var __analogousArgs = {
	// summary:
	//		The keyword arguments object that is used to create a 5 color palette based on the
	//		analogous rules as implemented at http://kuler.adobe.com, using the HSV color model.
	// base: dojo/_base/Color
	//		The base color to be used to generate the palette.
	// high: Number?
	//		The difference between the hue of the base color and the highest hue.  In degrees, default is 60.
	// low: Number?
	//		The difference between the hue of the base color and the lowest hue.  In degrees, default is 18.
};
var __splitComplementaryArgs = {
	// summary:
	//		The keyword arguments object used to create a palette based on the split complementary rules
	//		as implemented at http://kuler.adobe.com.
	// base: dojo/_base/Color
	//		The base color to be used to generate the palette.
	// da: Number?
	//		The delta angle to be used to determine where the split for the complementary rules happen.
	//		In degrees, the default is 30.
};
=====*/

	//	object methods ---------------------------------------------------------------
	lang.extend(dxc.Palette, {
		transform: function(/*__transformArgs*/kwArgs){
			// summary:
			//		Transform the palette using a specific transformation function
			//		and a set of transformation parameters.
			// description:
			//		{palette}.transform is a simple way to uniformly transform
			//		all of the colors in a palette using any of 5 formulae:
			//		RGBA, HSL, HSV, CMYK or CMY.
			//
			//		Once the forumula to be used is determined, you can pass any
			//		number of parameters based on the formula "d"[param]; for instance,
			//		{ use: "rgba", dr: 20, dg: -50 } will take all of the colors in
			//		palette, add 20 to the R value and subtract 50 from the G value.
			//
			//		Unlike other types of transformations, transform does *not* alter
			//		the original palette but will instead return a new one.
			var fn=tRGBA;	//	the default transform function.
			if(kwArgs.use){
				//	we are being specific about the algo we want to use.
				var use=kwArgs.use.toLowerCase();
				if(use.indexOf("hs")==0){
					if(use.charAt(2)=="l"){ fn=tHSL; }
					else { fn=tHSV; }
				}
				else if(use.indexOf("cmy")==0){
					if(use.charAt(3)=="k"){ fn=tCMYK; }
					else { fn=tCMY; }
				}
			}
			//	try to guess the best choice.
			else if("dc" in kwArgs || "dm" in kwArgs || "dy" in kwArgs){
				if("dk" in kwArgs){ fn = tCMYK; }
				else { fn = tCMY; }
			}
			else if("dh" in kwArgs || "ds" in kwArgs){
				if("dv" in kwArgs){ fn = tHSV; }
				else { fn = tHSL; }
			}

			var palette = this;
			for(var p in kwArgs){
				//	ignore use
				if(p=="use"){ continue; }
				palette = fn(palette, p, kwArgs[p]);
			}
			return palette;		//	dojox.color.Palette
		},
		clone: function(){
			// summary:
			//		Clones the current palette.
			return new dxc.Palette(this);	//	dojox.color.Palette
		}
	});

	lang.mixin(dxc.Palette, {
		generators: {
			analogous:function(/* __analogousArgs */args){
				// summary:
				//		Create a 5 color palette based on the analogous rules as implemented at
				//		http://kuler.adobe.com.
				var high=args.high||60, 	//	delta between base hue and highest hue (subtracted from base)
					low=args.low||18,		//	delta between base hue and lowest hue (added to base)
					base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv=base.toHsv();

				//	generate our hue angle differences
				var h=[
					(hsv.h+low+360)%360,
					(hsv.h+Math.round(low/2)+360)%360,
					hsv.h,
					(hsv.h-Math.round(high/2)+360)%360,
					(hsv.h-high+360)%360
				];

				var s1=Math.max(10, (hsv.s<=95)?hsv.s+5:(100-(hsv.s-95))),
					s2=(hsv.s>1)?hsv.s-1:21-hsv.s,
					v1=(hsv.v>=92)?hsv.v-9:Math.max(hsv.v+9, 20),
					v2=(hsv.v<=90)?Math.max(hsv.v+5, 20):(95+Math.ceil((hsv.v-90)/2)),
					s=[ s1, s2, hsv.s, s1, s1 ],
					v=[ v1, v2, hsv.v, v1, v2 ]

				return new dxc.Palette(arr.map(h, function(hue, i){
					return dxc.fromHsv(hue, s[i], v[i]);
				}));		//	dojox.color.Palette
			},

			monochromatic: function(/* __generatorArgs */args){
				// summary:
				//		Create a 5 color palette based on the monochromatic rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();
				
				//	figure out the saturation and value
				var s1 = (hsv.s-30>9)?hsv.s-30:hsv.s+30,
					s2 = hsv.s,
					v1 = rangeDiff(hsv.v, 20, 100),
					v2 = (hsv.v-20>20)?hsv.v-20:hsv.v+60,
					v3 = (hsv.v-50>20)?hsv.v-50:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(hsv.h, s1, v1),
					dxc.fromHsv(hsv.h, s2, v3),
					base,
					dxc.fromHsv(hsv.h, s1, v3),
					dxc.fromHsv(hsv.h, s2, v2)
				]);		//	dojox.color.Palette
			},

			triadic: function(/* __generatorArgs */args){
				// summary:
				//		Create a 5 color palette based on the triadic rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = (hsv.h+57+360)%360,
					h2 = (hsv.h-157+360)%360,
					s1 = (hsv.s>20)?hsv.s-10:hsv.s+10,
					s2 = (hsv.s>90)?hsv.s-10:hsv.s+10,
					s3 = (hsv.s>95)?hsv.s-5:hsv.s+5,
					v1 = (hsv.v-20>20)?hsv.v-20:hsv.v+20,
					v2 = (hsv.v-30>20)?hsv.v-30:hsv.v+30,
					v3 = (hsv.v-30>70)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, hsv.v),
					dxc.fromHsv(hsv.h, s2, v2),
					base,
					dxc.fromHsv(h2, s2, v1),
					dxc.fromHsv(h2, s3, v3)
				]);		//	dojox.color.Palette
			},

			complementary: function(/* __generatorArgs */args){
				// summary:
				//		Create a 5 color palette based on the complementary rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = ((hsv.h*2)+137<360)?(hsv.h*2)+137:Math.floor(hsv.h/2)-137,
					s1 = Math.max(hsv.s-10, 0),
					s2 = rangeDiff(hsv.s, 10, 100),
					s3 = Math.min(100, hsv.s+20),
					v1 = Math.min(100, hsv.v+30),
					v2 = (hsv.v>20)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(hsv.h, s1, v1),
					dxc.fromHsv(hsv.h, s2, v2),
					base,
					dxc.fromHsv(h1, s3, v2),
					dxc.fromHsv(h1, hsv.s, hsv.v)
				]);		//	dojox.color.Palette
			},

			splitComplementary: function(/* __splitComplementaryArgs */args){
				// summary:
				//		Create a 5 color palette based on the split complementary rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					dangle = args.da || 30,
					hsv = base.toHsv();

				var baseh = ((hsv.h*2)+137<360)?(hsv.h*2)+137:Math.floor(hsv.h/2)-137,
					h1 = (baseh-dangle+360)%360,
					h2 = (baseh+dangle)%360,
					s1 = Math.max(hsv.s-10, 0),
					s2 = rangeDiff(hsv.s, 10, 100),
					s3 = Math.min(100, hsv.s+20),
					v1 = Math.min(100, hsv.v+30),
					v2 = (hsv.v>20)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, v1),
					dxc.fromHsv(h1, s2, v2),
					base,
					dxc.fromHsv(h2, s3, v2),
					dxc.fromHsv(h2, hsv.s, hsv.v)
				]);		//	dojox.color.Palette
			},

			compound: function(/* __generatorArgs */args){
				// summary:
				//		Create a 5 color palette based on the compound rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = ((hsv.h*2)+18<360)?(hsv.h*2)+18:Math.floor(hsv.h/2)-18,
					h2 = ((hsv.h*2)+120<360)?(hsv.h*2)+120:Math.floor(hsv.h/2)-120,
					h3 = ((hsv.h*2)+99<360)?(hsv.h*2)+99:Math.floor(hsv.h/2)-99,
					s1 = (hsv.s-40>10)?hsv.s-40:hsv.s+40,
					s2 = (hsv.s-10>80)?hsv.s-10:hsv.s+10,
					s3 = (hsv.s-25>10)?hsv.s-25:hsv.s+25,
					v1 = (hsv.v-40>10)?hsv.v-40:hsv.v+40,
					v2 = (hsv.v-20>80)?hsv.v-20:hsv.v+20,
					v3 = Math.max(hsv.v, 20);

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, v1),
					dxc.fromHsv(h1, s2, v2),
					base,
					dxc.fromHsv(h2, s3, v3),
					dxc.fromHsv(h3, s2, v2)
				]);		//	dojox.color.Palette
			},

			shades: function(/* __generatorArgs */args){
				// summary:
				//		Create a 5 color palette based on the shades rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var s  = (hsv.s==100 && hsv.v==0)?0:hsv.s,
					v1 = (hsv.v-50>20)?hsv.v-50:hsv.v+30,
					v2 = (hsv.v-25>=20)?hsv.v-25:hsv.v+55,
					v3 = (hsv.v-75>=20)?hsv.v-75:hsv.v+5,
					v4 = Math.max(hsv.v-10, 20);

				return new dxc.Palette([
					new dxc.fromHsv(hsv.h, s, v1),
					new dxc.fromHsv(hsv.h, s, v2),
					base,
					new dxc.fromHsv(hsv.h, s, v3),
					new dxc.fromHsv(hsv.h, s, v4)
				]);		//	dojox.color.Palette
			}
		},
		generate: function(/* String|dojox.color.Color */base, /* Function|String */type){
			// summary:
			//		Generate a new Palette using any of the named functions in
			//		dojox.color.Palette.generators or an optional function definition.  Current
			//		generators include "analogous", "monochromatic", "triadic", "complementary",
			//		"splitComplementary", and "shades".
			if(lang.isFunction(type)){
				return type({ base: base });	//	dojox.color.Palette
			}
			else if(dxc.Palette.generators[type]){
				return dxc.Palette.generators[type]({ base: base });	//	dojox.color.Palette
			}
			throw new Error("dojox.color.Palette.generate: the specified generator ('" + type + "') does not exist.");
		}
	});
	
	return dxc.Palette;
});

},
'dojox/color/_base':function(){
define(["../main", "dojo/_base/lang", "dojo/_base/Color", "dojo/colors"],
	function(dojox, lang, Color, colors){

var cx = lang.getObject("color", true, dojox);
/*===== cx = dojox.color =====*/
		
//	alias all the dojo.Color mechanisms
cx.Color=Color;
cx.blend=Color.blendColors;
cx.fromRgb=Color.fromRgb;
cx.fromHex=Color.fromHex;
cx.fromArray=Color.fromArray;
cx.fromString=Color.fromString;

//	alias the dojo.colors mechanisms
cx.greyscale=colors.makeGrey;

lang.mixin(cx,{
	fromCmy: function(/* Object|Array|int */cyan, /*int*/magenta, /*int*/yellow){
		// summary:
		//		Create a dojox.color.Color from a CMY defined color.
		//		All colors should be expressed as 0-100 (percentage)
	
		if(lang.isArray(cyan)){
			magenta=cyan[1], yellow=cyan[2], cyan=cyan[0];
		} else if(lang.isObject(cyan)){
			magenta=cyan.m, yellow=cyan.y, cyan=cyan.c;
		}
		cyan/=100, magenta/=100, yellow/=100;
	
		var r=1-cyan, g=1-magenta, b=1-yellow;
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	},
	
	fromCmyk: function(/* Object|Array|int */cyan, /*int*/magenta, /*int*/yellow, /*int*/black){
		// summary:
		//		Create a dojox.color.Color from a CMYK defined color.
		//		All colors should be expressed as 0-100 (percentage)
	
		if(lang.isArray(cyan)){
			magenta=cyan[1], yellow=cyan[2], black=cyan[3], cyan=cyan[0];
		} else if(lang.isObject(cyan)){
			magenta=cyan.m, yellow=cyan.y, black=cyan.b, cyan=cyan.c;
		}
		cyan/=100, magenta/=100, yellow/=100, black/=100;
		var r,g,b;
		r = 1-Math.min(1, cyan*(1-black)+black);
		g = 1-Math.min(1, magenta*(1-black)+black);
		b = 1-Math.min(1, yellow*(1-black)+black);
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	},
		
	fromHsl: function(/* Object|Array|int */hue, /* int */saturation, /* int */luminosity){
		// summary:
		//		Create a dojox.color.Color from an HSL defined color.
		//		hue from 0-359 (degrees), saturation and luminosity 0-100.
	
		if(lang.isArray(hue)){
			saturation=hue[1], luminosity=hue[2], hue=hue[0];
		} else if(lang.isObject(hue)){
			saturation=hue.s, luminosity=hue.l, hue=hue.h;
		}
		saturation/=100;
		luminosity/=100;
	
		while(hue<0){ hue+=360; }
		while(hue>=360){ hue-=360; }
		
		var r, g, b;
		if(hue<120){
			r=(120-hue)/60, g=hue/60, b=0;
		} else if (hue<240){
			r=0, g=(240-hue)/60, b=(hue-120)/60;
		} else {
			r=(hue-240)/60, g=0, b=(360-hue)/60;
		}
		
		r=2*saturation*Math.min(r, 1)+(1-saturation);
		g=2*saturation*Math.min(g, 1)+(1-saturation);
		b=2*saturation*Math.min(b, 1)+(1-saturation);
		if(luminosity<0.5){
			r*=luminosity, g*=luminosity, b*=luminosity;
		}else{
			r=(1-luminosity)*r+2*luminosity-1;
			g=(1-luminosity)*g+2*luminosity-1;
			b=(1-luminosity)*b+2*luminosity-1;
		}
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	}
});
	
cx.fromHsv = function(/* Object|Array|int */hue, /* int */saturation, /* int */value){
	// summary:
	//		Create a dojox.color.Color from an HSV defined color.
	//		hue from 0-359 (degrees), saturation and value 0-100.

	if(lang.isArray(hue)){
		saturation=hue[1], value=hue[2], hue=hue[0];
	} else if (lang.isObject(hue)){
		saturation=hue.s, value=hue.v, hue=hue.h;
	}
	
	if(hue==360){ hue=0; }
	saturation/=100;
	value/=100;
	
	var r, g, b;
	if(saturation==0){
		r=value, b=value, g=value;
	}else{
		var hTemp=hue/60, i=Math.floor(hTemp), f=hTemp-i;
		var p=value*(1-saturation);
		var q=value*(1-(saturation*f));
		var t=value*(1-(saturation*(1-f)));
		switch(i){
			case 0:{ r=value, g=t, b=p; break; }
			case 1:{ r=q, g=value, b=p; break; }
			case 2:{ r=p, g=value, b=t; break; }
			case 3:{ r=p, g=q, b=value; break; }
			case 4:{ r=t, g=p, b=value; break; }
			case 5:{ r=value, g=p, b=q; break; }
		}
	}
	return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
};
lang.extend(Color,{
	toCmy: function(){
		// summary:
		//		Convert this Color to a CMY definition.
		var cyan=1-(this.r/255), magenta=1-(this.g/255), yellow=1-(this.b/255);
		return { c:Math.round(cyan*100), m:Math.round(magenta*100), y:Math.round(yellow*100) };		//	Object
	},
		
	toCmyk: function(){
		// summary:
		//		Convert this Color to a CMYK definition.
		var cyan, magenta, yellow, black;
		var r=this.r/255, g=this.g/255, b=this.b/255;
		black = Math.min(1-r, 1-g, 1-b);
		cyan = (1-r-black)/(1-black);
		magenta = (1-g-black)/(1-black);
		yellow = (1-b-black)/(1-black);
		return { c:Math.round(cyan*100), m:Math.round(magenta*100), y:Math.round(yellow*100), b:Math.round(black*100) };	//	Object
	},
		
	toHsl: function(){
		// summary:
		//		Convert this Color to an HSL definition.
		var r=this.r/255, g=this.g/255, b=this.b/255;
		var min = Math.min(r, b, g), max = Math.max(r, g, b);
		var delta = max-min;
		var h=0, s=0, l=(min+max)/2;
		if(l>0 && l<1){
			s = delta/((l<0.5)?(2*l):(2-2*l));
		}
		if(delta>0){
			if(max==r && max!=g){
				h+=(g-b)/delta;
			}
			if(max==g && max!=b){
				h+=(2+(b-r)/delta);
			}
			if(max==b && max!=r){
				h+=(4+(r-g)/delta);
			}
			h*=60;
		}
		return { h:h, s:Math.round(s*100), l:Math.round(l*100) };	//	Object
	},
	
	toHsv: function(){
		// summary:
		//		Convert this Color to an HSV definition.
		var r=this.r/255, g=this.g/255, b=this.b/255;
		var min = Math.min(r, b, g), max = Math.max(r, g, b);
		var delta = max-min;
		var h = null, s = (max==0)?0:(delta/max);
		if(s==0){
			h = 0;
		}else{
			if(r==max){
				h = 60*(g-b)/delta;
			}else if(g==max){
				h = 120 + 60*(b-r)/delta;
			}else{
				h = 240 + 60*(r-g)/delta;
			}
	
			if(h<0){ h+=360; }
		}
		return { h:h, s:Math.round(s*100), v:Math.round(max*100) };	//	Object
	}
});

return cx;
});

},
'dojo/colors':function(){
define(["./_base/kernel", "./_base/lang", "./_base/Color", "./_base/array"], function(dojo, lang, Color, ArrayUtil){
	// module:
	//		dojo/colors

	/*=====
	return {
		// summary:
		//		Color utilities, extending Base dojo.Color
	};
	=====*/

	var ColorExt = {};
	lang.setObject("dojo.colors", ColorExt);

//TODO: this module appears to break naming conventions

	// this is a standard conversion prescribed by the CSS3 Color Module
	var hue2rgb = function(m1, m2, h){
		if(h < 0){ ++h; }
		if(h > 1){ --h; }
		var h6 = 6 * h;
		if(h6 < 1){ return m1 + (m2 - m1) * h6; }
		if(2 * h < 1){ return m2; }
		if(3 * h < 2){ return m1 + (m2 - m1) * (2 / 3 - h) * 6; }
		return m1;
	};
	// Override base Color.fromRgb with the impl in this module
	dojo.colorFromRgb = Color.fromRgb = function(/*String*/ color, /*dojo/_base/Color?*/ obj){
		// summary:
		//		get rgb(a) array from css-style color declarations
		// description:
		//		this function can handle all 4 CSS3 Color Module formats: rgb,
		//		rgba, hsl, hsla, including rgb(a) with percentage values.
		var m = color.toLowerCase().match(/^(rgba?|hsla?)\(([\s\.\-,%0-9]+)\)/);
		if(m){
			var c = m[2].split(/\s*,\s*/), l = c.length, t = m[1], a;
			if((t == "rgb" && l == 3) || (t == "rgba" && l == 4)){
				var r = c[0];
				if(r.charAt(r.length - 1) == "%"){
					// 3 rgb percentage values
					a = ArrayUtil.map(c, function(x){
						return parseFloat(x) * 2.56;
					});
					if(l == 4){ a[3] = c[3]; }
					return Color.fromArray(a, obj); // dojo/_base/Color
				}
				return Color.fromArray(c, obj); // dojo/_base/Color
			}
			if((t == "hsl" && l == 3) || (t == "hsla" && l == 4)){
				// normalize hsl values
				var H = ((parseFloat(c[0]) % 360) + 360) % 360 / 360,
					S = parseFloat(c[1]) / 100,
					L = parseFloat(c[2]) / 100,
					// calculate rgb according to the algorithm
					// recommended by the CSS3 Color Module
					m2 = L <= 0.5 ? L * (S + 1) : L + S - L * S,
					m1 = 2 * L - m2;
				a = [
					hue2rgb(m1, m2, H + 1 / 3) * 256,
					hue2rgb(m1, m2, H) * 256,
					hue2rgb(m1, m2, H - 1 / 3) * 256,
					1
				];
				if(l == 4){ a[3] = c[3]; }
				return Color.fromArray(a, obj); // dojo/_base/Color
			}
		}
		return null;	// dojo/_base/Color
	};

	var confine = function(c, low, high){
		// summary:
		//		sanitize a color component by making sure it is a number,
		//		and clamping it to valid values
		c = Number(c);
		return isNaN(c) ? high : c < low ? low : c > high ? high : c;	// Number
	};

	Color.prototype.sanitize = function(){
		// summary:
		//		makes sure that the object has correct attributes
		var t = this;
		t.r = Math.round(confine(t.r, 0, 255));
		t.g = Math.round(confine(t.g, 0, 255));
		t.b = Math.round(confine(t.b, 0, 255));
		t.a = confine(t.a, 0, 1);
		return this;	// dojo/_base/Color
	};

	ColorExt.makeGrey = Color.makeGrey = function(/*Number*/ g, /*Number?*/ a){
		// summary:
		//		creates a greyscale color with an optional alpha
		return Color.fromArray([g, g, g, a]);	// dojo/_base/Color
	};

	// mixin all CSS3 named colors not already in _base, along with SVG 1.0 variant spellings
	lang.mixin(Color.named, {
		"aliceblue":	[240,248,255],
		"antiquewhite": [250,235,215],
		"aquamarine":	[127,255,212],
		"azure":	[240,255,255],
		"beige":	[245,245,220],
		"bisque":	[255,228,196],
		"blanchedalmond":	[255,235,205],
		"blueviolet":	[138,43,226],
		"brown":	[165,42,42],
		"burlywood":	[222,184,135],
		"cadetblue":	[95,158,160],
		"chartreuse":	[127,255,0],
		"chocolate":	[210,105,30],
		"coral":	[255,127,80],
		"cornflowerblue":	[100,149,237],
		"cornsilk": [255,248,220],
		"crimson":	[220,20,60],
		"cyan": [0,255,255],
		"darkblue": [0,0,139],
		"darkcyan": [0,139,139],
		"darkgoldenrod":	[184,134,11],
		"darkgray": [169,169,169],
		"darkgreen":	[0,100,0],
		"darkgrey": [169,169,169],
		"darkkhaki":	[189,183,107],
		"darkmagenta":	[139,0,139],
		"darkolivegreen":	[85,107,47],
		"darkorange":	[255,140,0],
		"darkorchid":	[153,50,204],
		"darkred":	[139,0,0],
		"darksalmon":	[233,150,122],
		"darkseagreen": [143,188,143],
		"darkslateblue":	[72,61,139],
		"darkslategray":	[47,79,79],
		"darkslategrey":	[47,79,79],
		"darkturquoise":	[0,206,209],
		"darkviolet":	[148,0,211],
		"deeppink": [255,20,147],
		"deepskyblue":	[0,191,255],
		"dimgray":	[105,105,105],
		"dimgrey":	[105,105,105],
		"dodgerblue":	[30,144,255],
		"firebrick":	[178,34,34],
		"floralwhite":	[255,250,240],
		"forestgreen":	[34,139,34],
		"gainsboro":	[220,220,220],
		"ghostwhite":	[248,248,255],
		"gold": [255,215,0],
		"goldenrod":	[218,165,32],
		"greenyellow":	[173,255,47],
		"grey": [128,128,128],
		"honeydew": [240,255,240],
		"hotpink":	[255,105,180],
		"indianred":	[205,92,92],
		"indigo":	[75,0,130],
		"ivory":	[255,255,240],
		"khaki":	[240,230,140],
		"lavender": [230,230,250],
		"lavenderblush":	[255,240,245],
		"lawngreen":	[124,252,0],
		"lemonchiffon": [255,250,205],
		"lightblue":	[173,216,230],
		"lightcoral":	[240,128,128],
		"lightcyan":	[224,255,255],
		"lightgoldenrodyellow": [250,250,210],
		"lightgray":	[211,211,211],
		"lightgreen":	[144,238,144],
		"lightgrey":	[211,211,211],
		"lightpink":	[255,182,193],
		"lightsalmon":	[255,160,122],
		"lightseagreen":	[32,178,170],
		"lightskyblue": [135,206,250],
		"lightslategray":	[119,136,153],
		"lightslategrey":	[119,136,153],
		"lightsteelblue":	[176,196,222],
		"lightyellow":	[255,255,224],
		"limegreen":	[50,205,50],
		"linen":	[250,240,230],
		"magenta":	[255,0,255],
		"mediumaquamarine": [102,205,170],
		"mediumblue":	[0,0,205],
		"mediumorchid": [186,85,211],
		"mediumpurple": [147,112,219],
		"mediumseagreen":	[60,179,113],
		"mediumslateblue":	[123,104,238],
		"mediumspringgreen":	[0,250,154],
		"mediumturquoise":	[72,209,204],
		"mediumvioletred":	[199,21,133],
		"midnightblue": [25,25,112],
		"mintcream":	[245,255,250],
		"mistyrose":	[255,228,225],
		"moccasin": [255,228,181],
		"navajowhite":	[255,222,173],
		"oldlace":	[253,245,230],
		"olivedrab":	[107,142,35],
		"orange":	[255,165,0],
		"orangered":	[255,69,0],
		"orchid":	[218,112,214],
		"palegoldenrod":	[238,232,170],
		"palegreen":	[152,251,152],
		"paleturquoise":	[175,238,238],
		"palevioletred":	[219,112,147],
		"papayawhip":	[255,239,213],
		"peachpuff":	[255,218,185],
		"peru": [205,133,63],
		"pink": [255,192,203],
		"plum": [221,160,221],
		"powderblue":	[176,224,230],
		"rosybrown":	[188,143,143],
		"royalblue":	[65,105,225],
		"saddlebrown":	[139,69,19],
		"salmon":	[250,128,114],
		"sandybrown":	[244,164,96],
		"seagreen": [46,139,87],
		"seashell": [255,245,238],
		"sienna":	[160,82,45],
		"skyblue":	[135,206,235],
		"slateblue":	[106,90,205],
		"slategray":	[112,128,144],
		"slategrey":	[112,128,144],
		"snow": [255,250,250],
		"springgreen":	[0,255,127],
		"steelblue":	[70,130,180],
		"tan":	[210,180,140],
		"thistle":	[216,191,216],
		"tomato":	[255,99,71],
		"turquoise":	[64,224,208],
		"violet":	[238,130,238],
		"wheat":	[245,222,179],
		"whitesmoke":	[245,245,245],
		"yellowgreen":	[154,205,50]
	});

	return Color;	// TODO: return ColorExt, not Color
});

},
'JBrowse/View/FeatureGlyph/Segments':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/lang',
           'dojo/_base/array',
           'JBrowse/View/FeatureGlyph/Box'
       ],
       function(
           declare,
           lang,
           array,
           BoxGlyph
       ) {

return declare( BoxGlyph, {
_defaultConfig: function() {
    return this._mergeConfigs(
        this.inherited(arguments),
        {
            style: {
                connectorColor: '#333',
                connectorThickness: 1,
                borderColor: 'rgba( 0, 0, 0, 0.3 )'
            },
            subParts: function() { return true; } // accept all subparts by default
        });
},

renderFeature: function( context, fRect ) {
    if( this.track.displayMode != 'collapsed' )
        context.clearRect( Math.floor(fRect.l), fRect.t, Math.ceil(fRect.w), fRect.h );

    this.renderConnector( context,  fRect );
    this.renderSegments( context, fRect );
    this.renderLabel( context, fRect );
    this.renderDescription( context, fRect );
    this.renderArrowhead( context, fRect );
},

renderConnector: function( context, fRect ) {
    // connector
    var connectorColor = this.getStyle( fRect.f, 'connectorColor' );
    if( connectorColor ) {
        context.fillStyle = connectorColor;
        var connectorThickness = this.getStyle( fRect.f, 'connectorThickness' );
        context.fillRect(
            fRect.rect.l, // left
            Math.round(fRect.rect.t+(fRect.rect.h-connectorThickness)/2), // top
            fRect.rect.w, // width
            connectorThickness
        );
    }
},

renderSegments: function( context, fRect ) {
    var subparts = this._getSubparts( fRect.f );
    if( ! subparts.length ) return;

    var thisB = this;
    var parentFeature = fRect.f;
    function style( feature, stylename ) {
        if( stylename == 'height' )
            return thisB._getFeatureHeight( fRect.viewInfo, feature );

        return thisB.getStyle( feature, stylename ) || thisB.getStyle( parentFeature, stylename );
    }

    for( var i = 0; i < subparts.length; ++i ) {
        this.renderBox( context, fRect.viewInfo, subparts[i], fRect.t, fRect.rect.h, fRect.f, style );
    }
},

_getSubparts: function( f ) {
    var c = f.children();
    if( ! c ) return [];

    var filtered = [];
    for( var i = 0; i<c.length; i++ )
        if( this._filterSubpart( c[i] ) )
            filtered.push( c[i] );

    return filtered;
},

_filterSubpart: function( f ) {
    return ( this._subpartsFilter || (this._subpartsFilter = this._makeSubpartsFilter()) )(f);
},

// make a function that will filter subpart features according to the
// sub_parts conf var
_makeSubpartsFilter: function( f ) {
    var filter = this.getConf( 'subParts' );

    if( typeof filter == 'string' )
        // convert to array
        filter = filter.split( /\s*,\s*/ );

    if( typeof filter == 'object' ) {
        // lowercase and make into a function
        if( lang.isArray( filter ) )
            filter = function() {
                var f = {};
                array.forEach( filter, function(t) { f[t.toLowerCase()] = true; } );
                return f;
            }.call(this);
        else
            filter = function() {
                var f = {};
                for( var t in filter ) {
                    f[t.toLowerCase()] = filter[t];
                }
                return f;
            }.call(this);
        return function(feature) {
            return filter[ (feature.get('type')||'').toLowerCase() ];
        };
    }
    else
        filter = function() { return true; }

    return filter;
}

});
});

},
'JBrowse/View/FeatureGlyph/Box':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/array',
           'dojo/_base/lang',
           'JBrowse/Util/FastPromise',
           'JBrowse/View/FeatureGlyph',
           './_FeatureLabelMixin'
       ],
       function(
           declare,
           array,
           lang,
           FastPromise,
           FeatureGlyph,
           FeatureLabelMixin
       ) {


return declare([ FeatureGlyph, FeatureLabelMixin], {

    constructor: function() {
        this._embeddedImagePromises = {};
    },

    _defaultConfig: function() {
        return this._mergeConfigs(
            this.inherited(arguments),
            {
                style: {
                    maxDescriptionLength: 70,

                    color: 'goldenrod',
                    mouseovercolor: 'rgba(0,0,0,0.3)',
                    borderColor: null,
                    borderWidth: 0.5,
                    height: 11,
                    marginBottom: 2,

                    strandArrow: true,

                    label: 'name, id',
                    textFont: 'normal 12px Univers,Helvetica,Arial,sans-serif',
                    textColor:  'black',
                    text2Color: 'blue',
                    text2Font: 'normal 12px Univers,Helvetica,Arial,sans-serif',

                    description: 'note, description'
                }
            });
    },

    _getFeatureHeight: function( viewArgs, feature ) {
        var h = this.getStyle( feature, 'height');

        if( viewArgs.displayMode == 'compact' )
            h = Math.round( 0.45 * h );

        if( this.getStyle( feature, 'strandArrow' ) ) {
            var strand = feature.get('strand');
            if( strand == 1 )
                h = Math.max( this._embeddedImages.plusArrow.height, h );
            else if( strand == -1 )
                h = Math.max( this._embeddedImages.minusArrow.height, h );
        }

        return h;
    },

    _getFeatureRectangle: function( viewArgs, feature ) {
        var block = viewArgs.block;
        var fRect = {
            l: block.bpToX( feature.get('start') ),
            h: this._getFeatureHeight(viewArgs, feature),
            viewInfo: viewArgs,
            f: feature,
            glyph: this
        };

        fRect.w = block.bpToX( feature.get('end') ) - fRect.l;

        // save the original rect in `rect` as the dimensions
        // we'll use for the rectangle itself
        fRect.rect = { l: fRect.l, h: fRect.h, w: Math.max( fRect.w, 2 ), t: 0 };
        fRect.w = fRect.rect.w; // in case it was increased
        if( viewArgs.displayMode != 'compact' )
            fRect.h += this.getStyle( feature, 'marginBottom' ) || 0
;
        // if we are showing strand arrowheads, expand the frect a little
        if( this.getStyle( feature, 'strandArrow') ) {
            var strand = fRect.strandArrow = feature.get('strand');

            if( strand == -1 ) {
                var i = this._embeddedImages.minusArrow;
                fRect.w += i.width;
                fRect.l -= i.width;
            }
            else {
                var i = this._embeddedImages.plusArrow;
                fRect.w += i.width;
            }
        }

        // no labels or descriptions if displayMode is collapsed, so stop here
        if( viewArgs.displayMode == "collapsed")
            return fRect;

        this._expandRectangleWithLabels( viewArgs, feature, fRect );
        this._addMasksToRect( viewArgs, feature, fRect );

        return fRect;
    },

    layoutFeature: function( viewArgs, layout, feature ) {
        var rect = this.inherited( arguments );
        if( ! rect ) return rect;

        // need to set the top of the inner rect
        rect.rect.t = rect.t;

        return rect;
    },

    // given an under-construction feature layout rectangle, expand it
    // to accomodate a label and/or a description
    _expandRectangleWithLabels: function( viewArgs, feature, fRect ) {
        // maybe get the feature's name, and update the layout box
        // accordingly
        if( viewArgs.showLabels ) {
            var label = this.makeFeatureLabel( feature, fRect );
            if( label ) {
                fRect.h += label.h;
                fRect.w = Math.max( label.w, fRect.w );
                fRect.label = label;
                label.yOffset = fRect.rect.h + label.h;
            }
        }

        // maybe get the feature's description if available, and
        // update the layout box accordingly
        if( viewArgs.showDescriptions ) {
            var description = this.makeFeatureDescriptionLabel( feature, fRect );
            if( description ) {
                fRect.description = description;
                fRect.h += description.h;
                fRect.w = Math.max( description.w, fRect.w );
                description.yOffset = fRect.h-(this.getStyle( feature, 'marginBottom' ) || 0);
            }
        }
    },

    _embeddedImages: {
         plusArrow: {
             data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAATUlEQVQIW2NkwATGQKFYIG4A4g8gacb///+7AWlBmNq+vj6V4uLiJiD/FRBXA/F8xu7u7kcVFRWyMEVATQz//v0Dcf9CxaYRZxIxbgIARiAhmifVe8UAAAAASUVORK5CYII=",
             width: 9,
             height: 5
         },

         minusArrow: {
             data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAASklEQVQIW2NkQAABILMBiBcD8VkkcQZGIAeEE4G4FYjFent764qKiu4gKXoPUjAJiLOggsxMTEwMjIwgYQjo6Oh4TLRJME043QQA+W8UD/sdk9IAAAAASUVORK5CYII=",
             width: 9,
             height: 5
         }
    },

    /**
     * Returns a promise for an Image object for the image with the
     * given name.  Image data comes from a data URL embedded in this
     * source code.
     */
    getEmbeddedImage: function( name ) {
        return (this._embeddedImagePromises[name] || function() {
                    var p = new FastPromise();
                    var imgRec = this._embeddedImages[ name ];
                    if( ! imgRec ) {
                        p.resolve( null );
                    }
                    else {
                        var i = new Image();
                        var thisB = this;
                        i.onload = function() {
                            p.resolve( this );
                        };
                        i.src = imgRec.data;
                    }
                    return this._embeddedImagePromises[name] = p;
                }.call(this));
    },

    renderFeature: function( context, fRect ) {
        if( this.track.displayMode != 'collapsed' )
            context.clearRect( Math.floor(fRect.l), fRect.t, Math.ceil(fRect.w-Math.floor(fRect.l)+fRect.l), fRect.h );

        this.renderBox( context, fRect.viewInfo, fRect.f, fRect.t, fRect.rect.h, fRect.f );
        this.renderLabel( context, fRect );
        this.renderDescription( context, fRect );
        this.renderArrowhead( context, fRect );
    },

    // top and height are in px
    renderBox: function( context, viewInfo, feature, top, overallHeight, parentFeature, style ) {
        var left  = viewInfo.block.bpToX( feature.get('start') );
        var width = viewInfo.block.bpToX( feature.get('end') ) - left;
        //left = Math.round( left );
        //width = Math.round( width );

        style = style || lang.hitch( this, 'getStyle' );

        var height = this._getFeatureHeight( viewInfo, feature );
        if( ! height )
            return;
        if( height != overallHeight )
            top += Math.round( (overallHeight - height)/2 );

        // background
        var bgcolor = style( feature, 'color' );
        if( bgcolor ) {
            context.fillStyle = bgcolor;
            context.fillRect( left, top, Math.max(1,width), height );
        }
        else {
            context.clearRect( left, top, Math.max(1,width), height );
        }

        // foreground border
        var borderColor, lineWidth;
        if( (borderColor = style( feature, 'borderColor' )) && ( lineWidth = style( feature, 'borderWidth')) ) {
            if( width > 3 ) {
                context.lineWidth = lineWidth;
                context.strokeStyle = borderColor;

                // need to stroke a smaller rectangle to remain within
                // the bounds of the feature's overall height and
                // width, because of the way stroking is done in
                // canvas.  thus the +0.5 and -1 business.
                context.strokeRect( left+lineWidth/2, top+lineWidth/2, width-lineWidth, height-lineWidth );
            }
            else {
                context.globalAlpha = lineWidth*2/width;
                context.fillStyle = borderColor;
                context.fillRect( left, top, Math.max(1,width), height );
                context.globalAlpha = 1;
            }
        }
    },

    // feature label
    renderLabel: function( context, fRect ) {
        if( fRect.label ) {
            context.font = fRect.label.font;
            context.fillStyle = fRect.label.fill;
            context.textBaseline = fRect.label.baseline;
            context.fillText( fRect.label.text,
                              fRect.l+(fRect.label.xOffset||0),
                              fRect.t+(fRect.label.yOffset||0)
                            );
        }
    },

    // feature description
    renderDescription: function( context, fRect ) {
        if( fRect.description ) {
            context.font = fRect.description.font;
            context.fillStyle = fRect.description.fill;
            context.textBaseline = fRect.description.baseline;
            context.fillText(
                fRect.description.text,
                fRect.l+(fRect.description.xOffset||0),
                fRect.t + (fRect.description.yOffset||0)
            );
        }
    },

    // strand arrowhead
    renderArrowhead: function( context, fRect ) {
        if( fRect.strandArrow ) {
            if( fRect.strandArrow == 1 && fRect.rect.l+fRect.rect.w <= context.canvas.width ) {
                this.getEmbeddedImage( 'plusArrow' )
                    .then( function( img ) {
                               context.imageSmoothingEnabled = false;
                               context.drawImage( img, fRect.rect.l + fRect.rect.w, fRect.t + (fRect.rect.h-img.height)/2 );
                           });
            }
            else if( fRect.strandArrow == -1 && fRect.rect.l >= 0 ) {
                this.getEmbeddedImage( 'minusArrow' )
                    .then( function( img ) {
                               context.imageSmoothingEnabled = false;
                               context.drawImage( img, fRect.rect.l-9, fRect.t + (fRect.rect.h-img.height)/2 );
                           });
            }
        }
    },

    updateStaticElements: function( context, fRect, viewArgs ) {
        var vMin = viewArgs.minVisible;
        var vMax = viewArgs.maxVisible;
        var block = fRect.viewInfo.block;

        if( !( block.containsBp( vMin ) || block.containsBp( vMax ) ) )
            return;

        var scale = block.scale;
        var bpToPx = viewArgs.bpToPx;
        var lWidth = viewArgs.lWidth;
        var labelBp = lWidth / scale;
        var feature = fRect.f;
        var fMin = feature.get('start');
        var fMax = feature.get('end');

        if( fRect.strandArrow ) {
            if( fRect.strandArrow == 1 && fMax >= vMax && fMin <= vMax ) {
                this.getEmbeddedImage( 'plusArrow' )
                    .then( function( img ) {
                               context.imageSmoothingEnabled = false;
                               context.drawImage( img, bpToPx(vMax) - bpToPx(vMin) - 9, fRect.t + (fRect.rect.h-img.height)/2 );
                           });
            }
            else if( fRect.strandArrow == -1 && fMin <= vMin && fMax >= vMin ) {
                this.getEmbeddedImage( 'minusArrow' )
                    .then( function( img ) {
                               context.imageSmoothingEnabled = false;
                               context.drawImage( img, 0, fRect.t + (fRect.rect.h-img.height)/2 );
                           });
            }
        }

        var fLabelWidth = fRect.label ? fRect.label.w : 0;
        var fDescriptionWidth = fRect.description ? fRect.description.w : 0;
        var maxLeft = bpToPx( fMax ) - Math.max(fLabelWidth, fDescriptionWidth) - bpToPx( vMin );
        var minLeft = bpToPx( fMin ) - bpToPx( vMin );

    }

});
});
},
'JBrowse/Util/FastPromise':function(){
/**
 * Very minimal and fast implementation of a promise, used in
 * performance-critical code.  Dojo Deferred is too heavy for some
 * uses.
 */

define([
       ],
       function(
       ) {

var fastpromise = function() {
    this.callbacks = [];
};

fastpromise.prototype.then = function( callback ) {
    if( 'value' in this )
        callback( this.value );
    else
        this.callbacks.push( callback );
};

fastpromise.prototype.resolve = function( value ) {
    this.value = value;
    var c = this.callbacks;
    delete this.callbacks;
    for( var i = 0; i<c.length; i++ )
        c[i]( this.value );
};

return fastpromise;
});
},
'JBrowse/View/FeatureGlyph':function(){
define([
           'dojo/_base/declare',
           'dojo/_base/array',
           'dojo/aspect',
           'JBrowse/Component'
       ],
       function(
           declare,
           array,
           aspect,
           Component
       ) {

return declare( Component, {
    constructor: function( args ) {
        this.track = args.track;
        this.booleanAlpha = 0.17;


        // This allows any features that are completely masked to have their transparency set before being rendered,
        // saving the hassle of clearing and rerendering later on.
        aspect.before(this, 'renderFeature',
                    function( context, fRect ) {
                        if (fRect.m) {
                            var l = Math.floor(fRect.l);
                            var w = Math.ceil(fRect.w + fRect.l) - l;
                            fRect.m.sort(function(a,b) { return a.l - b.l; });
                            var m = fRect.m[0];
                            if (m.l <= l) {
                                // Determine whether the feature is entirely masked.
                                var end = fRect.m[0].l;
                                for(var i in fRect.m) {
                                    var m = fRect.m[i];
                                    if(m.l > end)
                                        break;
                                    end = m.l + m.w;
                                }
                                if(end >= l + w) {
                                    context.globalAlpha = this.booleanAlpha;
                                    fRect.noMask = true;
                                }
                            }
                        }
                    }, true);

        // after rendering the features, do masking if required
        aspect.after(this, 'renderFeature',
                     function( context, fRect ) {
                        if (fRect.m && !fRect.noMask) {
                            this.maskBySpans( context, fRect );
                        } else if ( fRect.noMask) {
                            delete fRect.noMask;
                            context.globalAlpha = 1;
                        }
                    }, true);
    },

    getStyle: function( feature, name ) {
        return this.getConfForFeature( 'style.'+name, feature );
    },

    /**
     * Like getConf, but get a conf value that explicitly can vary
     * feature by feature.  Provides a uniform function signature for
     * user-defined callbacks.
     */
    getConfForFeature: function( path, feature ) {
        return this.getConf( path, [feature, path, this, this.track ] );
    },

    mouseoverFeature: function( context, fRect ) {
        this.renderFeature( context, fRect );

        // highlight the feature rectangle if we're moused over
        context.fillStyle = this.getStyle( fRect.f, 'mouseovercolor' );
        context.fillRect( fRect.rect.l, fRect.t, fRect.rect.w, fRect.rect.h );
    },

    /**
     * Get the dimensions of the rendered feature in pixels.
     */
    _getFeatureRectangle: function( viewInfo, feature ) {
        var block = viewInfo.block;
        var fRect = {
            l: block.bpToX( feature.get('start') ),
            h: this._getFeatureHeight( viewInfo, feature ),
            viewInfo: viewInfo,
            f: feature,
            glyph: this
        };

        fRect.w = block.bpToX( feature.get('end') ) - fRect.l;

        this._addMasksToRect( viewInfo, feature, fRect );
    },

    _addMasksToRect: function( viewArgs, feature, fRect ) {
        // if the feature has masks, add them to the fRect.
        var block = viewArgs.block;

        if( feature.masks ) {
            fRect.m = [];
            array.forEach( feature.masks, function(m) {
                var tempM = { l: block.bpToX( m.start ) };
                tempM.w = block.bpToX( m.end ) - tempM.l;
                fRect.m.push(tempM);
            });
        }

        return fRect;
    },

    layoutFeature: function( viewArgs, layout, feature ) {
        var fRect = this._getFeatureRectangle( viewArgs, feature );

        var scale = viewArgs.scale;
        var leftBase = viewArgs.leftBase;
        var startbp = fRect.l/scale + leftBase;
        var endbp   = (fRect.l+fRect.w)/scale + leftBase;
        fRect.t = layout.addRect(
            feature.id(),
            startbp,
            endbp,
            fRect.h,
            feature
        );
        if( fRect.t === null )
            return null;

        fRect.f = feature;

        return fRect;
    },

    //stub
    renderFeature: function( context, fRect ) {
    },

    /* If it's a boolean track, mask accordingly */
    maskBySpans: function( context, fRect ) {
        var canvasHeight = context.canvas.height;

        var thisB = this;

        // make a temporary canvas to store image data
        var tempCan = dojo.create( 'canvas', {height: canvasHeight, width: context.canvas.width} );
        var ctx2 = tempCan.getContext('2d');
        var l = Math.floor(fRect.l);
        var w = Math.ceil(fRect.w + fRect.l) - l;

        /* note on the above: the rightmost pixel is determined
           by l+w. If either of these is a float, then canvas
           methods will not behave as desired (i.e. clear and
           draw will not treat borders in the same way).*/
        array.forEach( fRect.m, function(m) { try {
            if ( m.l < l ) {
                m.w += m.l-l;
                m.l = l;
            }
            if ( m.w > w )
                m.w = w;
            if ( m.l < 0 ) {
                m.w += m.l;
                m.l = 0;
            }
            if ( m.l + m.w > l + w )
                m.w = w + l - m.l;
            if ( m.l + m.w > context.canvas.width )
                m.w = context.canvas.width-m.l;
            ctx2.drawImage(context.canvas, m.l, fRect.t, m.w, fRect.h, m.l, fRect.t, m.w, fRect.h);
            context.globalAlpha = thisB.booleanAlpha;
            // clear masked region and redraw at lower opacity.
            context.clearRect(m.l, fRect.t, m.w, fRect.h);
            context.drawImage(tempCan, m.l, fRect.t, m.w, fRect.h, m.l, fRect.t, m.w, fRect.h);
            context.globalAlpha = 1;
        } catch(e) {};
        });
    },

    _getFeatureHeight: function( viewArgs, feature ) {
        return this.getStyle( feature, 'height');
    },

    updateStaticElements: function( context, fRect, viewArgs ) {

    }

});
});

},
'JBrowse/View/FeatureGlyph/_FeatureLabelMixin':function(){
define( [
            'dojo/_base/declare',
            'dojo/_base/lang',
            'JBrowse/View/_FeatureDescriptionMixin'
        ],
        function(
            declare,
            lang,
            FeatureDescriptionMixin
        ) {
var fontMeasurementsCache = {};

return declare( FeatureDescriptionMixin,  {

    /**
     * Estimate the height and width, in pixels, of the given
     * feature's label text, and trim it if necessary to fit within
     * the track's maxFeatureGlyphExpansion limit.
     */
    makeFeatureLabel: function( feature, fRect ) {
        var text = this.getFeatureLabel( feature );
        if( ! text )
            return null;
        text = ''+text;
        var font = this.getStyle( feature, 'textFont' );
        var l = fRect ? this.makeBottomOrTopLabel( text, font, fRect ) : this.makePopupLabel( text, font );
        l.fill = this.getStyle( feature, 'textColor' );
        return l;
    },

    /**
     * Estimate the height and width, in pixels, of the given
     * feature's description text, and trim it if necessary to fit
     * within the track's maxFeatureGlyphExpansion limit.
     */
    makeFeatureDescriptionLabel: function( feature, fRect ) {
        var text = this.getFeatureDescription( feature );
        if( ! text )
            return null;
        text = ''+text;
        var font = this.getStyle( feature, 'text2Font' );
        var l = fRect ? this.makeBottomOrTopLabel( text, font, fRect ) : this.makePopupLabel( text, font );
        l.fill = this.getStyle( feature, 'text2Color' );
        return l;
    },

    /**
     * Makes a label that sits on the left or right side of a feature,
     * respecting maxFeatureGlyphExpansion.
     */
    makeSideLabel: function( text, font, fRect ) {
        if( ! text ) return null;

        var dims = this.measureFont( font );
        var excessCharacters = Math.round(( text.length * dims.w - this.track.getConf('maxFeatureGlyphExpansion') ) / dims.w );
        if( excessCharacters > 0 )
            text = text.slice( 0, text.length - excessCharacters - 1 ) + '…';

        return {
            text: text,
            font: font,
            baseline: 'middle',
            w: dims.w * text.length,
            h: dims.h
        };
    },

    /**
     * Makes a label that lays across the bottom edge of a feature,
     * respecting maxFeatureGlyphExpansion.
     */
    makeBottomOrTopLabel: function( text, font, fRect ) {
        if( ! text ) return null;

        var dims = this.measureFont( font );
        var excessCharacters = Math.round(( text.length * dims.w - fRect.w - this.track.getConf('maxFeatureGlyphExpansion') ) / dims.w );
        if( excessCharacters > 0 )
            text = text.slice( 0, text.length - excessCharacters - 1 ) + '…';

        return {
            text: text,
            font: font,
            baseline: 'bottom',
            w: dims.w * text.length,
            h: dims.h
        };
   },

    /**
     * Makes a label that can be put in a popup or tooltip,
     * not respecting maxFeatureGlyphExpansion or the width of the fRect.
     */
    makePopupLabel: function( text, font ) {
        if( ! text ) return null;
        var dims = this.measureFont( font );
        return {
            text: text,
            font: font,
            w: dims.w * text.length,
            h: dims.h
        }
    },

    /**
     * Return an object with average `h` and `w` of characters in the
     * font described by the given string.
     */
    measureFont: function( font ) {
        return fontMeasurementsCache[ font ]
            || ( fontMeasurementsCache[font] = function() {
                     var ctx = document.createElement('canvas').getContext('2d');
                     ctx.font = font;
                     var testString = "MMMMMMMMMMMMXXXXXXXXXX1234567890-.CGCC12345";
                     var m = ctx.measureText( testString );
                     return {
                         h: m.height || parseInt( font.match(/(\d+)px/)[1] ),
                         w: m.width / testString.length
                     };
                 }.call( this ));
    }
});
});

}}});
/*
 * NeatCanvasFeatures Plugin
 * Draws introns and paints gradient subfeatures. 
 */
/* 
    Created on : Nov 17, 2015
    Author     : EY
*/

define("NeatCanvasFeatures/main", [
        'dojo/_base/declare',
        'dojo/_base/lang',
        'dojo/Deferred',
        'dojo/dom-construct',
        'dojo/query',
        'JBrowse/Plugin'
       ],
       function(
        declare,
        lang,
        Deferred,
        domConstruct,
        query,
        JBrowsePlugin
       ) {
return declare( JBrowsePlugin,
{
    constructor: function( args ) {
        console.log("plugin: NeatCanvasFeatures");
        //console.dir(args);

        var thisB = this;
        var browser = this.browser;

        this.gradient = 1;
        if(typeof args.gradientFeatures != 'undefined' && args.gradientFeatures == 0) {
            this.gradient = 0;
        }

        // create function intercept after view initialization (because the view object doesn't exist before that)
        browser.afterMilestone( 'loadConfig', function() {
            if (typeof browser.config.classInterceptList === 'undefined') {
                browser.config.classInterceptList = {};
            }
            
            // override ProcessedTranscripts
            require(["dojo/_base/lang", "JBrowse/View/FeatureGlyph/ProcessedTranscript"], function(lang, ProcessedTranscript){
                lang.extend(ProcessedTranscript, {
                    _getFeatureHeight: function() {
                        return 11;
                    }
                });
            });
            // override Segments
            require(["dojo/_base/lang", "JBrowse/View/FeatureGlyph/Segments"], function(lang, Segments){
                lang.extend(Segments, {
                    renderFeature: thisB.segments_renderFeature,                    
                    renderIntrons: thisB.segments_renderIntrons
                });
            });
            // override Box
            require(["dojo/_base/lang", "JBrowse/View/FeatureGlyph/Box"], function(lang, Box){
                lang.extend(Box, {
                    renderBox: thisB.box_renderBox,
                    colorShift: thisB.box_colorShift,
                    zeroPad: thisB.box_zeroPad
                });
            });
        });      
    },
    segments_renderFeature: function( context, fRect ) {
        //console.log("SegmentsEx.renderFeature fRect ");
    
        if( this.track.displayMode != 'collapsed' )
            context.clearRect( Math.floor(fRect.l), fRect.t, Math.ceil(fRect.w), fRect.h );
        
        //this.renderConnector( context,  fRect );
        this.renderSegments( context, fRect );
        this.renderIntrons(context,fRect);
        this.renderLabel( context, fRect );
        this.renderDescription( context, fRect );
        this.renderArrowhead( context, fRect );
    },

    segments_renderIntrons: function( context, fRect ) {
        //console.log("SegmentsEx.renderIntrons()");
        // get the parts and sort them
        var subparts = this._getSubparts( fRect.f );

        //console.log("subparts.length="+subparts.length+' of '+subparts[0].data.transcript_id);
        //console.dir(subparts);
        if (subparts.length <=1) return;

        subparts.sort(function(a, b){ return a.get('start')-b.get('start'); });    

        //test - set to 1 to display
        /*if (0) {
            for (var i = 0; i < subparts.length; ++i) {
                console.log(subparts[i].get("type")+','+subparts[i].get("start")+','+subparts[i].get("end"));
        }*/
        
        // find the gaps
        var viewInfo = fRect.viewInfo;

        for(var i=0; i< subparts.length-1;++i) {
            var gap = subparts[i+1].get('start')-subparts[i].get('end');
            if (gap > 2) {
                //console.log("gap of "+gap+" between "+i+" and "+(i+1));
                // render intron

                var a_left  = viewInfo.block.bpToX( subparts[i].get('start') );
                var a_width = viewInfo.block.bpToX( subparts[i].get('end') ) - a_left;

                var b_left  = viewInfo.block.bpToX( subparts[i+1].get('start') );
                var b_width = viewInfo.block.bpToX( subparts[i+1].get('end') ) - b_left;

                //console.log("A: "+a_left+","+a_width+",B: "+b_left+","+b_width);
                //console.log("gap: "+left+","+width);

                var top = fRect.t;
                var overallHeight = fRect.rect.h;

                var _height = this._getFeatureHeight( viewInfo, subparts[i] );
                if( ! _height )
                    return;
                if( _height != overallHeight )
                    top += Math.round( (overallHeight - _height)/2 );

                var height = _height / 2;
                var left = a_left+a_width;
                var width = b_left - left;
                var mid = width/2;

                // butt line cap (top line)
                context.beginPath();
                context.moveTo(left,top+height);
                context.lineTo(left+mid,top+1);
                context.lineTo(left+width,top+height);
                context.lineWidth = 1;
                context.strokeStyle = '#202020';
                context.lineCap = 'square';
                context.stroke();            

            }
        }
    },
    box_renderBox: function( context, viewInfo, feature, top, overallHeight, parentFeature, style ) {
        //console.log("BoxEx.renderBox("+top+","+overallHeight+")");
        //console.dir(feature);
        //console.dir(viewInfo);

        
        var left  = viewInfo.block.bpToX( feature.get('start') );
        var width = viewInfo.block.bpToX( feature.get('end') ) - left;
        //left = Math.round( left );
        //width = Math.round( width );

        style = style || lang.hitch( this, 'getStyle' );

        var height = this._getFeatureHeight( viewInfo, feature );
        if( ! height )
            return;
        if( height != overallHeight )
            top += Math.round( (overallHeight - height)/2 );

        // background
        var bgcolor = style( feature, 'color' );
        bgcolor = getColorHex(bgcolor);
        
        var type = feature.get('type');
        
        // is UTR
        if (typeof(type) !== "undefined" && type.indexOf('UTR') > -1) {
            context.fillStyle = "#fdfdfd";//this.colorShift(bgcolor,4.5);
        }
        else {
            //if (feature.get('type')==="CDS") bgcolor = this.colorShift(bgcolor,0);

            // Create gradient

//            var grd = context.createLinearGradient(left, top, left, top+height);

//            // Add colors
//            grd.addColorStop(0.000, bgcolor);
//            grd.addColorStop(0.500,this.colorShift(bgcolor,2.5));
//            grd.addColorStop(0.999, bgcolor);

//            // Fill with linear 
            context.fillStyle = bgcolor;
           
        }

        if( bgcolor ) {
            //context.fillStyle = bgcolor;
            context.fillRect( left, top, Math.max(1,width), height );
        }
        else {
            context.clearRect( left, top, Math.max(1,width), height );
        }

        //console.log("BoxEx.renderBox() l,t,w,h,c: "+left+", "+top+", "+width+", "+height+", "+bgcolor);

        // foreground border
        var borderColor, lineWidth;
        if (typeof(type) !== "undefined" && type.indexOf('UTR') > -1) {
            lineWidth = 1;
            borderColor = "#b0b0b0";
            if( width > 3 ) {
                context.lineWidth = lineWidth;
                context.strokeStyle = bgcolor; //borderColor;
                context.strokeRect( left+lineWidth/2, top+lineWidth/2, width-lineWidth, height-lineWidth );
            }
        }
        else if( (borderColor = style( feature, 'borderColor' )) && ( lineWidth = style( feature, 'borderWidth')) ) {
            if( width > 3 ) {
                context.lineWidth = lineWidth;
                context.strokeStyle = borderColor;

                // need to stroke a smaller rectangle to remain within
                // the bounds of the feature's overall height and
                // width, because of the way stroking is done in
                // canvas.  thus the +0.5 and -1 business.
                context.strokeRect( left+lineWidth/2, top+lineWidth/2, width-lineWidth, height-lineWidth );
            }
            else {
                
                context.globalAlpha = lineWidth*2/width;
                context.fillStyle = borderColor;
                context.fillRect( left, top, Math.max(1,width), height );
                context.globalAlpha = 1;
            }
        }
        //console.log(feature.get('type')+": "+feature.get('start')+',' + feature.get('end') +',' + feature.get('strand')+', color '+bgcolor+' '+getColorHex(bgcolor)+', '+height+', '+lineWidth+' '+borderColor);
    },
    /**
     * Given color string in #rrggbb format, shift the color by shift %  ( i.e. .20 is 20% brighter, -.30 is 30% darker.
     * The new string is returned.
     * If color is not in #rrggbb format, just return the original value. 
     */
    box_colorShift: function(color,shift) {
        
        //console.log("color "+color);
        // check for correct formatting
        if (color.substring(0,1) !== "#" || color.length !== 7 ) return color;
        
        var rstr = color.substring(1,3);
        var gstr = color.substring(3,5);
        var bstr = color.substring(5,7);
        
        //console.log("color "+rstr+" "+gstr+" "+bstr);
        
        var r = parseInt(rstr, 16); 
        var g = parseInt(gstr, 16); 
        var b = parseInt(bstr, 16); 
        //console.log("dec color "+r+" "+g+" "+b);
        r += Math.round(r*shift);
        g += Math.round(g*shift);
        b += Math.round(b*shift);
        //console.log("dec color "+r+" "+g+" "+b);

        r = Math.min(255,r);
        g = Math.min(255,g);
        b = Math.min(255,b);

        rstr = this.zeroPad(r);
        gstr = this.zeroPad(g);
        bstr = this.zeroPad(b);

        var newcolor = "#"+rstr+gstr+bstr;
        //console.log("newcolor "+newcolor);
        return newcolor;
        
    },
    
    box_zeroPad: function(num) {
        var num1 = "00" + num.toString(16);
        var numstr = num1.substr(num1.length-2);
        return numstr;
    }
});
});

function componentFromStr(numStr, percent) {
    var num = Math.max(0, parseInt(numStr, 10));
    return percent ?
        Math.floor(255 * Math.min(100, num) / 100) : Math.min(255, num);
}

function getColorHex(color) {
    if (color.indexOf('#') > -1) return color;
    if (color.indexOf('rgba') > -1) return rgbToHex(color);
    if (color.indexOf('rgb') > -1) return rgbaToHex(color);
    return colourNameToHex(color);
}
function rgbToHex(rgb) {
    if (rgb.indexOf("rgba") > -1)
        return rgbaToHex(rgb);
    
    var rgbRegex = /^rgb\(\s*(-?\d+)(%?)\s*,\s*(-?\d+)(%?)\s*,\s*(-?\d+)(%?)\s*\)$/;
    var result, r, g, b, hex = "";
    if ( (result = rgbRegex.exec(rgb)) ) {
        r = componentFromStr(result[1], result[2]);
        g = componentFromStr(result[3], result[4]);
        b = componentFromStr(result[5], result[6]);
    
        hex = "#" + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    return hex;
}
function rgbaToHex(rgb) {
    var rgbRegex = /^rgba\(\s*(-?\d+)(%?)\s*,\s*(-?\d+)(%?)\s*,\s*(-?\d+)(%?)\s*,\s*(-?\d+)(%?)\s*\)$/;
    var result, r, g, b, hex = "";
    if ( (result = rgbRegex.exec(rgb)) ) {
        r = componentFromStr(result[1], result[2]);
        g = componentFromStr(result[3], result[4]);
        b = componentFromStr(result[5], result[6]);
    
        hex = "#" + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    return hex;
}
function colourNameToHex(colour)  {
    var colours = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
    "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887",
    "cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff",
    "darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f",
    "darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkturquoise":"#00ced1",
    "darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dodgerblue":"#1e90ff",
    "firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff",
    "gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f",
    "honeydew":"#f0fff0","hotpink":"#ff69b4",
    "indianred ":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c",
    "lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2",
    "lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightsteelblue":"#b0c4de",
    "lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6",
    "magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
    "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5",
    "navajowhite":"#ffdead","navy":"#000080",
    "oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
    "palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080",
    "red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1",
    "saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4",
    "tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0",
    "violet":"#ee82ee",
    "wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5",
    "yellow":"#ffff00","yellowgreen":"#9acd32"};

    if (typeof colours[colour.toLowerCase()] != 'undefined')
        return colours[colour.toLowerCase()];

    return "#000000";
}
