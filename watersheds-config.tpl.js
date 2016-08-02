// To run the watersheds application yourself, make a copy of this file
// named `watersheds-config.js`, and edit the settings below appropriately.

window.watershedsConfig = {
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
