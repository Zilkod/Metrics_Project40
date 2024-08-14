/**
 * Client side REST-adapter for model
 *
 * @module lib/adapters/client_rest
 */

var Rest = require('rest-js').Rest;

var utils = require('utilities');
var model = require('../../index')
  , _baseConfig
  , _data = {};

_baseConfig = {
  instanceCacheLifetime: 5 * 60 * 1000 // 5 minutes instance cache
};

function urlizedModelName(name, plural)
{
  if (typeof plural === 'undefined') {
    var plural = true;
  }

  var urlized = utils.string.getInflection(name, 'constructor', plural ? 'plural' : 'singular');
  var urlized = utils.string.snakeize(urlized);

  if (urlized === 'person' && plural) {
    return 'people';
  }

  return urlized;
}

function camelizedModelName(name, plural)
{
  if (typeof plural === 'undefined') {
    var plural = true;
  }

  var camelized = utils.string.getInflection(name, 'constructor', plural ? 'plural' : 'singular');
  var camelized = utils.string.camelize(camelized);

  if (camelized === 'person' && plural) {
    return 'people';
  }

  return camelized;
}

function isObjectEmpty(obj)
{
  for(var attr in obj) {
    return false;
  }
  return true;
}

/**
 * @class Adapter
 * @param options
 * @constructore
 */
var Adapter = function (options) {
  var self = this;
  var opts = options || {}
    , config;

  this.name = 'rest';
  this.config = _baseConfig;
  this.client = null;
  this.cache = {};

  this.config.host = opts.host || null;
  this.config.username = opts.username || null;
  this.config.password = opts.password || null;
  this.config.camelize = opts.camelize || false;

  if (typeof opts.instanceCacheLifetime !== 'undefined') {
    this.config.instanceCacheLifetime = opts.instanceCacheLifetime;
  }

  this.restApi = new Rest(this.config.host, options);

  this.init = function () {};

  function getCachedItems(items)
  {
    var _items = [];
    var item;

    for(var i = 0; i < items.length; i++) {
      item = items[i];
      _items.push(getCachedItem(item));
    }

    return _items;
  }

  function getCachedItem(item)
  {
    if (!item.id) {
      return item;
    }

    if (!self.cache[item.type]) {
      self.cache[item.type] = {};
    }

    if (!self.cache[item.type][item.id]) {
      self.cache[item.type][item.id] = item;
      // create timeout to prevent memory leaks by items residing permanently in cache
      resetCacheTimeout(item.type, item.id);
    }
    else {
      resetCacheTimeout(item.type, item.id);

      self.cache[item.type][item.id].updateProperties(item.toJSON());
      self.cache[item.type][item.id]._saved = item._saved || false;
      self.cache[item.type][item.id].errors = item.errors || null;
    }

    return self.cache[item.type][item.id];
  }

  function resetCacheTimeout(type, id) {
    // don't cache if it's disabled
    if (!self.config.instanceCacheLifetime) {
      return;
    }

    var timeout = self.cache[type][id + '_timeout'] || null;

    if (timeout) {
      clearTimeout(timeout);
    }
    self.cache[type][id + '_timeout'] = setTimeout(function() {
      delete self.cache[type][id];
    }, self.config.instanceCacheLifetime);
  }

  function getItemsFromData(modelName, data)
  {
    var items = [];

    var inflections = utils.string.getInflections(modelName);
    if (inflections.filename.plural === 'persons') {
      inflections.filename.plural = 'people';
    }

    else if (data[inflections.filename.singular]) {
      items = [data[inflections.filename.singular]];
    }

    else if (data[inflections.filename.plural]) {
      items = data[inflections.filename.plural];
    }

    else if (data[inflections.property.singular]) {
      items = [data[inflections.property.singular]];
    }

    else if (data[inflections.property.plural]) {
      items = data[inflections.property.plural];
    }

    // in IE JSON parsed Arrays can become Objects
    if (typeof items.forEach !== 'function') {
      var _items = [];
      for(var i in items) {
        if (typeof items[i] === 'object') {
          _items.push(items[i]);
        }
      }
      items = _items;
    }

    return  items;
  }

  /**
   * @method load
   * @param {Object} query
   * @param {Function} callback
   */
  this.load = function (query, callback) {
    if (query.byId) {
      this.restApi.read(urlizedModelName(query.model.modelName) + '/' + query.byId, {}, onLoaded);
    }
    else {
      this.restApi.read(urlizedModelName(query.model.modelName), {
        query: isObjectEmpty(query.rawConditions) ? null : query.rawConditions,
        sort: query.opts.sort || null,
        limit: query.opts.limit || null,
        skip: query.opts.skip || null,
        nocase: (query.opts.nocase) ? true : false
      }, onLoaded);
    }

    function onLoaded(error, _data)
    {
      if (error) {
        callback(error, null);
        return;
      }

      if (_data['error']) {
        callback(new Error(_data['error']), null);
        return;
      }

      var _items = getItemsFromData(query.model.modelName, _data);

      var items = [];
      _items.forEach(function(itemData, i) {
        if (itemData) {
          var item = query.model.create(itemData);

          // insert all additional data, to be sure to have foreign keys too
          Object.keys(itemData).forEach(function(key) {
            if (typeof item[key] === 'undefined') {
              item[key] = itemData[key];
            }
          });

          item._saved = true;
          if ('errors' in itemData) item.errors = itemData.errors;
          items.push(item);
        }
      });

      items = getCachedItems(items);

      if (query.opts.limit === 1) {
        if (items.length > 0) {
          items = items[0];
        }
        else {
          items = null;
        }
      }

      if (items) {
        callback(null, (query.opts.count) ? items.length : items);
      }
      else {
        callback(null);
      }
    }
  };

  /**
   * @method update
   * @param {Object} data
   * @param {Object} query
   * @param {Function} callback
   */
  this.update = function (data, query, callback) {
    var _data = {};
    var urlizedName = urlizedModelName(data.type, false);
    var urlizedPluralName = urlizedModelName(data.type);
    var propName = this.config.camelize ? camelizedModelName(data.type, false) : urlizedModelName(data.type, false);
    _data[propName] = data.toJSON();

    this.restApi.update(urlizedModelName(data.type) + '/' + data.id, {
      data: _data
    }, onUpdated);

    function onUpdated(error, data)
    {
      if (error) {
        callback(error, data);
        return;
      }

      var _items = getItemsFromData(query.model.modelName, data);
      var item;

      if (_items.length) {
        var itemData = _items[0];

        item = query.model.create(itemData, { scenario: query.opts.scenario });

        // insert all additional data, to be sure to have foreign keys too
        Object.keys(itemData).forEach(function(key) {
          if (typeof item[key] === 'undefined') {
            item[key] = itemData[key];
          }
        });

        item._saved = true;
        if ('errors' in itemData) item.errors = itemData.errors;
        item.createdAt = new Date(itemData.createdAt);
      }

      callback(null, getCachedItem(item));
    }
  };

  /**
   * @method remove
   * @param {Object} query
   * @param {Function} callback
   */
  this.remove = function (query, callback) {
    if (query.byId) {
      this.restApi.remove(urlizedModelName(query.model.modelName) + '/' + query.byId, onRemoved);
    }
    else {
      this.restApi.remove(urlizedModelName(query.model.modelName), {
        query: isObjectEmpty(query.rawConditions) ? null : query.rawConditions,
        sort: query.opts.sort || null,
        limit: query.opts.limit || null,
        skip: query.opts.skip || null,
        nocase: (query.opts.nocase) ? true : false
      }, onRemoved);
    }

    function onRemoved(error, data)
    {
      if(error) {
        callback(error, data);
        return;
      }

      callback(null, data);
    }
  };

  /**
   * @method insert
   * @param {Object} data
   * @param {Object} opts
   * @param {Function} callback
   */
  this.insert = function (data, opts, callback) {
    var _data = {};
    var self = this;
    var items = Array.isArray(data) ? data.slice() : [data];
    var numItems = items.length;
    var itemsInserted = 0;

    items.forEach(_insert);

    function onInserted()
    {
      itemsInserted++;
      if (itemsInserted >= numItems) {
        callback(null, data);
      }
    }

    function _insert(data) {
      var propName = self.config.camelize ? camelizedModelName(data.type, false) : urlizedModelName(data.type, false);
      _data[propName] = data.toJSON();

      self.restApi.create(urlizedModelName(data.type), {
        data: _data
      }, onCreated);

      function onCreated(error, _data) {
        if (error) {
          callback(error, null);
          return;
        }

        if (_data['error']) {
          callback(new Error(_data['error']), null);
          return;
        }

        var items = getItemsFromData(data.type, _data);
        var resource = items.length > 0 ? items[0] : {};
        data.updateProperties(resource);

        // insert all additional data, to be sure to have foreign keys too
        Object.keys(resource).forEach(function(key) {
          if (typeof data[key] === 'undefined') {
            data[key] = resource[key];
          }
        });

        data._saved = true;
        if ('errors' in resource) data.errors = resource.errors;

        onInserted();
      }
    }
  }
};

module.exports.Adapter = Adapter;
