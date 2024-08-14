
var adapters
  , path = require('path')
  , _aliases
  , _adapters
  , _paths;

_aliases = {
  postgres: 'postgres'
, pg: 'postgres'
, postgresql: 'postgres'
, mysql: 'mysql'
, sqlite: 'sqlite'
, rest: 'rest'
, riak: 'riak'
, mongo: 'mongo'
, mongodb: 'mongo'
, memory: 'memory'
, filesystem: 'filesystem'
, level: 'level'
};

_adapters = {
  postgres: {
    path: 'sql/postgres'
  , lib: 'pg'
  , type: 'sql'
  }
, mysql: {
    path: 'sql/mysql'
  , lib: 'mysql'
  , type: 'sql'
  }
, sqlite: {
    path: 'sql/sqlite'
  , lib: 'sqlite3'
  , type: 'sql'
  }
, rest: {
    path: 'rest/index'
  , lib: null
  , type: 'nosql'
  }
, riak: {
    path: 'riak/index'
  , lib: null
  , type: 'nosql'
  }
, mongo: {
    path: 'mongo/index'
  , lib: 'mongodb'
  , type: 'nosql'
  }
, memory: {
    path: 'memory/index'
  , lib: null
  , type: 'nosql'
  }
, filesystem: {
    path: 'filesystem/index'
  , lib: null
  , type: 'nosql'
  }
, level: {
    path: 'level/index'
  , lib: 'level'
  , type: 'nosql'
  }
};

for (var p in _adapters) {
  _adapters[p].name = p;
}

adapters = new (function () {

  this.getAdapterInfo = function (adapter) {
    var canonical = _aliases[adapter]
      , adapter = _adapters[canonical];
    return adapter || null;
  };

  this.create = function (name, config) {
    var info = this.getAdapterInfo(name)
      , ctor;

    if (!info) {
      throw new Error('"' + name + '" is not a valid adapter.');
    }

    ctor = require('./' + info.path).Adapter;

    return new ctor(config || {});
  };

})();

module.exports = adapters;
