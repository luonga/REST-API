const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const boats = require('./boats.js');
const ds = require('./datastore');

const datastore = ds.datastore;

const LOAD = "Load";
const BOAT = "Boat";

router.use(bodyParser.json());

/* ------------- Begin load Model Functions ------------- */

function post_load(volume, item, creation_date) {
  const key = datastore.key(LOAD);
  const new_load = {
    "volume": volume,
    "item": item,
    "carrier": null,
    "creation_date": creation_date
  };
  return datastore.save({ "key": key, "data": new_load }).then(() => { return key });
}

function getLoad(id) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      return entity;
    } else {
      return entity.map(ds.fromDatastore);
    }
  });
}

function get_loads(req) {
  let q = datastore.createQuery(LOAD).limit(5);
  const results = {};
  if (Object.keys(req.query).includes("cursor")) {
    const prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
    q = q.start(req.query.cursor);
  }
  return datastore.runQuery(q).then((entities) => {
    results.loads = entities[0].map(ds.fromDatastore);
    if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
      results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }
    return results;
  });
}

function put_load(id, volume, item, creation_date) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  const load = { "volume": volume, "item": item, "creation_date": creation_date };
  return datastore.save({ "key": key, "data": load });
}

function delete_load(id) {
  const key = datastore.key([LOAD, parseInt(id, 10)]);
  return datastore.get(key)
    .then((load) => {
      if (load[0] === undefined) {
        return undefined;
      }
      if (load[0].carrier[0] !== undefined) {
        const bid = load[0].carrier[0].id;
        return remove_load(bid, id);
      }
      return datastore.delete(key);
    });
}

function remove_load(bid, lid) {
  const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
  const l_key = datastore.key([LOAD, parseInt(lid, 10)]);

  keys = [b_key, l_key];
  return datastore.get(keys)
    .then((results) => {
      const boat = results[0][0];
      const load = results[0][1];

      const index = boat.loads.findIndex(item => item.id === lid);

      if (index === -1) {
        return datastore.delete(l_key);
      }

      load.carrier = null;
      datastore.save({ key: l_key, data: load });
      datastore.delete(l_key);

      boat.loads.splice(index, 1);
      datastore.save({ key: b_key, data: boat });

      return datastore.delete(l_key);
    });
}
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', function(req, res) {
    get_loads(req)
      .then(loads => {
        res.status(200).json({ loads: loads.loads, next: loads.next });
      });
  });
  
router.get('/:id', function(req, res) {
    const self_url = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.id;
    getLoad(req.params.id, self_url)
      .then(load => {
        if (load[0] === undefined || load[0] === null) {
          res.status(404).json({ 'Error': 'No load with this load_id exists' });
        } else if (load[0].carrier && load[0].carrier[0]) {
          load[0].carrier = {
            id: load[0].carrier[0].id,
            self: req.protocol + "://" + req.get("host") + "/boats" + "/" + load[0].carrier[0].id,
          };
          load[0].self = self_url;
          res.status(200).json(load[0]);
        } else {
          load[0].carrier = null;
          load[0].self = self_url;
          res.status(200).json(load[0]);
        }
      });
  });
  
router.post('/', function(req, res) {
    if (req.body.volume === undefined || req.body.item === undefined || req.body.creation_date === undefined) {
      res.status(400).json({ 'Error': 'The request object is missing at least one of the required attributes' });
    } else {
      const self_url = req.protocol + "://" + req.get("host") + req.baseUrl + "/";
      post_load(req.body.volume, req.body.item, req.body.creation_date)
        .then(key => {
          res.status(201).json({
            id: key.id,
            item: req.body.item,
            volume: req.body.volume,
            creation_date: req.body.creation_date,
            carrier: null,
            self: self_url + key.id
          });
        });
    }
  });
  
router.put('/:id', function(req, res) {
    put_load(req.params.id, req.body.volume)
      .then(() => {
        res.status(200).end();
      });
  });
  
router.delete('/:id', function(req, res) {
    delete_load(req.params.id)
      .then(result => {
        if (result === undefined) {
          res.status(404).json({ 'Error': "No load with this load_id exists" });
        } else {
          res.status(204).send(result);
        }
      });
  });
  
  /* ------------- End Controller Functions ------------- */
  
  module.exports = router;
  module.exports.getLoad = getLoad;
  module.exports.delete_load = delete_load;
  
