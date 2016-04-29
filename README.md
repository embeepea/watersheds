Watersheds
==========

This is an interactive map that shows the topological relationships between
the USGS level 12 hydrologic units for the United States (see
https://water.usgs.gov/GIS/huc.html).

You can see this application online at http://watersheds.fernleafinteractive.com.

It follows the cursor as you move it, always coloring the region upstream
of the cursor position red, and the downstream region blue.

Zoom in on some place on the Mississippi River (or any other river),
and hover the mouse exactly over the river to see an example.

Development
===========

If you want to tinker with the source code and/or run this application
locally, here's what to do:

  1. Make sure you have *npm* and *nodejs* installed.
  2. If you don't already have *webpack* installed, install it
     with the command `npm install -g webpack`.
  3. Clone this repo, and `cd` into it.
  4. `git submodule update --init --recursive`
  5. `npm install`
  6. `npm run dev`, and leave it running.
  7. Browse to http://localhost:8080; as long as `npm run dev`
     is still running, changes to the source `*.js` files
     get pushed to your browser automatically.
  8. Interrupt `npm run dev` at any time with `ctrl-C`.
  9. `npm run build` to generate the compiled `watersheds.js` file
     for deploying as a static asset (`npm run dev` does not
     do this).
   
Mobile Version
==============

The program works differently on mobile devices than it does in desktop browsers.
The desktop version pre-loads a big data file containing all the watershed shapes
and relationships, and draws them dynamically in response to mouse motions.
In the desktop version, once the data file has been downloaded, everything
happens in the client (except for the map tiles, of course).

The mobile version does not pre-download any data.  Instead, it just creates
a Leaflet map, and when the user taps the map, it initiates a request to
a service (at http://watershed-location-service.fernleafinteractive.com/huc12)
to get the id of the HUC12 region under the tap location, and then fetches a
topojson file from Amazon S3 containing the geometry of the selected region,
and its upstream and downstream polygons.  Each tap on the map results in
a new request for a HUC12 id, followed by a new request to S3 for a topojson
file for the tapped location.  Most of these topojson files are very small,
which allows the download and rendering to happen very quickly.
