var tu = {};

function rgba(r,g,b,a) {
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}
tu.rgba = rgba;
function rgb(r,g,b) {
    return "rgb(" + r + "," + g + "," + b + ")";
}
tu.rgb = rgb;

function ones_complement(x) {
    return -x - 1;
}

function arc_index(i) {
    if (i < 0) { return ones_complement(i); }
    return i;
}

function transformPoint(topology, position) {
  position = position.slice();
  position[0] = position[0] * topology.transform.scale[0] + topology.transform.translate[0];
  position[1] = position[1] * topology.transform.scale[1] + topology.transform.translate[1];
  return position;
};

function decodeArc(topology, arc) {
  var x = 0, y = 0;
  return arc.map(function(position) {
    position = position.slice();
    position[0] = (x += position[0]) * topology.transform.scale[0] + topology.transform.translate[0];
    position[1] = (y += position[1]) * topology.transform.scale[1] + topology.transform.translate[1];
    return position;
  });
}
tu.decodeArc = decodeArc;

function walkarc(topo, i, map, ctx, first) {
    var j, k, reversed, p, pp;
    if (i >= 0) {
        j = i;
        reversed = false;
    } else {
        j = ones_complement(i);
        reversed = true;
    }
    var arc = topo.decodedArcs[j];
    if (first) {
        p = arc[reversed ? arc.length-1 : 0];
        pp = map.latLngToContainerPoint(new L.LatLng(p[1], p[0]));
        ctx.moveTo(pp.x, pp.y);
    }
    for (k=1; k<arc.length; ++k) {
        p = arc[reversed ? arc.length-k-1 : k];
        pp = map.latLngToContainerPoint(new L.LatLng(p[1], p[0]));
        ctx.lineTo(pp.x, pp.y);
    }
}
tu.walkarc = walkarc;

function dfs(arr, f) {
    var i;
    for (i=0; i<arr.length; ++i) {
        if (typeof(arr[i]) === 'number') {
            f(arr[i]);
        } else {
            dfs(arr[i], f);
        }
    }
}

function geom_bbox(g, topo) {
    var bbox = [[null,null],[null,null]];
    dfs(g.arcs, function(i) {
        var arc = topo.decodedArcs[(i >= 0) ? i : ones_complement(i)];
        arc.forEach(function(p) {
            if (bbox[0][0] === null || p[0] < bbox[0][0]) { bbox[0][0] = p[0]; }
            if (bbox[0][1] === null || p[0] > bbox[0][1]) { bbox[0][1] = p[0]; }
            if (bbox[1][0] === null || p[1] < bbox[1][0]) { bbox[1][0] = p[1]; }
            if (bbox[1][1] === null || p[1] > bbox[1][1]) { bbox[1][1] = p[1]; }
        });
    });
    return bbox;
}

tu.geom_bbox = geom_bbox;

function boxes_overlap(a,b) {
    return !(((a[0][0] < b[0][0]) && (a[0][1] < b[0][0]))
             ||
             ((a[0][0] > b[0][1]) && (a[0][1] > b[0][1]))
             ||
             ((a[1][0] < b[1][0]) && (a[1][1] < b[1][0]))
             ||
             ((a[1][0] > b[1][1]) && (a[1][1] > b[1][1])));
}
tu.boxes_overlap = boxes_overlap;

function box_contains_point(box,p) {
    return (p[0] >= box[0][0]) && (p[0] <= box[0][1]) && (p[1] >= box[1][0]) && (p[1] <= box[1][1]);
}
tu.box_contains_point = box_contains_point;

// A 'seq' is an object that produces a sequence of items (aka 'iterator').
// It has a 'next' method which gives the next item, and a 'hasNext' method
// that says whether there are any more items.

// Here's an 'emtpy' seq object:
var empty_seq = {
    next: function() { return undefined; },
    hasNext: function() { return false; }
};

// A 'varray' is an object that acts like an arc in the 'arcs' array,
// in the sense that it consists of an array of vertices.
// It has one function and one property:
//   get(j): return the j-th vertex of the arc
//   length: the number of vertices in the arc
// The input argument i indicates which arc in the 'arcs' array to use;
// negative values of i mean the ones-complement position in reverse order
function varray(i, arcs) {
    var reversed, a, len;
    if (i >= 0) {
        reversed = false;
        a = arcs[i];
    } else {
        reversed = true;
        a = arcs[ones_complement(i)];
    }
    len = a.length;
    return {
        get: function(j) {
            if (reversed) { return a[len-j-1]; }
            return a[j];
        },
        length: len
    };
}

// An "empty" arc is one with no vertices.
// A "degenerate" arc is one with just a single vertex.
// A "nondegenerate" arc is one with more than one vertex.

// Return a sequence of varrays for the nondegenerate arcs in a ring, unless the ring only
// contains degenerate arcs, in which case return a sequence containing a varray for just
// the first degenerate arc from the ring.  Ignores all empty arcs.
function ring_varray_seq(ring, arcs) {
    // ring = [432, 143, 223, ..., 4323]   (array of integers indices into the 'arcs' array)
    var varrays = ring.map(function(i) { return varray(i,arcs); });
    var nonempty_varrays = varrays.filter(function(va) { return va.length > 0; });
    if (nonempty_varrays.length === 0) { return empty_seq; }
    var nondegenerate_varrays = nonempty_varrays.filter(function(va) { return va.length > 1; });
    // remove degenerate arcs from ring, or set it an array of the first degenerate one
    // if they are all degenerate:
    varrays = (nondegenerate_varrays.length > 0) ? nondegenerate_varrays : [nonempty_varrays[0]];
    var ri = -1;
    return {
        next: function() {
            if (this.hasNext()) {
                ++ri;
                return varrays[ri];
            }
            return undefined;
        },
        hasNext: function() {
            return (ri+1 < varrays.length);
        }
    };
}

// Return a seq of the vertices in a ring; each vertex occurs in the seq exactly once.
// (Closing vertices are omitted --- the last vertex in the seq is NOT the same as the first.)
function ring_vertex_seq(ring, arcs) {
    var arc_seq = ring_varray_seq(ring, arcs);
    var current_varray = arc_seq.next();
    var ai = -1;
    // the 'next' vertex in the seq is the one at position ai+1 in the current varray (arc),
    // unless position ai+1 is the last vertex of that arc (in which case we advance
    //   to the next arc if there is one)
    // or unless there is no current arc
    return {
        next: function() {
            if (current_varray === undefined) { return undefined; }
            ++ai;
            if (ai < current_varray.length-1) {
                return current_varray.get(ai);
            }
            current_varray = arc_seq.next();
            ai = -1;
            return this.next();
        },
        hasNext: function() {
            if (current_varray === undefined) { return false; }
            if (ai < current_varray.length-2) { return true; }
            return arc_seq.hasNext();
        }
    };
}

// s is a 'seq' object containing [s0, s1, s2, ..., sN]
// return a new seq object which contains [s0, s1, s2, ..., sN, s0]
// i.e. tacks a copy of s0 onto the end
function close_seq(s) {
    var held = undefined;
    var first = true;
    var done = !s.hasNext();
    return {
        next: function() {
            var e;
            if (s.hasNext()) {
                e = s.next();
                if (first) { held = e; first = false; }
                return e;
            } else if (!done) {
                done = true;
                return held;
            } else {
                return undefined;
            }
        },
        hasNext: function() {
            return !done;
        }
    };
}

// Test whether a point is inside a polygon defined by a single ring.
// 'v' is the point (array of [x,y] coords) to test
// 'ring' is an array of indices into the 'arcs' array, with negative values
//   meaning the ones-complement position in reverse order
// 'arcs' is an array giving the actual arcs; each element of arcs is an array
//   of vertices
function point_in_ring(v, ring, arcs) {
    var vs = close_seq(ring_vertex_seq(ring, arcs));
    // v = [x,y]
    // vs = [[x0,y0],[x1,y1],...,[xn,yn]] (but it's a seq, not an array)
    if (!vs.hasNext()) { return false; }
    var x = v[0], y = v[1];
    var inside = false;
    var xi, yi, xj, yj, p;
    var pPrev = vs.next();
    if (vs.hasNext()) {
        while (vs.hasNext()) {
            p = vs.next();
            xi = pPrev[0];
            yi = pPrev[1];
            xj = p[0];
            yj = p[1];
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
            pPrev = p;
        }
    } else {
        inside = (pPrev[0] === x) && (pPrev[1] === y);
    }
    return inside;
};

// Test whether a point is in a polygon defined by an array of rings; the first
// ring is the polygon exterior, and any subsequent rings are holes.
function point_in_polygon(v, rings, arcs) {
    if (rings.length === 0) { return false; }
    // v must be in exterior ring
    if (!point_in_ring(v, rings[0], arcs)) { return false; }
    // and must not be in any interior ring
    var i;
    for (i=1; i<rings.length; ++i) {
        if (point_in_ring(v, rings[i], arcs)) { return false; }
    }
    return true;
}

// Test whether a point is in a Polygon or MultiPolygon
function point_in_geom2d(p, geom, topo) {
    // if geom is a single polygon, check if p is in it:
    if (geom.type === "Polygon") {
        if (point_in_polygon(p, geom.arcs, topo.decodedArcs)) {
            return true;
        }
    }
    // if geom is a MultiPolygon, check if p is in any
    // of the polygons it contains
    if (geom.type === "MultiPolygon") {
        var j;
        for (j=0; j<geom.arcs.length; ++j) {
            if (point_in_polygon(p, geom.arcs[j], topo.decodedArcs)) {
                return true;
            }
        }
    }
    return false;
}
tu.point_in_geom2d = point_in_geom2d;

function renderPolygon(ctx, map, arcs, rings, style, render) {
    Object.keys(style).forEach(function(attr) {
        ctx[attr] = style[attr];
    });
    render = render || { fill: true, stroke: true };
    ctx.beginPath();
    rings.forEach(function(ring) {
        var first = true;
        ring.forEach(function(i) {
            walkarc(arcs, i, map, ctx, first);
            first = false;
        });
        ctx.closePath();
    });
    if (render.fill) { ctx.fill(); }
    if (render.stroke && style.lineWidth > 0) { ctx.stroke(); }
}

module.exports = tu;

/////////////////////////////////////////////////////////////////////////////////////

topojsonCanvasLayer = function(map, topo, options) {

    var arcs = topo.arcs.map(function(arc) { return decodeArc(topo, arc); });
    // compute bbox for each geom:
    Object.keys(topo.objects).forEach(function(obj_name) {
        topo.objects[obj_name].geometries.forEach(function(geom) {
            geom.bbox = geom_bbox(geom, arcs);
        });
    });


    map.on('mousemove', function(e) {
        var ll = e.latlng;
        var p = [ll.lng, ll.lat];
        var object_name = options.zoomLevelToClickLayerName(map.getZoom());
        var geoms, i, geom;
        if (object_name) {
            geoms = topo.objects[object_name].geometries;
            for (i=0; i<geoms.length; ++i) {
                geom = geoms[i];
                // if p is not in geom's bbox, skip it
                if (!box_contains_point(geom.bbox, p)) { continue; }
                // if geom is a single polygon, check if p is in it:
                if (geom.type === "Polygon") {
                    if (point_in_polygon(p, geom.arcs, arcs)) {
                        options.onMove(geom, p);
                        return;
                    }
                }
                // if geom is a single polygon, check if p is in any
                // of the polygons it contains
                if (geom.type === "MultiPolygon") {
                    var j;
                    for (j=0; j<geom.arcs.length; ++j) {
                        if (point_in_polygon(p, geom.arcs[j], arcs)) {
                            options.onMove(geom, p);
                            return;
                        }
                    }
                }
            }
        }
    });




    map.on('click', function(e) {
        var ll = e.latlng;
        var p = [ll.lng, ll.lat];
        var object_name = options.zoomLevelToClickLayerName(map.getZoom());
        var geoms, i, geom;
        if (object_name) {
            geoms = topo.objects[object_name].geometries;
            for (i=0; i<geoms.length; ++i) {
                geom = geoms[i];
                // if p is not in geom's bbox, skip it
                if (!box_contains_point(geom.bbox, p)) { continue; }
                // if geom is a single polygon, check if p is in it:
                if (geom.type === "Polygon") {
                    if (point_in_polygon(p, geom.arcs, arcs)) {
                        options.onClick(geom, p);
                        return;
                    }
                }
                // if geom is a single polygon, check if p is in any
                // of the polygons it contains
                if (geom.type === "MultiPolygon") {
// 06010105
                    var j;
                    for (j=0; j<geom.arcs.length; ++j) {
                        if (point_in_polygon(p, geom.arcs[j], arcs)) {
                            options.onClick(geom, p);
                            return;
                        }
                    }
                }
            }
        }
    });

    var CanvasLayer = L.CanvasLayer.extend({
        render: function() {
            var map = this._map;
            var canvas = this.getCanvas();
            var ctx = canvas.getContext('2d');
            // clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // an 'arc' is a JS array of vertices (each vertex being a JS [x,y] array)
            // 'arcs' is an array of arcs, computed above
            // a 'ring' is a JS array of indices into the 'arcs' array; negative indices
            //     indicate the ones-complement index in reverse order
            // for a Polygon, the 'arcs' property is an array of rings; the first is the
            //     polygon exterior, any additional ones are holes
            // for a MultiPolygon, the 'arcs' property is an array where each element is
            //     an array of rings representing a single polygon (possibly with holes)

            var bds = map.getBounds();
            var extent = [[bds.getWest(), bds.getEast()],[bds.getSouth(),bds.getNorth()]];


            var layerStyleFunctions = options.zoomLevelToLayerStyleFunctions(map.getZoom());

            var selectedPolygons = [];

            Object.keys(layerStyleFunctions).forEach(function(object_name) {
                var styleFunction = layerStyleFunctions[object_name];
                topo.objects[object_name].geometries.forEach(function(geom) {
                    var style = styleFunction(geom);
                    if (!style) { return; }
                    // only draw geoms whose bbox overlaps the current map extent
                    if (boxes_overlap(geom.bbox, extent)) {
                        if (geom.type === "Polygon") {
                            // geom.arcs is an array of rings representing a single polygon
                            renderPolygon(ctx, map, arcs, geom.arcs, style);
/*
                            if (geom.selected) {
                                selectedPolygons.push({polygon: geom.arcs, styleFunction: styleFunction(geom)});
                            }
*/
                        } else if (geom.type === "MultiPolygon") {
                            // geom.arcs is an array of polygons as above
                            geom.arcs.forEach(function(polygon) {
                                renderPolygon(ctx, map, arcs, polygon, style);
/*
                                if (geom.selected) {
                                    selectedPolygons.push({polygon: polygon, styleFunction: styleFunction(geom)});
                                }
*/
                            });
                        }
                    }
                });
            });

/*
            // redraw boundaries of selected geoms:
            selectedPolygons.forEach(function(polygon) {
                renderPolygon(ctx, map, arcs, polygon.polygon, polygon.styleFunction, {stroke: true});
            });
*/

        }
    });
    return new CanvasLayer();
};
