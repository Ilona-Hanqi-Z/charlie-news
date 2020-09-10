'use strict';

const APIBridge = require('api-bridge');
const Versioner =  module.exports = new APIBridge({
	path: './bridges/bridge.json',
	versionKey: 'version'
});

{ // v2.1.0: Define setHighlightRating
	let bridge = Versioner.getBridge('2.1.0');
	bridge.setModels('setHighlightRating', function(gallery) {
		// Gallery rating of 2 = "Verified"
		if (gallery.rating === 2 && gallery.highlighted_at != null) {
			gallery.rating = 3;
		}

		return gallery;
	});
}

{ // v2.2.0: stripMRSSNamespaces
	let bridge = Versioner.getBridge('2.2.0');
	bridge.setModels('stripMRSSNamespaces', function(mrss) {
	    return mrss
            .replace(/fresco:itemcount/g, 'itemcount')
            .replace(/atom:link/g, 'link');
    });
}