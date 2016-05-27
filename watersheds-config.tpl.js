// To run the watersheds application yourself, make a copy of this file
// named `watersheds-config.js`, and edit the settings below appropriately.
//
// The one thing that you MUST change in order for the program to work
// is the mapbox access token. The program requires a valid Mapbox
// access token -- it uses this to fetch the map background tiles from
// Mapbox.  You will need to get your own Mapbox access token and
// insert it below; see www.mapbox.com for details.

window.watershedsConfig = {
    // insert your mapbox token here:
    mapboxToken: "YOUR MAPBOX API KEY HERE",

    //
    // The remaining settings below will work as they are, but if you
    // want to customize them, this is the place to do it.
    //

    // The url of the complete (large, 50MB) data file downloaded at
    // launch by the desktop version.  This file is included with the
    // source code but you can force the application to get it from
    // a different location by specifying a URL here:
    completeDataFileUrl: "data/data.json",

    // URL of the location service that the mobile version uses to get
    // the HUC12 id code for a given tapped longitude/latitude
    // location; should NOT end with a "/":
    mobileWatershedLocationService: "http://watershed-location-service.fernleafinteractive.com/huc12",

    // URL of the location where the mobile version can download
    // individual topojson files containing the upstream and
    // downstream polygons for each HUC12 id; should NOT end with a "/":
    mobileDataUrlPrefix: "https://s3.amazonaws.com/data.watersheds.fernleafinteractive.com/mobile"
};
