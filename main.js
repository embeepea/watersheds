require('./style.css');
require('./libs/leaflet/leaflet.js');
require('./libs/leaflet/leaflet.css');
require('./libs/Leaflet.CanvasLayer/leaflet_canvas_layer.js');
require('./libs/stamen/tile.stamen.js');
var topojson = require('topojson');
var sprintf = require('sprintf');
var tu = require('./topojson-utils.js');
var URL = require('./url.js');

// A note about terminology:
// 
// Watershed regions in the Watershed Boundary Dataset
// (http://nhd.usgs.gov/wbd.html) are called "hydrologic units".  The
// dataset contains a hierarchy of 6 levels of these regions.  The
// regions in each level of the hierarchy exactly subdivide the
// regions in the previous level, and the regions in each level
// completely cover the US.  Each level is typically referred to by
// the number of digits in the region id code system it uses, which
// are 2, 4, 6, 8, 10, and 12.  This program only deals with the
// level-12 regions, which are the most detailed.
//
// In the code below, the term "HUC" stands for "hydrologic unit code"
// and is used to refer to a level 12 region and/or its 12-digit
// id code.  Sometimes the term HUC12 is used explicitly, but in all
// cases the only HUCs used here are the ones in level 12.

var watersheds = {
    // are we running on a mobile device?:
    isMobile: !!(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)),

    // stores topojson HUC12 geom objects by id string:
    geomByH12Code: {},

    // stores topojson upstream geom objects by id string:
    upstreamGeomByH12Code: {},

    // when the display is "frozen", cursor movement does not trigger a change in
    // the currently displayed watershed
    isFrozen: false,

    // Launch the appliation with the given options.  Options are:
    //   required:
    //     completeDataFileUrl
    //     mobileWatershedLocationService
    //     mobileDataUrlPrefix
    //   optional:
    //     mapCenter
    //     mapZoom
    // Note that the mapCenter and mapZoom values, even if specified, are always
    // overridden by values specified in the URL used to launch the application,
    // if that URL contains those values.
    launch: function(options) {
        if (options.displayUrlBanner) {
            $("#urlcontainer").removeClass("display-none");
        }
        $("#helpscreen").hide();
        $("#helpbutton").click(function() {
            watersheds.displayHelp();
        });
        var optionDefaults = {
            mapCenter: [39.232253141714885, -95.8447265625],
            mapZoom:   4
        };
        options = $.extend({}, optionDefaults, options);
        var div = options.div;
        if (div instanceof jQuery) {
            div = div[0];
        }

        var bgLayer;

        if (options.mapBackgroundLayerFunc) {
            bgLayer = options.mapBackgroundLayerFunc(L);
        } else {
            bgLayer = new L.StamenTileLayer("terrain");
        }

        watersheds.map = L.map(div, {
            attributionControl: false,
            maxZoom: 14,
            minZoom: 2,
            layers: [bgLayer],
            zoomControl: false,
            zoomAnimation: watersheds.isMobile   // should be true on mobile, false elsewhere
        });
        var credits = L.control.attribution({
            position: "bottomright"
        }).addTo(watersheds.map);

        if (options.mapAttributionsFunc) {
            options.mapAttributionsFunc(credits);
        }

        credits.addAttribution('<a href="http://nhd.usgs.gov/wbd.html">Watershed Boundary Dataset</a> by USGS');

        watersheds.where = function() {
            console.log(JSON.stringify({
                center: watersheds.map.getCenter(),
                zoom: watersheds.map.getZoom()
            }));
        };
        if (!watersheds.isMobile) {
            // don't show zoom control on mobile devices
            L.control.zoom({ position: 'topright' }).addTo(watersheds.map);
        }
        if (watersheds.isMobile) {
            // move FLI logo and help button up a bit, because leaflet attribution
            // wraps to 2 lines on phones
            $("#helpbutton").removeClass("helpbutton-y");
            $("#helpbutton").addClass("helpbutton-mobile-y");
            $("#fli-logo").removeClass("fli-logo-y");
            $("#fli-logo").addClass("fli-logo-mobile-y");
        }
        watersheds.permalink = Permalink(URL({url: window.location.toString()}));
        if (!watersheds.permalink.haveZoom()) {
            watersheds.permalink.setZoom(options.mapZoom);
        }
        if (!watersheds.permalink.haveCenter()) {
            watersheds.permalink.setCenter(options.mapCenter);
        }
        watersheds.map.setView(watersheds.permalink.getCenter(), watersheds.permalink.getZoom());
        watersheds.map.on('move', function(e) {
            var c = watersheds.map.getCenter();
            watersheds.permalink.setCenter([c.lat,c.lng]);
            watersheds.permalink.setZoom(watersheds.map.getZoom());
            window.history.replaceState({}, "", watersheds.permalink.toString());
        });
        if (watersheds.isMobile) {
            watersheds.addMobileLayers();
        } else {
            watersheds.addCanvasLayer();
        }
        if (watersheds.isMobile) {
            $('#map').removeClass("dimmed");
            $('#splashmessage').hide();
            watersheds.mobileDataUrlPrefix = options.mobileDataUrlPrefix;
            watersheds.map.on('click', function(e) {
                var ll = e.latlng;
                watersheds.mobileLayers.huc12.clearLayers();
                watersheds.mobileLayers.upstream.clearLayers();
                watersheds.mobileLayers.downstream.clearLayers();
                $.ajax({
                    url: sprintf("%s/%f,%f", options.mobileWatershedLocationService, ll.lng, ll.lat),
                    dataType: 'text',
                    method: 'GET',
                    success: watersheds.setMobileTargetId
                });
            });
            if (watersheds.permalink.haveId()) {
                watersheds.setMobileTargetId(watersheds.permalink.getId());
                watersheds.splashmessage(watersheds.permalink.getId(), 1500);
                watersheds.splashmessage("<center>Tap to change<br>watersheds</center>", 2000);
            } else {
                watersheds.splashmessage("<center>Tap to see<br>watersheds</center>", 2000);
            }
        } else {
            watersheds.loadCompleteData(options.completeDataFileUrl, function() {
                watersheds.map.on('mousemove', function(e) {
                    if (!watersheds.isFrozen) {
                        var ll = e.latlng;
                        watersheds.setTargetHucFromLonLat([ll.lng, ll.lat]);
                    }
                    watersheds.canvasLayer.render();
                });
                watersheds.map.on('click', function(e) {
                    //if (watersheds.targetHuc) {
                    //    console.log(watersheds.targetHuc.id);
                    //}
                    watersheds.isFrozen = !watersheds.isFrozen;
                });
                if (watersheds.permalink.haveId()) {
                    if (watersheds.permalink.getId() in watersheds.geomByH12Code) {
                        watersheds.targetHuc = watersheds.geomByH12Code[watersheds.permalink.getId()];
                        watersheds.isFrozen = true;
                        watersheds.canvasLayer.render();
                    }
                    watersheds.splashmessage("<center>Click to change watersheds</center>", 1500);
                } else {
                    watersheds.splashmessage("<center>Move the cursor to<br>see watersheds</center>", 1500);
                }
                $('#map').hide();
                $('#map').removeClass("dimmed");
                $('#map').fadeIn(750);
            });
        }

    },

    // temporarily display a message in the splash dialog box
    splashmessage: function(text, showMS) {
        if (showMS === undefined) { showMS = 1000; }
        $('#splashmessage').html(text);
        $('#splashmessage').show();
        setTimeout(function() {
            $('#splashmessage').fadeOut(1000, function() {
                $('#splashmessage').hide();
            });
        }, showMS);
    },

    // Run the function f on the given HUC12 id, and then recursively
    // on its downstream HUC12 id.  Silently do nothing if an id
    // is its own downstream (tohuc).
    downstream: function(id, f) {
        if ((id in watersheds.tohuc) && (id === watersheds.tohuc[id])) { return; }
        f(id);
        if (id in watersheds.tohuc) {
            watersheds.downstream(watersheds.tohuc[id],  f);
        }
    },

    // Draw a topojson polygon on the given HTML5 canvas context.  This function
    // just takes care of the path traversal (beginPath, moveTo, lineTo, closePath)
    // part of the drawing.  It's up to the caller to make any relevant style settings
    // before calling this, and to call fill() or stroke() afterwards as desired.
    renderPolygon: function (ctx, poly, topo) {
        poly.forEach(function(ring) {
            var first = true;
            ring.forEach(function(i) {
                tu.walkArc(topo, i, watersheds.map, ctx, first);
                first = false;
            });
            ctx.closePath();
        });
    },

    // Same as renderPolygon above, but only traverses the polygon's exterior
    // (first) ring:
    renderPolygonExteriorRing: function (ctx, poly, topo) {
        var ring = poly[0];
        var first = true;
        ring.forEach(function(i) {
            tu.walkArc(topo, i, watersheds.map, ctx, first);
            first = false;
        });
        ctx.closePath();
    },

    // Draw a topojson geom object (Polygon or MultiPolygon) on the given HTML5
    // canvas context, using the given style settings.
    renderHucWithStyle: function(ctx, geom, style) {
        if ('fillStyle' in style) {
            ctx.fillStyle   = style.fillStyle;
            ctx.beginPath();
            if (geom.type === "Polygon") {
                watersheds.renderPolygon(ctx, geom.arcs, watersheds.h12Topo);
            } else if (geom.type === "MultiPolygon") {
                geom.arcs.forEach(function(polygon) {
                    watersheds.renderPolygon(ctx, polygon, watersheds.h12Topo);
                });
            }
            ctx.fill();
        }
        if (style.lineWidth > 0) {
            ctx.strokeStyle = style.strokeStyle;
            ctx.beginPath();
            if (geom.type === "Polygon") {
                watersheds.renderPolygonExteriorRing(ctx, geom.arcs, watersheds.h12Topo);
            } else if (geom.type === "MultiPolygon") {
                geom.arcs.forEach(function(polygon) {
                    watersheds.renderPolygonExteriorRing(ctx, polygon, watersheds.h12Topo);
                });
            }
            ctx.stroke();
        }
    },

    // Load the complete data file that contains all the HUC12 regions, upstream polygons,
    // and region topology ("tohuc" mapping)
    loadCompleteData: function (completeDataFileUrl, doneFunc) {
        var requests = [
            $.ajax({
                url: completeDataFileUrl,
                dataType: 'json',
                method: 'GET',
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('error');
                    console.log(textStatus);
                    console.log(errorThrown);
                },
                success: function(data) {
                    var topo = data.topo;
                    topo.decodedArcs = topo.arcs.map(function(arc) { return tu.decodeArc(topo, arc); });
                    topo.objects['huc12'].geometries.forEach(function(geom) {
                        if (geom.id) {
                            watersheds.geomByH12Code[geom.id] = geom;
                        }
                        geom.bBox = tu.geomBBox(geom, topo);
                    });
                    topo.objects['upstream'].geometries.forEach(function(geom) {
                        if (geom.id) {
                            watersheds.upstreamGeomByH12Code[geom.id] = geom;
                        }
                    });
                    watersheds.h12Topo = topo;
                    watersheds.tohuc = data.tohuc;
                    doneFunc();
                }
            })
        ];
    },

    // The mobile version doesn't use HTML5 canvas, since it does do fast rendering.
    // Instead, it creates a few GeoJSON layers and modifies their contents in response
    // to taps.  This function creates those layers.
    addMobileLayers: function() {
        watersheds.mobileLayers = {
            huc12: L.geoJson(undefined, {
                clickable: false,
                style: function (feature) {
                    return {
                        weight: 1,
                        color: tu.rgba(0,0,0,1.0),
                        opacity: 1.0,
                        fillColor: tu.rgba(255,255,0,0.3),
                        fillOpacity: 1.0
                    };
                }}),
            upstream: L.geoJson(undefined, {
                clickable: false,
                style: function (feature) {
                    return {
                        weight: 1,
                        color: tu.rgba(0,0,0,1.0),
                        opacity: 1.0,
                        fillColor: tu.rgba(255,0,0,0.3),
                        fillOpacity: 1.0
                    };
                }}),
            downstream: L.geoJson(undefined, {
                clickable: false,
                style: function (feature) {
                    return {
                        weight: 1,
                        color: tu.rgba(0,0,0,1.0),
                        opacity: 1.0,
                        fillColor: tu.rgba(0,0,255,0.6),
                        fillOpacity: 1.0
                    };
                }})
        };
        watersheds.map.addLayer(watersheds.mobileLayers.huc12);
        watersheds.map.addLayer(watersheds.mobileLayers.upstream);
        watersheds.map.addLayer(watersheds.mobileLayers.downstream);
    },

    // Create the HTML5 Canvas layer for super fast rendering on the desktop version
    addCanvasLayer: function() {
        watersheds.canvasLayer = new (L.CanvasLayer.extend({
            render: function() {
                var map = this._map;
                var canvas = this.getCanvas();
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (watersheds.targetHuc) {
                    watersheds.renderHucWithStyle(ctx, watersheds.targetHuc, {
                        lineWidth: 1,
                        strokeStyle: tu.rgba(0,0,0,1.0),
                        fillStyle: tu.rgba(255,255,0,0.3)
                    });
                    if (watersheds.upstreamGeomByH12Code[watersheds.targetHuc.id]) {
                        watersheds.renderHucWithStyle(ctx, 
                                                      watersheds.upstreamGeomByH12Code[watersheds.targetHuc.id],
                                                      {
                                                          lineWidth: 1,
                                                          strokeStyle: tu.rgba(0,0,0,1.0),
                                                          fillStyle: tu.rgba(255,0,0,0.3)
                                                      });
                    }
                    if (watersheds.tohuc[watersheds.targetHuc.id]) {
                        watersheds.downstream(watersheds.tohuc[watersheds.targetHuc.id], function(id) {
                            if (watersheds.geomByH12Code[id]) {
                                watersheds.renderHucWithStyle(ctx, 
                                                              watersheds.geomByH12Code[id],
                                                              {
                                                                  //lineWidth: 0,
                                                                  lineWidth: 1,
                                                                  strokeStyle: tu.rgba(0,0,255,1.0),
                                                                  fillStyle: tu.rgba(0,0,255,0.6)
                                                              });
                            }
                        });
                    }

                }
            }
        }))();
        watersheds.map.addLayer(watersheds.canvasLayer);
    },

    // Set the target HUC based on a given p = [lon,lat] position.  The desktop version
    // calls this every time the mouse moves:
    setTargetHucFromLonLat: function(p) {
        watersheds.targetHuc = null;
        var bds = watersheds.map.getBounds();
        var extent = [[bds.getWest(), bds.getEast()],[bds.getSouth(),bds.getNorth()]];
        watersheds.h12Topo.objects['huc12'].geometries.forEach(function(geom) {
            if (tu.boxesOverlap(geom.bBox, extent)) {
                if (tu.boxContainsPoint(geom.bBox, p)) {
                    if (tu.isPointInGeom(p, geom, watersheds.h12Topo)) {
                        watersheds.targetHuc = geom;
                        watersheds.permalink.setId(geom.id);
                        window.history.replaceState({}, "", watersheds.permalink.toString());
                    }
                }
            }
        });
    },

    // Mobile version only: set the target HUC to a given id.  The mobile version calls this
    // after getting the id of the tapped location from the location service.
    setMobileTargetId: function(id) {
        var targetHucId = id.trim();
        if (targetHucId !== "") {
            //targetHucId = "060101040210";
            $.ajax({
                url: sprintf("%s/%s.topojson", watersheds.mobileDataUrlPrefix, targetHucId),
                dataType: 'json',
                method: 'GET',
                success: function(topo) {
                    watersheds.permalink.setId(targetHucId);
                    if (topo.objects.huc12) {
                        watersheds.mobileLayers.huc12.addData(
                            topojson.feature(topo,
                                             topo.objects.huc12.geometries[0]));
                    }
                    if (topo.objects.upstream) {
                        watersheds.mobileLayers.upstream.addData(
                            topojson.feature(topo,
                                             topo.objects.upstream.geometries[0]));
                    }
                    if (topo.objects.downstream) {
                        watersheds.mobileLayers.downstream.addData(
                            topojson.feature(topo,
                                             topo.objects.downstream.geometries[0]));
                    }
                }});
        }
    },

    // display the help screen
    displayHelp: function() {
        $.ajax({
            dataType: "text",
            method: "GET",
            url: watersheds.isMobile ? "help.mobile.html" : "help.desktop.html",
            success: function(text) {
                $("div.helpinset").html(text);
                if (watersheds.isMobile) {
                    $("div.helpinset").css({"font-size": "16pt"});
                }
                $("div.helpinset .closebutton").click(function() {
                    watersheds.hideHelp();
                });
                $("#helpscreen").show();
            }
        });
    },

    // hide the help screen
    hideHelp: function() {
        $("#helpscreen").hide();
    }

};

// A utility object for constructing and extracting information from the
// application URL:
function Permalink(url) {
    var center = null, zoom = null, id = null;
    if ('zoom' in url.params) {
        zoom = parseInt(url.params.zoom, 10);
    }
    if ('center' in url.params) {
        center = url.params.center.split(',').map(function(s) { return parseFloat(s); });
    }
    if ('id' in url.params) {
        id = url.params.id;
    }
    return {
        'toString' : function() { return url.toString(); },
        'haveCenter' : function() { return center !== null; },
        'getCenter'  : function() { return center; },
        'setCenter'  : function(c) {
            center = c;
            url.params.center = sprintf("%.4f", center[0]) + "," + sprintf("%.4f", center[1]);
        },
        'haveZoom' : function() { return zoom !== null; },
        'getZoom'  : function() { return zoom; },
        'setZoom'  : function(z) {
            zoom = z;
            url.params.zoom = zoom.toString();
        },
        'haveId'   : function() { return id !== null; },
        'getId'    : function() { return id; },
        'setId'    : function(newId) {
            id = newId;
            url.params.id = id;
        }
    };
}

window.watersheds = watersheds;
