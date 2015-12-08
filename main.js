var Sass = require ("$sass.js");
var css = require("$css");
var loader = require("@loader");
var isNode = typeof process === "object" && {}.toString.call(process) ===
    "[object process]";

exports.instantiate = css.instantiate;
exports.buildType = "css";

exports.translate = function(load){
  var base = dir(load.address);
  var imports = getImports(load.source);

  return getSass(this).then(function(sass){
    if(!isNode) {
      sass.importer(function (req, done) {
        console.log("Requesting", req.resolved);
        done();
      });
      return preload(sass, base, imports);
    }
    return sass;
  }).then(function(sass){
    return new Promise(function(resolve){
      sass.compile(load.source, function(result){
        console.log("It took", (Date.now() - sass.startTime), "seconds to process");
        resolve(result.text);
      })
    });
  });
};

function dir(path){
  var parts = path.replace(/https?:\/\/[^\/]+\//, "").split("/");
  parts.pop();
  return parts.join("/");
}

var importExp = /@import.+?['"](.+?)['"]/g;
function getImports(source){
  var imports = [];
  source.replace(importExp, function(whole, imp){
    imports.push(imp);
  });
  return imports;
}

function preload(sass, base, files) {
  if(!files.length) return Promise.resolve(sass);

  var stack = [];
  for (var i = 0, l = files.length; i < l; i++) {
    (function (file) {
      if ( !/\.scss$/.test(file) ) {
        var parts = file.split("/");
        parts.push("_" + parts.pop() + ".scss");
        file = parts.join("/");
      }

      if ( !/node_modules/.test(file) && file.indexOf(base) !== 0 ) {
        file = base + "/" + file;
      }
      
      stack.push(
        loader.normalize(file, base).then(function (name) {
          return Promise.resolve(loader.locate({ name: name, metadata: {} })).then(function (url) {
            return loader.fetch({ name: name, address: url, metadata: {} }).then(function (result) {
              var imports = getImports(result);
              sass.writeFile(name.split("!")[0], result);
              return preload(sass, dir(url), imports);
            });
          });
        })
      );
    }(files[i]));
  }

  return Promise.all(stack).then(function () {
    return sass;
  });
}

var getSass = (function(){
  if(isNode) {
    return function(loader){
      var np = Promise.resolve(loader.normalize("sass.js/dist/sass.sync", "steal-sass"));
      return np.then(function(name){
        return Promise.resolve(loader.locate({ name: name }));
      }).then(function(url){
        var oldWindow = global.window;
        delete global.window;
        var sass = loader._nodeRequire(url.replace("file:", ""));
        global.window = oldWindow;
        getSass = function() { return Promise.resolve(sass); };
        return sass;
      });
    };
  }

  return function(loader){
    var np = Promise.resolve(loader.normalize("sass.js/dist/sass.worker", "steal-sass"));
    return np.then(function(name){
      return Promise.resolve(loader.locate({ name: name }));
    }).then(function(url){
      var sass = new Sass(url);
      sass.startTime = Date.now();
      getSass = function() { return Promise.resolve(sass); };
      return sass;
    });
  };
})();
