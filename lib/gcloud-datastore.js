var _      = require('lodash');
var assert = require('assert');
var util   = require('util');

// Require the google cloud connector
var datastore = require('@google-cloud/datastore');

// Require the base Connector class
var Connector = require('loopback-connector').Connector;

// Require the debug module with a pattern of loopback:connector:connectorName
var debug = require('debug')('loopback:connector:gcloud-datastore');

/**
 * Initialize the  connector against the given data source
 *
 * @param {DataSource} dataSource The loopback-datasource-juggler dataSource
 * @param {Function} [callback] The callback function
 */
exports.initialize = function initializeDataSource(dataSource, callback) {
   dataSource.connector = new GcloudDataStoreConnector(dataSource.settings);

   if (callback) {
      callback();
   }
};

exports.GcloudDataStoreConnector = GcloudDataStoreConnector;

/**
 * Define the basic connector
 */
function GcloudDataStoreConnector(settings) {
   // Call the super constructor with name and settings
   Connector.call(this, 'gcloud-datastore', settings);

   // Store properties
   this.dataset = datastore({
      projectId  : settings.projectId,
      keyFilename: settings.keyFilename || undefined,
      email      : settings.email || undefined,
      namespace  : settings.namespace || undefined
   });
}

// Set up the prototype inheritence
util.inherits(GcloudDataStoreConnector, Connector);

GcloudDataStoreConnector.prototype.relational = false;

GcloudDataStoreConnector.prototype.getTypes = function () {
   return ['db', 'nosql', 'gcloud-datastore'];
};

GcloudDataStoreConnector.prototype.connect = function (callback) {
   if (callback) {
      callback();
   }
};

GcloudDataStoreConnector.prototype.disconnect = function (callback) {
   if (callback) {
      callback();
   }
};

GcloudDataStoreConnector.prototype.toDatabaseData = function (model, data) {
   var definition = this.getModelDefinition(model);
   var properties = definition.properties;

   return _.map(data, function (data, name) {
      var property = properties[name];
      var excluded = property ? property.index === false : true;

      return {
         name              : name,
         value             : data,
         excludeFromIndexes: excluded
      };
   });
};

GcloudDataStoreConnector.prototype.all = function (model, filter, callback) {
   this.find(model, filter, callback);
};

GcloudDataStoreConnector.prototype.find = function (model, filter, callback) {
   debug('find: %s %s', model, JSON.stringify(filter));

   // Setup
   var idName = this.idName(model);
   var ds     = this.dataset;
   var query  = ds.createQuery(model);



   // Define the filter support
   var filterClause = function (data, name) {

     debug('filterClause: %s %s', JSON.stringify(data), name);

      // Sanity check
      data = data === undefined || data === null ? "" : data;

      // filter by key
      if ('model' == name) {
         debug('find: adding filter __key__ = %s', data);

         var key = ds.key([model, data]);
         if (!isNaN(data)) {
            key = ds.key([model, Number(data)]);
         }

         query = query.filter('__key__', key);
      }
      else if ('and' === name) {
         _.each(data, function (where) {
            _.each(where, filterClause);
         });
      }
      else if ('or' === name) {
         debug('find: UNSUPPORTED OR CLAUSE %s', JSON.stringify(data));
      }
      else {
         debug('find: adding filter %s = %s', name, JSON.stringify(data));
         query = query.filter(name, data);
      }

      /*
      // filter by key
      if (idName == name) {
         debug('find: adding filter __key__ = %s', data);

         var key = ds.key([model, data]);
         if (!isNaN(data)) {
            key = ds.key([model, Number(data)]);
         }

         query = query.filter('__key__', key);
      }
      else if ('and' === name) {
         _.each(data, function (where) {
            _.each(where, filterClause);
         });
      }
      else if ('or' === name) {
         debug('find: UNSUPPORTED OR CLAUSE %s', JSON.stringify(data));
      }
      else {
         debug('find: adding filter %s = %s', name, JSON.stringify(data));
         query = query.filter(name, data);
      }
      */
   };


   // Where clauses (including filtering on primary key)
   _.each(filter.where, filterClause);

/*
   // Limit, Offset restrictions
   if (undefined !== filter.limit) {
      debug('find: adding limit %d', filter.limit);
      query = query.limit(filter.limit);
   }

   if (undefined !== filter.offset) {
      debug('find: adding offset %d', filter.offset);
      query = query.offset(filter.offset);
   }
*/

   // Show it
   debug('find: execute query %s', JSON.stringify(query));

   // Run the query
   ds.runQuery(query, function (errors, result, info) {
      debug('find: results %s', JSON.stringify(errors || result));

      if (callback === null || callback === undefined) {
         return;
      }

      if (errors) {
         return callback(errors);
      }
      // Done
      callback(null, _.map(result, function (entity) {
         if(entity[idName] === null || entity[idName] === undefined) {
            entity[idName] = entity[ds.KEY].id;
         }
         return entity;
      }));
   });
};

GcloudDataStoreConnector.prototype.findById = function (model, id, callback) {
   debug('findById: ', model, id);

   var idName  = this.idName(model);
   //debug('find')
   var filters = {
      where: {},
      limit: 1
   };

   filters.where[idName] = id;
   return _.first(this.find(model, filters, callback));
};

GcloudDataStoreConnector.prototype.create = function (model, data, options, callback) {
   debug('create: %s %s %s', model, JSON.stringify(data), JSON.stringify(options));
   assert(data, 'Cannot save an empty entity into the database');

   // Setup
   var idName = this.idName(model);
   var id     = data[idName];
   var ds     = this.dataset;
   var key, definition;

   // Is there already an ID set for insert?
   if (id) {
      debug('create: using preset: %s %s', idName, id);
      if (!isNaN(id)) {
         id = Number(id);
      }
      key = ds.key([model, id]);
   }
   else {
      debug('create: no ID found on %s, will be auto-generated on insert', idName);
      key = ds.key(model);
   }

   // Exclude invalid properties if the model is defined as strict
   definition = this.getModelDefinition(model);

   if (definition.strict === true) {
      data = _.pick(data, _.keys(definition.properties));
   }

   // Convert to a proper DB format, with indexes off as needed
   data = this.toDatabaseData(model, data);

   // Update the data
   debug('create: execute %s', JSON.stringify(data));

   ds.save({
      key : key,
      data: data
   }, function (errors, result) {
      debug('create: result %s', JSON.stringify(errors || result));

      if (callback === null || callback === undefined) {
         return;
      }

      if (errors) {
         return callback(errors);
      }

      if (!key.path) {
         return callback('Internal error: missing key.path');
      }

      if (!key.path[1]) {
         return callback('Internal error: missing key.path[1]');
      }

      // Done
      callback(null, key.path[1]);
   });
};

GcloudDataStoreConnector.prototype.updateAttributes = function (model, id, data, options, callback) {
   debug('updateAttributes: %s %s %s %s', model, id, JSON.stringify(data), JSON.stringify(options));
   assert(id, 'Cannot update an entity without an existing ID');

   // For future reference
   var idName = this.idName(model);
   var ds     = this.dataset;
   if (!isNaN(id)) {
      id = Number(id);
   }
   var key        = ds.key([model, id]);
   var definition = this.getModelDefinition(model);
   var self       = this;

   // Find the existing data
   debug('updateAttributes: fetching pre-existing data first...');

   this.findById(model, id, function (errors, original) {
      if (errors) {
         return callback(errors, null);
      }

      // Exclude invalid properties
      if (definition.strict === true) {
         data = _.pick(data, _.keys(definition.properties));
      }

      // Merge in new data over the old data
      data = _.merge(original[0], data);

      // Delete the entityId from the incoming data if present
      data = _.omit(data, idName);

      // Convert to a proper DB format, with indexes off as needed
      data = self.toDatabaseData(model, data);

      // Showcase
      debug('updateAttributes: execute %s', JSON.stringify(data));

      // Update the data
      ds.save({
         key : key,
         data: data
      }, function (errors, result) {
         debug('updateAttributes: result %s', JSON.stringify(errors || result));

         if (callback === null || callback === undefined) {
            return;
         }

         if (errors) {
            return callback(errors);
         }

         // Done
         callback(null, id);
      });
   });
};

/**
 * Delete all matching model instances
 *
 * https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.15.0/datastore/dataset?method=delete
 *
 * @param {String} model The model name
 * @param {Object} where The where object
 * @param {Object} options The options object
 * @param {Function} callback The callback function
 */
GcloudDataStoreConnector.prototype.destroyAll = function (model, where, options, callback) {
   debug('destroyAll: %s %s %s', model, JSON.stringify(where), JSON.stringify(options));

   // Setup
   var idName = this.idName(model);
   var id     = where[idName];
   var ds     = this.dataset;
   if (!isNaN(id)) {
      id = Number(id);
   }
   var key = ds.key([model, id]);

   // Update the data
   debug('destroyAll: execute %s', JSON.stringify(key));

   ds.delete(key, function (errors, result) {
      debug('destroyAll: result %s', JSON.stringify(errors || result));

      if (callback === null || callback === undefined) {
         return;
      }

      if (errors) {
         return callback(errors);
      }

      // Done
      callback(null, null);
   });
};

GcloudDataStoreConnector.prototype.destroy = function (model, id, options, callback) {
   debug('destroy: %s %s %s', model, JSON.stringify(id), JSON.stringify(options));

   // Setup
   var idName = this.idName(model);
   var ds     = this.dataset;
   if (!isNaN(id)) {
      id = Number(id);
   }
   var key = ds.key([model, id]);

   // Update the data
   debug('destroy: execute %s', JSON.stringify(key));

   ds.delete(key, function (errors, result) {
      debug('destroy: result %s', JSON.stringify(errors || result));
      if (callback === null || callback === undefined) {
         return;
      }

      if (errors) {
         return callback(errors);
      }

      // Done
      callback(null, null);
   });
};

/**
 * Count all the records in the dataset that match.
 *
 * Since (in loopback) this method is called with an explicity where clause that
 * restricts the search to a single record by ID, the result of this call will only
 * ever be a 0 (not found) or a 1 (found).
 *
 * @param {String} model The model name
 * @param {Object} where The where clause
 * @param {Object} options The options object
 * @param {Function} callback The callback function
 * @return {Number} The total size of the result set found.
 */
GcloudDataStoreConnector.prototype.count = function (model, where, options, callback) {
   debug('count: %s %s %s', model, JSON.stringify(where), JSON.stringify(options));

   // Setup
   var idName = this.idName(model);

   // Redirect
   debug('count: redirecting to find...');

   return this.find(model, {
      where: where
   }, function (errors, result) {
      debug('count: result %s', JSON.stringify(errors || result));

      if (callback === null || callback === undefined) {
         return;
      }

      if (errors) {
         return callback(errors);
      }

      // Done
      callback(errors, Number(_.size(result || [])));
   });
};

module.exports = GcloudDataStoreConnector;
