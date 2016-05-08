//
// URL utility object
// 
// Call this function to create a URL utility object.  Returns an object containing properties
// that make it convenient to access and/or construct parts of a URL.
// 
// For example:
// 
//     // accessing parts of an existing URL:
//     var url = URL({url: "http://www.example.com/look/ma?x=no&y=hands"});
//     console.log(url.baseurl);    // ==> "http://www.example.com/look/ma"
//     console.log(url.params);     // ==> { 'x' : 'no', 'y' : 'hands' }
//     console.log(url.toString()); // ==> "http://www.example.com/look/ma?x=no&y=hands"
// 
//     // constructing a new url:
//     var url = URL({baseurl: "http://www.example.com/look/ma"});
//     url.params.x = 42;
//     url.params.y = 101;
//     url.params.fred = 'yes';
//     console.log(url.toString()); // ==> "http:www.example.com/look/ma?x=42&y=101&fred=yes"
//
function URL(options) {
    var paramstring, params, url, i, name, value;
    var obj = {
        'params' : {},
        'baseurl' : null,
        'toString' : function() {
            var prop, vals = [];
            for (prop in obj.params) {
                vals.push(prop + '=' + obj.params[prop]);
            }
            return obj.baseurl + '?' + vals.join("&");
        }
    };

    if ('url' in options) {
        url = options.url;

        i = url.indexOf('?');
        if (i < 0) {
            obj.baseurl = url;
            paramstring = "";
        } else {
            obj.baseurl = url.substring(0,i);
            paramstring = url.substring(i+1); // Remove everything up to and including the first '?' char.
        }

        if (paramstring.length > 0) {
            paramstring.split('&').forEach(function(c) {
                i = c.indexOf('=');
                if (i >= 0) {
                    name = c.substring(0,i);
                    value = c.substring(i+1);
                } else {
                    name = c;
                    value = null;
                }
                obj.params[name] = value;
            });
        }
    } else if ('baseurl' in options) {
        url = options.baseurl;
        i = url.indexOf('?');
        if (i < 0) {
            obj.baseurl = url;
        } else {
            obj.baseurl = url.substring(0,i);
        }
    }

    return obj;
}

module.exports = URL;
