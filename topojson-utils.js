// This file contains a collection of functions that are useful for dealing
// with topojson data, including specifically rendering topojson objects
// on an HTML5 canvas.

// See https://github.com/mbostock/topojson/wiki for detailed information
// about the topojson data format.
//
// Note that this code does not use the actual topojson library -- it just
// makes use of the data format.

var tu = {};

// construct an HTML rgba string from values
function rgba(r,g,b,a) {
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}
tu.rgba = rgba;

// construct an HTML rgb string from values
function rgb(r,g,b) {
    return "rgb(" + r + "," + g + "," + b + ")";
}
tu.rgb = rgb;

// Yes it might run faster if I simply wrote ~x inline in the code, but
// the difference if any would be minimal, and I prefer the explicit
// reminder that ~ means ones complement:
function onesComplement(x) {
    return ~x;  // same as -x-1, but faster
}

function arcIndex(i) {
    if (i < 0) { return onesComplement(i); }
    return i;
}

// apply a topojson transform to a point
function transformPoint(topology, position) {
  position = position.slice();
  position[0] = position[0] * topology.transform.scale[0] + topology.transform.translate[0];
  position[1] = position[1] * topology.transform.scale[1] + topology.transform.translate[1];
  return position;
};

// decode a topojson arc; returns a nested array of lon/lat coordinates
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

// Make the appropriate sequence of HTML5 canvas context moveTo() and lineTo()
// calls for tracing out the i-th arc in a topojson object.
function walkArc(topo, i, map, ctx, first) {
    var j, k, reversed, p, pp;
    if (i >= 0) {
        j = i;
        reversed = false;
    } else {
        j = onesComplement(i);
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
tu.walkArc = walkArc;

// depth-first traversal of a nested array of numbers: run the function
//   f on every number in the array, recursing depth-first.
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

// compute and return the bounding box for a topojson geom object g
function geomBBox(g, topo) {
    var bbox = [[null,null],[null,null]];
    dfs(g.arcs, function(i) {
        var arc = topo.decodedArcs[(i >= 0) ? i : onesComplement(i)];
        arc.forEach(function(p) {
            if (bbox[0][0] === null || p[0] < bbox[0][0]) { bbox[0][0] = p[0]; }
            if (bbox[0][1] === null || p[0] > bbox[0][1]) { bbox[0][1] = p[0]; }
            if (bbox[1][0] === null || p[1] < bbox[1][0]) { bbox[1][0] = p[1]; }
            if (bbox[1][1] === null || p[1] > bbox[1][1]) { bbox[1][1] = p[1]; }
        });
    });
    return bbox;
}

tu.geomBBox = geomBBox;


// test whether two boxes overlap
function boxesOverlap(a,b) {
    return !(((a[0][0] < b[0][0]) && (a[0][1] < b[0][0]))
             ||
             ((a[0][0] > b[0][1]) && (a[0][1] > b[0][1]))
             ||
             ((a[1][0] < b[1][0]) && (a[1][1] < b[1][0]))
             ||
             ((a[1][0] > b[1][1]) && (a[1][1] > b[1][1])));
}
tu.boxesOverlap = boxesOverlap;

// test whether a box contains a point
function boxContainsPoint(box,p) {
    return (p[0] >= box[0][0]) && (p[0] <= box[0][1]) && (p[1] >= box[1][0]) && (p[1] <= box[1][1]);
}
tu.boxContainsPoint = boxContainsPoint;

// A 'seq' is an object that produces a sequence of items (aka 'iterator').
// It has a 'next' method which gives the next item, and a 'hasNext' method
// that says whether there are any more items.

// Here's an 'emtpy' seq object:
var emptySeq = {
    next: function() { return undefined; },
    hasNext: function() { return false; }
};

// A 'vArray' is an object that acts like an arc in the 'arcs' array,
// in the sense that it consists of an array of vertices.
// It has one function and one property:
//   get(j): return the j-th vertex of the arc
//   length: the number of vertices in the arc
// The input argument i indicates which arc in the 'arcs' array to use;
// negative values of i mean the ones-complement position in reverse order
function vArray(i, arcs) {
    var reversed, a, len;
    if (i >= 0) {
        reversed = false;
        a = arcs[i];
    } else {
        reversed = true;
        a = arcs[onesComplement(i)];
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

// Return a sequence of vArrays for the nondegenerate arcs in a ring, unless the ring only
// contains degenerate arcs, in which case return a sequence containing a vArray for just
// the first degenerate arc from the ring.  Ignores all empty arcs.
function ringVArraySeq(ring, arcs) {
    // ring = [432, 143, 223, ..., 4323]   (array of integers indices into the 'arcs' array)
    var vArrays = ring.map(function(i) { return vArray(i,arcs); });
    var nonemptyVArrays = vArrays.filter(function(va) { return va.length > 0; });
    if (nonemptyVArrays.length === 0) { return emptySeq; }
    var nondegenerateVArrays = nonemptyVArrays.filter(function(va) { return va.length > 1; });
    // remove degenerate arcs from ring, or set it an array of the first degenerate one
    // if they are all degenerate:
    vArrays = (nondegenerateVArrays.length > 0) ? nondegenerateVArrays : [nonemptyVArrays[0]];
    var ri = -1;
    return {
        next: function() {
            if (this.hasNext()) {
                ++ri;
                return vArrays[ri];
            }
            return undefined;
        },
        hasNext: function() {
            return (ri+1 < vArrays.length);
        }
    };
}

// Return a seq of the vertices in a ring; each vertex occurs in the seq exactly once.
// (Closing vertices are omitted --- the last vertex in the seq is NOT the same as the first.)
function ringVertexSeq(ring, arcs) {
    var arcSeq = ringVArraySeq(ring, arcs);
    var currentVArray = arcSeq.next();
    var ai = -1;
    // the 'next' vertex in the seq is the one at position ai+1 in the current vArray (arc),
    // unless position ai+1 is the last vertex of that arc (in which case we advance
    //   to the next arc if there is one)
    // or unless there is no current arc
    return {
        next: function() {
            if (currentVArray === undefined) { return undefined; }
            ++ai;
            if (ai < currentVArray.length-1) {
                return currentVArray.get(ai);
            }
            currentVArray = arcSeq.next();
            ai = -1;
            return this.next();
        },
        hasNext: function() {
            if (currentVArray === undefined) { return false; }
            if (ai < currentVArray.length-2) { return true; }
            return arcSeq.hasNext();
        }
    };
}

// s is a 'seq' object containing [s0, s1, s2, ..., sN]
// return a new seq object which contains [s0, s1, s2, ..., sN, s0]
// i.e. tacks a copy of s0 onto the end
function closeSeq(s) {
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
function isPointInRing(v, ring, arcs) {
    var vs = closeSeq(ringVertexSeq(ring, arcs));
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
function isPointInPolygon(v, rings, arcs) {
    if (rings.length === 0) { return false; }
    // v must be in exterior ring
    if (!isPointInRing(v, rings[0], arcs)) { return false; }
    // and must not be in any interior ring
    var i;
    for (i=1; i<rings.length; ++i) {
        if (isPointInRing(v, rings[i], arcs)) { return false; }
    }
    return true;
}

// Test whether a point is in a Polygon or MultiPolygon
function isPointInGeom(p, geom, topo) {
    // if geom is a single polygon, check if p is in it:
    if (geom.type === "Polygon") {
        if (isPointInPolygon(p, geom.arcs, topo.decodedArcs)) {
            return true;
        }
    }
    // if geom is a MultiPolygon, check if p is in any
    // of the polygons it contains
    if (geom.type === "MultiPolygon") {
        var j;
        for (j=0; j<geom.arcs.length; ++j) {
            if (isPointInPolygon(p, geom.arcs[j], topo.decodedArcs)) {
                return true;
            }
        }
    }
    return false;
}
tu.isPointInGeom = isPointInGeom;

module.exports = tu;
