require('./style.css');
require('./libs/leaflet/leaflet.js');
require('./libs/leaflet/leaflet.css');
require('./libs/Leaflet.CanvasLayer/leaflet_canvas_layer.js');

var sprintf = require('sprintf');
var tu = require('./topojson_utils.js');

var watersheds = {
    geomByH12Code: {},
    upstreamGeomByH12Code: {},
    frozen: false,
    //downstream: function(geom, f) {
    //    if (('tohuc' in geom) && (geom.id === geom.tohuc)) { return; }
    //    f(geom);
    //    if (geom.tohuc in watersheds.geomByH12Code) {
    //        watersheds.downstream( watersheds.geomByH12Code[geom.tohuc],  f);
    //    }
    //},
    downstream: function(id, f) {
        if ((id in watersheds.tohuc) && (id === watersheds.tohuc[id])) { return; }
        f(id);
        if (id in watersheds.tohuc) {
            watersheds.downstream(watersheds.tohuc[id],  f);
        }
    },

    renderPolygon: function (ctx, geom, topo) {
        geom.forEach(function(ring) {
            var first = true;
            ring.forEach(function(i) {
                tu.walkarc(topo, i, watersheds.map, ctx, first);
                first = false;
            });
            ctx.closePath();
        });
    },

    renderPolygonExteriorRing: function (ctx, geom, topo) {
        var ring = geom[0];
        var first = true;
        ring.forEach(function(i) {
            tu.walkarc(topo, i, watersheds.map, ctx, first);
            first = false;
        });
        ctx.closePath();
    },

    renderHucWithStyle: function(ctx, geom, style) {
        /*
        if ('fillStyle' in style) {
            ctx.fillStyle   = style.fillStyle;
        }
        if (style.lineWidth > 0) {
            ctx.strokeStyle = style.strokeStyle;
        }
        ctx.beginPath();
        if (geom.type === "Polygon") {
            watersheds.renderPolygon(ctx, geom.arcs, watersheds.h12Topo);
        } else if (geom.type === "MultiPolygon") {
            geom.arcs.forEach(function(polygon) {
                watersheds.renderPolygon(ctx, polygon, watersheds.h12Topo);
            });
        }
        if ('fillStyle' in style) { ctx.fill(); }
        if (style.lineWidth > 0) { ctx.stroke(); }
         */

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

    loadData: function () {
        var requests = [
            $.ajax({
//                url: 'data/h12_upstreams.topojson',
                //url: 'data/newall2.topojson',
                url: 'data/data.json',
                dataType: 'json',
                method: 'GET',
                success: function(data) {
                    var topo = data.topo;
                    topo.decodedArcs = topo.arcs.map(function(arc) { return tu.decodeArc(topo, arc); });
                    topo.objects['huc12'].geometries.forEach(function(geom) {
                        if (geom.id) {
                            watersheds.geomByH12Code[geom.id] = geom;
                        }
                        geom.bbox = tu.geom_bbox(geom, topo);
                    });
                    topo.objects['upstream'].geometries.forEach(function(geom) {
                        if (geom.id) {
                            watersheds.upstreamGeomByH12Code[geom.id] = geom;
                        }
                    });
                    watersheds.h12Topo = topo;
                    watersheds.tohuc = data.tohuc;
                    console.log('ready');
                }
            })
        ];
    },

     addCanvasLayer: function() {
        var canvasLayer = new (L.CanvasLayer.extend({
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

                        //watersheds.downstream(watersheds.geomByH12Code[watersheds.targetHuc.tohuc], function(geom) {
                        //    watersheds.renderHucWithStyle(ctx, 
                        //                                  geom,
                        //                                  {
                        //                                      //lineWidth: 0,
                        //                                      lineWidth: 1,
                        //                                      strokeStyle: tu.rgba(0,0,255,1.0),
                        //                                      fillStyle: tu.rgba(0,0,255,0.6)
                        //                                  });
                        //});


                    }

                }
            }
        }))();
        watersheds.map.addLayer(canvasLayer);
        watersheds.map.on('mousemove', function(e) {
            if (!watersheds.frozen) {
                var ll = e.latlng;
                watersheds.setTargetHuc([ll.lng, ll.lat]);
            }
            canvasLayer.render();
        });
        watersheds.map.on('click', function(e) {
            if (watersheds.targetHuc) {
                console.log(watersheds.targetHuc.id);
            }
            watersheds.frozen = !watersheds.frozen;
        });
    },

    setTargetHuc: function(p) {
        watersheds.targetHuc = null;
        var bds = watersheds.map.getBounds();
        var extent = [[bds.getWest(), bds.getEast()],[bds.getSouth(),bds.getNorth()]];
        watersheds.h12Topo.objects['huc12'].geometries.forEach(function(geom) {
            if (tu.boxes_overlap(geom.bbox, extent)) {
                if (tu.box_contains_point(geom.bbox, p)) {
                    if (tu.point_in_geom2d(p, geom, watersheds.h12Topo)) {
                        watersheds.targetHuc = geom;
                    }
                }
            }
        });
    },

    launch: function(options) {
        var where = {"center":{"lat":36.04021586880111,"lng":-83.5455322265625},"zoom":9};
        var defaults = {
            // // center of conus, zoomed out to see almost all of it:
            // map_center: [39.0,-99.0],
            // map_zoom:   5
            // NC:
            map_center: [where.center.lat, where.center.lng],
            map_zoom:   where.zoom
        };
        options = $.extend({}, defaults, options);
        var div = options.div;
        if (div instanceof jQuery) {
            div = div[0];
        }
        var mbUrl = "https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}@2x.png?access_token=" + options.mapbox_token;
        var streets     = L.tileLayer(mbUrl, {id: 'mapbox.streets'}),
            satellite   = L.tileLayer(mbUrl, {id: 'mapbox.streets-satellite'}),
            hydro       = L.tileLayer("http://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroNHD/MapServer/tile/{z}/{y}/{x}");
        var baseLayers = {
            "Streets": streets,
            "Satellite": satellite,
            "Hydrology": hydro
        };
        watersheds.map = L.map(div, {
            attributionControl: false,
            maxZoom: 14,
            minZoom: 2,
            layers: [streets],
            zoomControl: false,
            zoomAnimation: false
        });
        window.where = function() {
            console.log(JSON.stringify({
                center: map.getCenter(),
                zoom: map.getZoom()
            }));
        };
        L.control.attribution({position: 'topright', prefix: ''}).addTo(watersheds.map);
        L.control.zoom({ position: 'topright' }).addTo(watersheds.map);
        watersheds.map.setView(options.map_center, options.map_zoom);
        watersheds.loadData();
        watersheds.addCanvasLayer();

//$.ajax({
////    url: '101900110203.geojson',
//    url: 'nm.geojson',
//    dataType: 'json',
//    method: 'GET',
//    success: function(geoj) {
//console.log(geoj);
//        L.geoJson(geoj).addTo(watersheds.map);
//    }
//});


    }
};

window.watersheds = watersheds;
